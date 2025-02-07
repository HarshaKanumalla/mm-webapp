const functions = require('firebase-functions');
const admin = require('firebase-admin');
const twilio = require('twilio');
const { OpenAIApi, Configuration } = require('openai');
const { onObjectFinalized } = require('firebase-functions/v2/storage');


admin.initializeApp();

// Initialize Twilio clients for both WhatsApp and SMS
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);


// Initialize Vision API with error handling
let vision;
try {
    vision = new (require('@google-cloud/vision').ImageAnnotatorClient)();
} catch (error) {
    console.error('Error initializing Vision API client:', error);
}

const STATES = {
  START: 'START',
  GETTING_NAME: 'GETTING_NAME',
  COLLECTING_NAME: 'COLLECTING_NAME',
  COLLECTING_PHONE: 'COLLECTING_PHONE',
  COLLECTING_LOCATION: 'COLLECTING_LOCATION',
  COLLECTING_DESCRIPTION: 'COLLECTING_DESCRIPTION',
  COLLECTING_IMAGE: 'COLLECTING_IMAGE',
  AWAITING_BOX_ARRIVAL: 'AWAITING_BOX_ARRIVAL',
  WAITING_FOR_CODE: 'WAITING_FOR_CODE',
  CONVERSATION: 'CONVERSATION'
};

const VERIFICATION_CODE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds


const COMPANY_INFO = {
  mm_description: `Missing Matters is a revolutionary lost and found management platform that streamlines the entire process of recovering lost items. Our system uses advanced AI-powered matching algorithms and a secure network of smart boxes to safely store and return items to their rightful owners.

Key features of our platform include:
- AI-powered item matching system
- Secure smart box network across multiple locations
- Real-time tracking and notifications
- Verified item recovery process
- Integration with major venues and facilities`,

  pmatts_description: `PMatts is a leading technology innovation company transforming businesses through cutting-edge solutions in smart infrastructure, digital transformation, and security systems. Through our innovation arm, PMatts Catalysts, we're pioneering advancements in AI, ML, IoT, and blockchain technology.

Our solutions deliver measurable impact:
- 40% reduction in operational costs
- 60% improvement in process efficiency
- 75% increase in automation coverage
- 30% energy savings across implementations
- 90% enhancement in security threat detection`
};

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function storeVerificationCode(phoneNumber, code, boxId) {
  const verificationCodesRef = admin.database().ref('verificationCodes');
  const timestamp = Date.now();
  
  await verificationCodesRef.push({
    phoneNumber,
    code,
    boxId,
    timestamp,
    used: false
  });
  
  setTimeout(async () => {
    const snapshot = await verificationCodesRef
      .orderByChild('timestamp')
      .equalTo(timestamp)
      .once('value');
    
    snapshot.forEach((child) => {
      if (!child.val().used) {
        child.ref.remove();
      }
    });
  }, VERIFICATION_CODE_DURATION);
}

async function sendVerificationCode(phoneNumber, code) {
  try {
    await twilioClient.messages.create({
      body: `Your Missing Matters verification code is: ${code}. This code will expire in 10 minutes.`,
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER
    });
    return true;
  } catch (error) {
    console.error('Error sending SMS:', error);
    return false;
  }
}

async function verifyCode(phoneNumber, enteredCode) {
  const verificationCodesRef = admin.database().ref('verificationCodes');
  const snapshot = await verificationCodesRef
    .orderByChild('phoneNumber')
    .equalTo(phoneNumber)
    .once('value');
  
  let isValid = false;
  let boxId = null;
  let codeRef = null;
  
  snapshot.forEach((child) => {
    const verification = child.val();
    if (
      verification.code === enteredCode &&
      !verification.used &&
      Date.now() - verification.timestamp < VERIFICATION_CODE_DURATION
    ) {
      isValid = true;
      boxId = verification.boxId;
      codeRef = child.ref;
    }
  });
  
  if (isValid && codeRef) {
    await codeRef.update({ used: true });
    return { isValid, boxId };
  }
  
  return { isValid, boxId: null };
}

