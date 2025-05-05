const functions = require('firebase-functions');
const admin = require('firebase-admin');
const twilio = require('twilio');
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const OpenAI = require('openai');

// Error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Initialize Firebase
admin.initializeApp();

// Lazy initialization variables
let openai;
let openaiInitialized = false;
let twilioClient;
let vision;

// Vision API initialization function (called when needed)
function getVisionClient() {
  if (!vision) {
    try {
      vision = new (require('@google-cloud/vision').ImageAnnotatorClient)();
      console.log('Vision API client initialized successfully');
    } catch (error) {
      console.error('Error initializing Vision API client:', error);
    }
  }
  return vision;
}

// OpenAI initialization function (called when needed)
function getOpenAIClient() {
  if (!openaiInitialized && !openai) {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    console.log('OpenAI API Key status:', openaiApiKey ? 
                `Configured (length: ${openaiApiKey.length})` : 'Missing');
    
    if (openaiApiKey) {
      openai = new OpenAI({
        apiKey: openaiApiKey
      });
      openaiInitialized = true;
      console.log('OpenAI client initialized successfully');
    } else {
      console.warn('OpenAI API key not configured, will use fallback responses');
    }
  }
  return openai;
}

// Twilio initialization function (called when needed)
function getTwilioClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (accountSid && authToken) {
      twilioClient = twilio(accountSid, authToken);
      console.log('Twilio client initialized successfully');
    } else {
      console.error('Twilio credentials missing');
    }
  }
  return twilioClient;
}

// Company information
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

/**
 * Main WhatsApp webhook handler
 */
exports.whatsappWebhook = functions.https.onRequest(
  {
    secrets: ['OPENAI_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']
  },
  async (req, res) => {
    console.log('WhatsApp webhook triggered');
    const startTime = Date.now();
    
    try {
      // Get Twilio client and create a response
      const twilioClientInstance = getTwilioClient();
      const twiml = new twilio.twiml.MessagingResponse();
      
      // Extract message data
      const incomingMsg = (req.body.Body || '').trim();
      const userPhone = req.body.From;
      const profileName = req.body.ProfileName || null;
      const hasMedia = req.body.NumMedia && parseInt(req.body.NumMedia) > 0;
      const mediaUrl = hasMedia ? req.body.MediaUrl0 : null;
      const cleanPhone = userPhone.replace(/[^a-zA-Z0-9]/g, '_');
      
      console.log('Received message:', {
        message: incomingMsg,
        from: userPhone,
        profileName: profileName || 'Not provided',
        hasMedia: hasMedia,
        mediaUrl: mediaUrl ? 'Media URL present' : 'No media'
      });

      // Get or create user session
      const sessionRef = admin.database().ref(`sessions/${cleanPhone}`);
      const snapshot = await sessionRef.once('value');
      let session = snapshot.val() || { 
        userName: profileName || '',
        userPhone: userPhone, 
        conversationHistory: [],
        currentFlow: 'initial_greeting',
        firstContactTimestamp: Date.now()
      };

      // Check for explicit reset commands
      if (incomingMsg.toLowerCase().match(/\b(reset|restart|start over|clear|begin again|new chat)\b/)) {
        const userName = session.userName;
        const userPhone = session.userPhone;
        
        session = {
          userName: userName,
          userPhone: userPhone,
          conversationHistory: [],
          currentFlow: 'initial_greeting',
          firstContactTimestamp: session.firstContactTimestamp || Date.now(),
          lastMessageTimestamp: Date.now()
        };
        console.log('Session reset by user command');
      }

      // Process media if present
      if (hasMedia && mediaUrl) {
        if (!session.mediaItems) {
          session.mediaItems = [];
        }
        session.mediaItems.push({
          url: mediaUrl,
          timestamp: Date.now()
        });
        
        if (session.currentFlow === 'lost_item_report' && session.lostItemReport) {
          if (!session.lostItemReport.images) {
            session.lostItemReport.images = [];
          }
          session.lostItemReport.images.push(mediaUrl);
        }
      }

      // Analyze intent from user message
      const detectedIntent = await analyzeUserIntent(incomingMsg, session);
      
      // Update session based on detected intent
      updateSessionBasedOnIntent(session, detectedIntent, incomingMsg);

      // Get AI-generated or fallback response
      let responseMessage;
      const openai = getOpenAIClient();
      if (openai && openaiInitialized) {
        try {
          responseMessage = await generateAIResponse(incomingMsg, session);
        } catch (aiError) {
          console.error('Error generating AI response:', aiError);
          responseMessage = getContextAwareResponse(incomingMsg, session);
        }
      } else {
        console.log('OpenAI not initialized, using context-aware fallback');
        responseMessage = getContextAwareResponse(incomingMsg, session);
      }
      
      // Update conversation history
      if (!session.conversationHistory) {
        session.conversationHistory = [];
      }
      
      session.conversationHistory.push({
        role: 'user',
        content: incomingMsg,
        timestamp: Date.now()
      });
      
      session.conversationHistory.push({
        role: 'assistant',
        content: responseMessage,
        timestamp: Date.now()
      });
      
      // Limit conversation history to last 20 messages
      if (session.conversationHistory.length > 20) {
        session.conversationHistory = session.conversationHistory.slice(-20);
      }
      
      // Update last message timestamp
      session.lastMessageTimestamp = Date.now();
      
      // Save updated session
      await sessionRef.set(session);
      console.log('Updated session saved');
      
      // Send response
      twiml.message(responseMessage);
      res.writeHead(200, {'Content-Type': 'text/xml'});
      res.end(twiml.toString());
      
      // Log performance metrics
      const processingTime = Date.now() - startTime;
      console.log(`Response sent successfully (processing time: ${processingTime}ms)`);
    } catch (error) {
      console.error('Webhook error:', error);
      
      try {
        const twiml = new twilio.twiml.MessagingResponse();
        twiml.message('I\'m having trouble processing your request right now. Let\'s try again in a moment.');
        res.writeHead(200, {'Content-Type': 'text/xml'});
        res.end(twiml.toString());
      } catch (responseError) {
        console.error('Error sending error response:', responseError);
        res.status(500).send('Error processing request');
      }
    }
  }
);

/**
 * Analyze user intent from message
 */
async function analyzeUserIntent(message, session) {
  const lowerMessage = message.toLowerCase().trim();
  
  // Simple pattern matching for when OpenAI is not available
  
  // Check for lost item patterns
  if (lowerMessage.includes('lost') || 
      lowerMessage.includes('missing') || 
      lowerMessage.includes('find') || 
      lowerMessage.includes('can\'t find') || 
      lowerMessage.includes('misplaced')) {
    return {
      intent: 'report_lost_item',
      confidence: 0.9
    };
  }
  
  // Check for item description patterns
  if (session.currentFlow === 'lost_item_report' && 
      lowerMessage.length > 3 && 
      !lowerMessage.includes('help') &&
      !lowerMessage.includes('hi') &&
      !lowerMessage.includes('hello')) {
    return {
      intent: 'provide_item_description',
      confidence: 0.8
    };
  }
  
  // Check for company info patterns
  if (lowerMessage.includes('about') || 
      lowerMessage.includes('company') || 
      lowerMessage.includes('pmatts') || 
      lowerMessage.includes('service') || 
      lowerMessage.includes('missing matters')) {
    return {
      intent: 'learn_about_company',
      confidence: 0.85
    };
  }
  
  // Check for greetings
  if (lowerMessage === 'hi' || 
      lowerMessage === 'hello' || 
      lowerMessage === 'hey' || 
      lowerMessage === 'greetings' ||
      lowerMessage === 'hi there') {
    return {
      intent: 'greeting',
      confidence: 0.95
    };
  }
  
  // Check for user providing contact info
  if (session.currentFlow === 'collecting_contact_info') {
    if (lowerMessage.match(/^\+?[0-9]{10,15}$/)) {
      return {
        intent: 'provide_phone',
        confidence: 0.9
      };
    } else if (lowerMessage.includes('@') && lowerMessage.includes('.')) {
      return {
        intent: 'provide_email',
        confidence: 0.9
      };
    } else if (lowerMessage.length > 2 && lowerMessage.length < 50) {
      return {
        intent: 'provide_name',
        confidence: 0.7
      };
    }
  }
  
  // When OpenAI is available, we could use it for more sophisticated intent detection
  const openai = getOpenAIClient();
  if (openai && openaiInitialized) {
    try {
      const intentPrompt = `
        Determine the user's intent from this message in a lost & found chatbot context:
        "${message}"
        
        Current conversation state: ${session.currentFlow || 'initial_greeting'}
        ${session.lostItemReport ? `User is reporting a lost: ${session.lostItemReport.description || 'item'}` : ''}
        
        Return ONLY ONE of these intents with NO explanation:
        - greeting
        - goodbye
        - report_lost_item
        - provide_item_description
        - provide_location
        - provide_contact_info
        - provide_time
        - learn_about_company
        - request_help
        - confirm
        - deny
        - general_query
      `;
      
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an intent detection assistant that identifies user intents in a lost & found chatbot.' },
          { role: 'user', content: intentPrompt }
        ],
        temperature: 0.3,
        max_tokens: 20
      });
      
      const detectedIntent = completion.choices[0].message.content.trim().toLowerCase();
      
      return {
        intent: detectedIntent,
        confidence: 0.9,
        source: 'ai'
      };
    } catch (error) {
      console.error('Error detecting intent with AI:', error);
      // Fall back to basic intent detection
    }
  }
  
  // Default fallback
  return {
    intent: 'general_query',
    confidence: 0.5
  };
}