async function triggerBoxUnlock(boxId, phoneNumber) {
  const boxCommandsRef = admin.database().ref(`boxCommands/${boxId}`);
  await boxCommandsRef.set({
    command: 'unlock',
    timestamp: admin.database.ServerValue.TIMESTAMP,
    triggeredBy: phoneNumber
  });
}

async function getPersonalizedAIResponse(userQuery, userName = '', sessionContext = '') {
  try {
    const systemPrompt = `You are a friendly and professional AI assistant for PMatts and Missing Matters, named Emma. Your role is to engage in helpful conversations while providing accurate information about our companies and services.

Key Points about Missing Matters:
${COMPANY_INFO.mm_description}

Key Points about PMatts:
${COMPANY_INFO.pmatts_description}

Guidelines for responses:
1. Address the user by name (${userName}) if provided
2. Maintain a warm, conversational tone while staying professional
3. Show genuine interest in user queries
4. Ask relevant follow-up questions to better understand needs
5. Provide specific, actionable information
6. Keep responses concise but informative
7. If asked about topics outside our scope, politely redirect
8. End responses with an engaging question when appropriate

Previous conversation context:
${sessionContext}`;

    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userQuery
        }
      ],
      max_tokens: 400,
      temperature: 0.7,
      presence_penalty: 0.6,
      frequency_penalty: 0.3
    });

    let response = completion.data.choices[0].message.content;
    response = response.replace(/\n\n+/g, '\n\n').trim();
    
    return response;
  } catch (error) {
    console.error('OpenAI API error:', error);
    return getFallbackResponse(userQuery, userName);
  }
}

function getFallbackResponse(query, userName = '') {
  const greeting = userName ? `Hello ${userName}! ` : 'Hello! ';
  
  if (query.toLowerCase().includes('missing matters')) {
    return `${greeting}${COMPANY_INFO.mm_description}\n\nIs there anything specific about our lost and found system you'd like to know more about?`;
  } else if (query.toLowerCase().includes('pmatts')) {
    return `${greeting}${COMPANY_INFO.pmatts_description}\n\nWhich aspect of our technology solutions interests you the most?`;
  }
  
  return `${greeting}Welcome to PMatts and Missing Matters! We're here to help you with our innovative solutions.

For more information, please visit:
- PMatts: www.pmatts.com
- PMatts Catalysts: www.pmattscatalysts.com
- Missing Matters: www.missingmatters.com

How may I assist you today?`;
}

function getWelcomeMessage() {
  return `Hi there! I'm Emma, your AI assistant for PMatts and Missing Matters. Before we begin, I'd love to know your name so I can better assist you. What should I call you?`;
}

function getInitialOptions(userName) {
  return `Great to meet you, ${userName}! How can I help you today?

1. Report a lost item
2. Learn about PMatts and Missing Matters

You can also ask me anything specific about our services!`;
}

async function processQuery(incomingMessage, userName = '', userContext = '') {
  const message = incomingMessage.toLowerCase().trim();
  
  if (message.includes('pmatts') || 
      message.includes('missing matters') ||
      message === '2' ||
      message.includes('solution') ||
      message.includes('innovation') ||
      message.includes('impact') ||
      message.includes('help') ||
      message.includes('tell me more') ||
      message.includes('what') ||
      message.includes('how') ||
      message.includes('why') ||
      message.includes('who') ||
      message.includes('where') ||
      message.includes('when')) {
    return await getPersonalizedAIResponse(incomingMessage, userName, userContext);
  }
  
  return getInitialOptions(userName);
}

async function storeLostReport(data) {
  const reportsRef = admin.database().ref('lost_reports');
  await reportsRef.push({
    ...data,
    timestamp: admin.database.ServerValue.TIMESTAMP
  });
}