/**
 * Update session state based on detected intent
 */
function updateSessionBasedOnIntent(session, detectedIntent, userMessage) {
  const intent = detectedIntent.intent;
  
  // Initialize lost item report if needed
  if (intent === 'report_lost_item' && !session.lostItemReport) {
    session.lostItemReport = {};
    session.currentFlow = 'lost_item_report';
  }
  
  // Process different intents
  switch (intent) {
    case 'greeting':
      if (!session.lostItemReport && session.currentFlow !== 'verification') {
        session.currentFlow = 'initial_greeting';
      }
      break;
      
    case 'provide_item_description':
      if (session.currentFlow === 'lost_item_report' || !session.currentFlow) {
        if (!session.lostItemReport) session.lostItemReport = {};
        session.lostItemReport.description = userMessage;
        session.currentFlow = 'collecting_contact_info';
      }
      break;
      
    case 'provide_location':
      if (session.lostItemReport) {
        session.lostItemReport.location = userMessage;
      }
      break;
      
    case 'provide_name':
      session.userName = userMessage;
      if (session.lostItemReport) {
        session.lostItemReport.name = userMessage;
      }
      break;
      
    case 'provide_phone':
      const cleanPhone = cleanPhoneNumber(userMessage);
      session.userPhone = cleanPhone;
      if (session.lostItemReport) {
        session.lostItemReport.phone = cleanPhone;
      }
      break;
      
    case 'provide_time':
      if (session.lostItemReport) {
        session.lostItemReport.timeLost = userMessage;
      }
      break;
      
    case 'learn_about_company':
      session.currentFlow = 'company_info';
      break;
      
    case 'request_help':
      session.currentFlow = 'help';
      break;
  }
  
  return session;
}

/**
 * Generate AI response using OpenAI
 */
async function generateAIResponse(userMessage, session) {
  try {
    const openai = getOpenAIClient();
    
    // Format conversation history
    const conversationMessages = [];
    
    if (session.conversationHistory && Array.isArray(session.conversationHistory)) {
      // Add last few messages for context (limit to last 6 messages)
      const recentHistory = session.conversationHistory.slice(-6);
      for (const msg of recentHistory) {
        conversationMessages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }
    
    // Add current message
    conversationMessages.push({
      role: 'user',
      content: userMessage
    });
    
    // Create appropriate system prompt based on session state
    const systemPrompt = createSystemPrompt(session);
    
    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        ...conversationMessages
      ],
      temperature: 0.7,
      max_tokens: 300
    });
    
    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error generating AI response:', error);
    return getContextAwareResponse(userMessage, session);
  }
}

/**
 * Create system prompt based on session state
 */
function createSystemPrompt(session) {
  const userName = session.userName || 'there';
  const currentFlow = session.currentFlow || 'initial_greeting';
  
  // Base system prompt
  let systemPrompt = `You are a helpful WhatsApp chatbot assistant for Missing Matters, a lost and found platform. You're chatting with ${userName}.

About Missing Matters:
${COMPANY_INFO.mm_description}

IMPORTANT GUIDELINES:
1. You ONLY discuss topics related to lost items, Missing Matters services, or PMatts company.
2. Be conversational, friendly, and brief (under 150 words).
3. Ask only one question per response.
4. Show empathy for lost items.
5. Don't use lists or bullet points.
6. Respond naturally, not like a script.
`;

  // Add specific context based on conversation flow
  if (currentFlow === 'lost_item_report' || currentFlow === 'collecting_contact_info') {
    const lostReport = session.lostItemReport || {};
    
    systemPrompt += `
CURRENT FLOW: Lost Item Report
Current report information:
- Name: ${lostReport.name || 'Not provided'}
- Phone: ${lostReport.phone || 'Not provided'}
- Location: ${lostReport.location || 'Not provided'}
- Description: ${lostReport.description || 'Not provided'}
- Time Lost: ${lostReport.timeLost || 'Not provided'}

If the user has provided an item description but not contact details, ask for their name and phone number. Be empathetic about their lost item.
`;
  } else if (currentFlow === 'company_info') {
    systemPrompt += `
CURRENT FLOW: Providing Company Information
Focus on providing information about Missing Matters or PMatts based on the description provided.
`;
  } else if (currentFlow === 'verification') {
    systemPrompt += `
CURRENT FLOW: Verification Process
Guide the user through providing a verification code or arriving at a box location.
`;
  } else if (currentFlow === 'help') {
    systemPrompt += `
CURRENT FLOW: Providing Help
Explain how to use Missing Matters' services, focusing on reporting lost items and recovery process.
`;
  }
  
  return systemPrompt;
}

/**
 * Context-aware fallback response generator
 */
function getContextAwareResponse(userMessage, session) {
  const userName = session.userName || 'there';
  const currentFlow = session.currentFlow || 'initial_greeting';
  const lowerMessage = userMessage.toLowerCase();
  
  // Generate appropriate responses based on conversation state
  switch (currentFlow) {
    case 'initial_greeting':
      if (lowerMessage === 'hi' || lowerMessage === 'hello' || lowerMessage === 'hey') {
        return `Hi ${userName}! Welcome to Missing Matters. I'm here to help you recover lost items or answer questions about our services. How can I assist you today?`;
      } else if (lowerMessage.includes('lost') || lowerMessage.includes('missing')) {
        session.currentFlow = 'lost_item_report';
        return `I'd be happy to help you with your lost item. Could you please describe what you've lost in detail?`;
      } else {
        return `Hi ${userName}! I'm here to help with lost items or information about Missing Matters. What can I assist you with today?`;
      }
      
    case 'lost_item_report':
      if (!session.lostItemReport || !session.lostItemReport.description) {
        return `Could you please describe the lost item? Please include details like color, size, brand, and any unique features.`;
      } else if (!session.lostItemReport.name) {
        session.currentFlow = 'collecting_contact_info';
        return `Thanks for the description. To help you better, could you please tell me your name?`;
      } else if (!session.lostItemReport.phone) {
        return `Thanks, ${session.lostItemReport.name}. Could you provide your phone number so we can contact you if we find your item?`;
      } else if (!session.lostItemReport.location) {
        return `Where did you last see or use your ${session.lostItemReport.description}?`;
      } else {
        // All required information collected
        const refNumber = `REF-${Date.now().toString(36).toUpperCase()}`;
        if (!session.lostItemReport.referenceNumber) {
          session.lostItemReport.referenceNumber = refNumber;
          session.lostItemReport.status = 'PENDING';
          
          // Store the report
          storeLostReport(session.lostItemReport);
        }
        
        return `Thank you for providing all the details about your lost ${session.lostItemReport.description}. Your report has been recorded with reference number ${session.lostItemReport.referenceNumber}. We'll notify you if we find a match. Is there anything else you'd like to know?`;
      }
      
    case 'collecting_contact_info':
      if (!session.lostItemReport.name) {
        return `Could you please tell me your name so I can create a lost item report for your ${session.lostItemReport.description}?`;
      } else if (!session.lostItemReport.phone) {
        return `Thanks, ${session.lostItemReport.name}. Could you provide your phone number so we can contact you if we find your ${session.lostItemReport.description}?`;
      } else {
        session.currentFlow = 'lost_item_report';
        return `Great! Now, could you tell me where you last saw or used your ${session.lostItemReport.description}?`;
      }
      
    case 'company_info':
      return `Missing Matters is a revolutionary lost and found platform that uses AI-powered matching and a network of secure smart boxes to help people recover lost items. Our technology significantly increases the chances of recovering your belongings. Is there something specific about our services you'd like to know?`;
      
    case 'help':
      return `I can help you report a lost item, answer questions about our services, or provide information about Missing Matters. To report a lost item, simply tell me what you've lost, and I'll guide you through the process. Would you like to report a lost item now?`;
      
    default:
      return `Hi ${userName}! I'm here to help with lost items or information about Missing Matters. What would you like assistance with today?`;
  }
}