async function findMatchingItems(lostItemDescription) {
  try {
    const responsesRef = admin.database().ref('responses');
    const snapshot = await responsesRef.once('value');
    const foundItems = snapshot.val();
    
    if (!foundItems) {
      return { found: false };
    }

    const normalizedLostDescription = lostItemDescription.toLowerCase();
    const matches = [];

    Object.values(foundItems).forEach((item) => {
      if (item['Please describe the item']) {
        const foundItemDescription = item['Please describe the item'].toLowerCase();
        const similarity = calculateDescriptionSimilarity(
          normalizedLostDescription,
          foundItemDescription
        );

        if (similarity >= 0.6) {
          matches.push({
            boxId: item['Please enter the box ID you\'re putting the item in?'],
            similarity,
            itemDetails: item
          });
        }
      }
    });

    if (matches.length > 0) {
      matches.sort((a, b) => b.similarity - a.similarity);
      const bestMatch = matches[0];
      
      return {
        found: true,
        boxId: bestMatch.boxId,
        itemDetails: bestMatch.itemDetails
      };
    }

    return { found: false };
  } catch (error) {
    console.error('Error finding matches:', error);
    return { found: false, error: error.message };
  }
}

function calculateDescriptionSimilarity(desc1, desc2) {
  const words1 = desc1.split(/\s+/);
  const words2 = desc2.split(/\s+/);
  
  const commonWords = words1.filter(word => 
    words2.includes(word) && word.length > 2
  );

  return commonWords.length / Math.max(words1.length, words2.length);
}

async function storeImage(mediaUrl, referenceNumber) {
  const imagesRef = admin.database().ref(`lost_item_images/${referenceNumber}`);
  await imagesRef.push({
    url: mediaUrl,
    timestamp: admin.database.ServerValue.TIMESTAMP
  });
}

exports.whatsappWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const twiml = new twilio.twiml.MessagingResponse();
    const incomingMsg = (req.body.Body || '').trim();
    const userPhone = req.body.From;
    const hasMedia = req.body.NumMedia && parseInt(req.body.NumMedia) > 0;
    const mediaUrl = hasMedia ? req.body.MediaUrl0 : null;
    const cleanPhone = userPhone.replace(/[^a-zA-Z0-9]/g, '_');
    
    console.log('Received message:', {
      message: incomingMsg,
      from: userPhone,
      hasMedia: hasMedia,
      mediaUrl: mediaUrl
    });

    const sessionRef = admin.database().ref(`sessions/${cleanPhone}`);
    const snapshot = await sessionRef.once('value');
    let session = snapshot.val() || { 
      state: STATES.START, 
      data: {
        name: '',
        phone: '',
        location: '',
        description: '',
        images: [],
        boxId: null
      },
      context: '',
      userName: ''
    };

    let responseMessage = '';

    if (session.state === STATES.START) {
      session.state = STATES.GETTING_NAME;
      responseMessage = getWelcomeMessage();
    } else if (session.state === STATES.GETTING_NAME) {
      session.userName = incomingMsg;
      session.state = STATES.CONVERSATION;
      responseMessage = getInitialOptions(session.userName);
    } else if (session.state === STATES.CONVERSATION) {
      if (incomingMsg === '1') {
        session.state = STATES.COLLECTING_NAME;
        responseMessage = `I'm sorry to hear that you've lost something, ${session.userName}. Let me help you with that. First, could you please confirm your full name for our records?`;
      } else {
        const enhancedContext = session.context ? 
          session.context.split('\n').slice(-10).join('\n') : '';
        
        responseMessage = await processQuery(incomingMsg, session.userName, enhancedContext);
        
        if (incomingMsg.length > 3 && responseMessage !== getInitialOptions(session.userName)) {
          session.context += `\nUser: ${incomingMsg}\nEmma: ${responseMessage}`;
        }
      }
    } else {
      switch (session.state) {
        case STATES.COLLECTING_NAME:
          session.data.name = req.body.Body;
          session.state = STATES.COLLECTING_PHONE;
          responseMessage = `Thank you, ${session.userName}. Could you please share your contact number? This will help us notify you when we find a match for your item.`;
          break;

        case STATES.COLLECTING_PHONE:
          const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
          if (phoneRegex.test(req.body.Body.replace(/\s/g, ''))) {
            session.data.phone = req.body.Body;
            session.state = STATES.COLLECTING_LOCATION;
            responseMessage = `Perfect, ${session.userName}. Now, could you tell me where you lost the item? Please be as specific as possible with the location details.`;
          } else {
            responseMessage = `I apologize, ${session.userName}, but I couldn't validate that phone number. Could you please provide it in a standard format (e.g., +1234567890 or 123-456-7890)?`;
          }
          break;

        case STATES.COLLECTING_LOCATION:
          if (req.body.Body.length < 3) {
            responseMessage = `${session.userName}, could you please provide more details about the location? This will help us narrow down the search area.`;
          } else {
            session.data.location = req.body.Body;
            session.state = STATES.COLLECTING_DESCRIPTION;
            responseMessage = `Thank you for the location details, ${session.userName}. Now, please describe the lost item in detail - include information about its:
- Color and size
- Brand or make (if applicable)
- Any unique features or markings
- Contents (if it's a bag or container)`;
          }
          break;

        case STATES.COLLECTING_DESCRIPTION:
          if (req.body.Body.length < 10) {
            responseMessage = `${session.userName}, could you please provide a more detailed description? The more information you give, the better our chances of finding your item.`;
          } else {
            session.data.description = req.body.Body;
            session.state = STATES.COLLECTING_IMAGE;
            responseMessage = `Thank you for the detailed description, ${session.userName}. Do you have any pictures of the lost item? If yes, please send them now. If not, please type 'no'.`;
          }
          break;

        case STATES.COLLECTING_IMAGE:
          if (hasMedia) {
            if (!Array.isArray(session.data.images)) {
              session.data.images = [];
            }
            session.data.images.push(mediaUrl);
            responseMessage = `Thanks for sharing the image, ${session.userName}. Do you have any more pictures to share? If not, please type 'no'.`;
          } else if (incomingMsg.toLowerCase() === 'no') {
            const matchResult = await findMatchingItems(session.data.description);
            const refNumber = `REF-${Date.now().toString(36).toUpperCase()}`;
            
            if (session.data.images && session.data.images.length > 0) {
              for (const imageUrl of session.data.images) {
                await storeImage(imageUrl, refNumber);
              }
            }

            if (matchResult.found) {
              await storeLostReport({
                ...session.data,
                referenceNumber: refNumber,
                status: 'MATCHED',
                matchedBoxId: matchResult.boxId,
                matchedWith: matchResult.itemDetails
              });

              session.state = STATES.AWAITING_BOX_ARRIVAL;
              session.data.boxId = matchResult.boxId;
              
              responseMessage = `Great news, ${session.userName}! We've found a potential match for your item!\n\n` +
                `Reference Number: ${refNumber}\n` +
                `Location: Box ${matchResult.boxId}\n\n` +
                `When you arrive at the box location, please type 'arrived' or 'I am here', and I'll help you retrieve your item.`;
            } else {
              await storeLostReport({
                ...session.data,
                referenceNumber: refNumber,
                status: 'PENDING'
              });

              responseMessage = `${session.userName}, I've recorded your lost item report.\n\n` +
                `Reference Number: ${refNumber}\n\n` +
                `While we haven't found any matching items yet, I'll make sure you're notified immediately when something is found. ` +
                `You can check the status anytime using this reference number at www.missingmatters.com.\n\n` +
                `Is there anything else I can help you with today?`;
              
              session.state = STATES.CONVERSATION;
              session.data = {
                name: '',
                phone: '',
                location: '',
                description: '',
                images: [],
                boxId: null
              };
            }
          } else {
            responseMessage = `${session.userName}, please either send an image of your lost item or type 'no' if you don't have any images to share.`;
          }
          break;

        case STATES.AWAITING_BOX_ARRIVAL:
          const arrivalPhrases = ['arrived', 'i am here', 'yes', 'im here', 'i\'m here'];
          if (arrivalPhrases.includes(incomingMsg.toLowerCase())) {
            const verificationCode = generateVerificationCode();
            await storeVerificationCode(userPhone, verificationCode, session.data.boxId);
            const smsSent = await sendVerificationCode(userPhone, verificationCode);
            
            if (smsSent) {
              session.state = STATES.WAITING_FOR_CODE;
              responseMessage = `Perfect, ${session.userName}! I've just sent a verification code to your phone number via SMS. Please enter the code here to unlock the box.`;
            } else {
              responseMessage = `I apologize, ${session.userName}, but we encountered an error sending the verification code. Please try again by typing 'arrived' or 'I am here'.`;
            }
          } else {
            responseMessage = `${session.userName}, please let me know when you've arrived at the box by typing 'arrived' or 'I am here'.`;
          }
          break;

        case STATES.WAITING_FOR_CODE:
          const verification = await verifyCode(userPhone, incomingMsg);
          if (verification.isValid) {
            await triggerBoxUnlock(verification.boxId, userPhone);
            
            session.state = STATES.CONVERSATION;
            session.data = {
              name: '',
              phone: '',
              location: '',
              description: '',
              images: [],
              boxId: null
            };
            
            responseMessage = `Perfect, ${session.userName}! The code is verified and the box is now unlocking. Please collect your item.\n\n` +
              `I hope you found our service helpful. Is there anything else I can assist you with today?`;
          } else {
            if (incomingMsg.toLowerCase() === 'resend') {
              const newCode = generateVerificationCode();
              await storeVerificationCode(userPhone, newCode, session.data.boxId);
              const smsSent = await sendVerificationCode(userPhone, newCode);
              
              if (smsSent) {
                responseMessage = `${session.userName}, I've sent a new verification code to your phone number. Please enter it here.`;
              } else {
                responseMessage = `I apologize, ${session.userName}, but we encountered an error sending the new code. Please type 'resend' to try again.`;
              }
            } else {
              responseMessage = `I'm sorry, ${session.userName}, but that code appears to be invalid or expired. Please try again or type 'resend' to get a new code.`;
            }
          }
          break;

        default:
          session.state = STATES.CONVERSATION;
          responseMessage = getInitialOptions(session.userName);
      }
    }

    if (session.context && session.context.length > 1000) {
      session.context = session.context.slice(-1000);
    }

    await sessionRef.set(session);
    console.log('Sending response:', responseMessage);

    twiml.message(responseMessage);
    res.writeHead(200, {'Content-Type': 'text/xml'});
    res.end(twiml.toString());

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send(error);
  }
});