/**
 * Store lost item report in database
 */
async function storeLostReport(reportData) {
  try {
    const reportsRef = admin.database().ref('lost_reports');
    await reportsRef.push({
      ...reportData,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });
    console.log('Lost report stored successfully:', reportData.referenceNumber);
    return true;
  } catch (error) {
    console.error('Error storing lost report:', error);
    return false;
  }
}

/**
 * Helper function to clean up phone numbers
 */
function cleanPhoneNumber(phoneNumber) {
  let cleaned = phoneNumber.trim();
  
  if (!cleaned.startsWith('+')) {
    cleaned = cleaned.replace(/\D/g, '');
    
    if (cleaned.length === 10) {
      cleaned = `+1${cleaned}`;
    } else {
      cleaned = `+${cleaned}`;
    }
  }
  
  return cleaned;
}

/**
 * Image analysis function
 */
exports.analyzeStorageImage = onObjectFinalized({
  bucket: undefined, 
  region: 'us-central1'
}, async (_) => {  // Using underscore to indicate unused parameter
  const vision = getVisionClient();
  
  if (!vision) {
      console.error('Vision API client initialization failed');
      return null;
  }

  const object = _.data;  // Use data from the event object
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
        const fileId = driveUrl.match(/id=(.*?)(&|$)/)?.[1]; // Fixed regex extraction
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

/**
* Health check endpoint
*/
exports.healthCheck = functions.https.onRequest(
  {
    secrets: ['OPENAI_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']
  },
  (req, res) => {
    // Get client instances
    const twilioClientInstance = getTwilioClient();
    const visionClient = getVisionClient();
    
    res.status(200).send({
      status: 'OK',
      timestamp: new Date().toISOString(),
      openai_configured: openaiInitialized,
      twilio_configured: Boolean(twilioClientInstance),
      vision_configured: Boolean(visionClient),
      config_values: {
        has_openai_key: Boolean(process.env.OPENAI_API_KEY),
        has_twilio_sid: Boolean(process.env.TWILIO_ACCOUNT_SID),
        has_twilio_token: Boolean(process.env.TWILIO_AUTH_TOKEN)
      }
    });
  }
);

/**
* Reset user's session data
*/
exports.resetUserSession = functions.https.onRequest(async (req, res) => {
  try {
    const userPhone = req.query.phone;
    
    if (!userPhone) {
      return res.status(400).send({ error: 'Phone number parameter required' });
    }
    
    const cleanPhone = userPhone.replace(/[^a-zA-Z0-9]/g, '_');
    const sessionRef = admin.database().ref(`sessions/${cleanPhone}`);
    
    // Get current session to preserve username if possible
    const snapshot = await sessionRef.once('value');
    const currentSession = snapshot.val();
    const userName = currentSession?.userName || '';
    const userPhoneNumber = currentSession?.userPhone || userPhone;
    
    // Reset to initial state but preserve user identity
    await sessionRef.set({ 
      userName: userName,
      userPhone: userPhoneNumber,
      conversationHistory: [],
      currentFlow: 'initial_greeting',
      firstContactTimestamp: currentSession?.firstContactTimestamp || Date.now(),
      lastMessageTimestamp: Date.now()
    });
    
    return res.status(200).send({ 
      success: true, 
      message: `Session reset for ${userPhone}`,
      preserved_username: Boolean(userName)
    });
  } catch (error) {
    console.error('Error resetting session:', error);
    return res.status(500).send({ error: 'Failed to reset session' });
  }
});