// Add the new image analysis function here, after your webhook export
exports.analyzeStorageImage = onObjectFinalized({
  bucket: undefined, 
  region: 'us-central1'
}, async (event) => {
  if (!vision) {
      console.error('Vision API client initialization failed');
      return null;
  }

  const object = event.data;
  if (!object || !object.name) {
      console.error('Invalid storage object received');
      return null;
  }

  const filePath = object.name;
  const fileName = filePath.split('/').pop();

  // Define and check valid directories
  const validDirectories = {
    camera: 'missingmatters_photos/Camera_Images'
  };

  let imageType = null;
  let imageSource = null;

  // Check if it's a camera image from storage
  if (filePath.includes(validDirectories.camera)) {
    imageType = 'camera';
    imageSource = 'storage';
  } else {
    // Check if it's a form image from Google Drive
    if (object.metadata?.formImageUrl) {
      imageType = 'form';
      imageSource = 'drive';
    }
  }

  if (!imageType) {
    console.log(`File ${fileName} not in monitored directories`);
    return null;
  }

  try {
    console.log(`Initiating analysis for ${imageType} image: ${fileName}`);
    
    // Handle different image sources
    let imageUri;
    
    // For camera images, use the Cloud Storage path
    if (imageSource === 'storage') {
      imageUri = `gs://${object.bucket}/${filePath}`;
    } 
    // For form images, handle the Google Drive URL
    else if (imageSource === 'drive') {
      const driveUrl = object.metadata.formImageUrl;
      if (!driveUrl) {
        throw new Error('Form image URL not found in metadata');
      }
      
      // Convert to direct download URL if it's a Google Drive link
      if (driveUrl.includes('drive.google.com')) {
        const fileId = driveUrl.match(/id=(.*?)(&|$)/)?.[1];
        if (fileId) {
          imageUri = `https://drive.google.com/uc?id=${fileId}`;
        } else {
          throw new Error('Invalid Google Drive URL format');
        }
      } else {
        imageUri = driveUrl;
      }
    }

    // Define analysis configurations based on image type
    const analysisConfig = {
      camera: {
        labelConfidenceThreshold: 85,
        objectConfidenceThreshold: 75,
        maxObjects: 20
      },
      form: {
        labelConfidenceThreshold: 80,
        objectConfidenceThreshold: 70,
        maxObjects: 30
      }
    };

    const config = analysisConfig[imageType];

    // Create vision API request options based on image source
    const imageRequest = imageSource === 'storage' 
      ? { image: { source: { imageUri } } }
      : { image: { source: { imageUri } }, imageContext: { webDetection: { includeGeoResults: true } } };

    // Perform comprehensive analysis
    const [
      labelResults,
      objectResults,
      textResults,
      imageProperties,
      safeSearchResults
    ] = await Promise.all([
      vision.labelDetection({
        ...imageRequest,
        imageContext: {
          languageHints: ['en'],
          productSearchParams: {
            boundingPoly: null
          }
        }
      }),
      vision.objectLocalization({
        ...imageRequest,
        maxResults: config.maxObjects
      }),
      vision.textDetection({
        ...imageRequest,
        imageContext: {
          languageHints: ['en']
        }
      }),
      vision.imageProperties(imageRequest),
      vision.safeSearchDetection(imageRequest)
    ]);

    // Process and format analysis results
    const analysis = {
      labels: labelResults[0].labelAnnotations
        .map(label => ({
          description: label.description,
          confidence: (label.score * 100).toFixed(1),
          topicality: label.topicality
        }))
        .filter(label => parseFloat(label.confidence) > config.labelConfidenceThreshold),

      objects: objectResults[0].localizedObjectAnnotations
        .map(obj => ({
          name: obj.name,
          confidence: (obj.score * 100).toFixed(1),
          boundingBox: obj.boundingPoly.normalizedVertices
        }))
        .filter(obj => parseFloat(obj.confidence) > config.objectConfidenceThreshold),

      colors: imageProperties[0].imagePropertiesAnnotation.dominantColors.colors
        .map(color => ({
          rgb: color.color,
          score: (color.score * 100).toFixed(1),
          pixelFraction: (color.pixelFraction * 100).toFixed(1)
        }))
        .slice(0, 5),

      safeSearch: safeSearchResults[0].safeSearchAnnotation,

      text: textResults[0]?.textAnnotations?.length > 0 
        ? {
          fullText: textResults[0].textAnnotations[0].description,
          words: textResults[0].textAnnotations.slice(1).map(word => ({
            text: word.description,
            confidence: word.confidence,
            location: word.boundingPoly.vertices
          }))
        }
        : null,

      quality: {
        sharpness: imageProperties[0].imagePropertiesAnnotation.quality?.sharpness || 0,
        brightness: imageProperties[0].imagePropertiesAnnotation.quality?.brightness || 0
      }
    };

    // Store results in database with source information
    const analysisRef = admin.database().ref('image_analysis').child(imageType);
    const sanitizedFileName = fileName.replace(/[.#$[\]]/g, '_');

    await analysisRef.child(sanitizedFileName).set({
      analysis,
      metadata: {
        originalPath: filePath,
        contentType: object.contentType,
        timestamp: admin.database.ServerValue.TIMESTAMP,
        size: object.size,
        bucket: object.bucket,
        imageSource: imageSource,
        sourceUrl: imageUri
      }
    });

    console.log(`Successfully completed analysis for ${imageType} image: ${fileName}`);
    return {
      success: true,
      analysisPath: `image_analysis/${imageType}/${sanitizedFileName}`
    };

  } catch (error) {
    console.error(`Analysis failed for ${fileName}:`, error);

    const errorRef = admin.database().ref('image_analysis_errors');
    await errorRef.push({
      fileName,
      filePath,
      imageType,
      imageSource,
      errorMessage: error.message,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });

    throw new functions.https.HttpsError('internal', 'Image analysis operation failed');
  }
});