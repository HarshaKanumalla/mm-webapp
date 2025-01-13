const functions = require("firebase-functions");
const admin = require("firebase-admin");
const twilio = require("twilio");

admin.initializeApp();

const STATES = {
  START: "START",
  COLLECTING_NAME: "COLLECTING_NAME",
  COLLECTING_PHONE: "COLLECTING_PHONE",
  COLLECTING_LOCATION: "COLLECTING_LOCATION",
  COLLECTING_DESCRIPTION: "COLLECTING_DESCRIPTION",
  COLLECTING_IMAGE: "COLLECTING_IMAGE"
};

const COMPANY_INFO = {
  pmatts: `PMatts Private Limited stands at the forefront of technological innovation, developing solutions that transform businesses and communities.

Our core expertise includes:
- Smart Infrastructure Management: Intelligent systems for efficient operations
- Digital Transformation: Cutting-edge solutions for the digital future
- Advanced Security Solutions: Enterprise-grade protection systems

Would you like to learn more about:
1. Our Solutions & Services
2. Innovation & Research
3. Impact & Achievements
4. Future Vision

Please type your area of interest or ask any specific questions.`,

  solutions: `PMatts Solutions Portfolio:

Smart Infrastructure:
- Intelligent building management
- Energy optimization systems
- Asset tracking platforms

Digital Transformation:
- Process automation tools
- Cloud integration services
- Workflow optimization

Security Systems:
- Advanced surveillance
- Access control
- Threat detection`,

  innovation: `PMatts Innovation through PMatts Catalysts:

AI & Machine Learning:
- Predictive analytics
- Natural language processing
- Computer vision applications

IoT Solutions:
- Smart sensor networks
- Real-time monitoring
- Connected platforms

Blockchain Integration:
- Secure transactions
- Digital identity
- Smart contracts`,

  impact: `PMatts Impact Metrics:

Operational Excellence:
- 40% cost reduction
- 60% efficiency improvement
- 75% automation increase

Sustainability:
- 30% energy savings
- 45% carbon reduction
- Sustainable resource management

Security Enhancement:
- 90% threat detection improvement
- Real-time incident response
- Enhanced data protection`,

  missingMatters: `Missing Matters provides an innovative lost and found management system using smart technology and AI-powered matching.

Core Features:
- AI-powered item matching
- Secure smart box network
- Real-time notifications
- Verified recovery process
- Nationwide coverage

Learn more about:
1. How it works
2. Our technology
3. Locations
4. Security features`
};

function processQuery(incomingMessage) {
  const message = incomingMessage.toLowerCase().trim();
  
  if (message.includes("solution")) {
    return COMPANY_INFO.solutions;
  }
  if (message.includes("innovation") || message.includes("research")) {
    return COMPANY_INFO.innovation;
  }
  if (message.includes("impact") || message.includes("achievement")) {
    return COMPANY_INFO.impact;
  }
  if (message.includes("missing matters")) {
    return COMPANY_INFO.missingMatters;
  }
  if (message === "2" || message.includes("pmatts")) {
    return COMPANY_INFO.pmatts;
  }
  
  return getWelcomeMessage();
}

function getWelcomeMessage() {
  return "Welcome to Missing Matters!\n\n1. Report a lost item\n2. Learn about PMatts Private Limited\n\nPlease select an option or ask me anything about our services.";
}

async function storeLostReport(data) {
  const reportsRef = admin.database().ref("lost_reports");
  await reportsRef.push({
    ...data,
    timestamp: admin.database.ServerValue.TIMESTAMP
  });
}

async function findMatchingItems(lostItemDescription) {
  try {
    const responsesRef = admin.database().ref("responses");
    const snapshot = await responsesRef.once("value");
    const foundItems = snapshot.val();
    
    if (!foundItems) {
      return { found: false };
    }

    const normalizedLostDescription = lostItemDescription.toLowerCase();
    const matches = [];

    Object.values(foundItems).forEach((item) => {
      if (item["Please describe the item"]) {
        const foundItemDescription = item["Please describe the item"].toLowerCase();
        const similarity = calculateDescriptionSimilarity(
          normalizedLostDescription,
          foundItemDescription
        );

        if (similarity >= 0.6) {
          matches.push({
            boxId: item["Please enter the box ID you're putting the item in?"],
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
    console.error("Error finding matches:", error);
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
    const incomingMsg = (req.body.Body || "").toLowerCase().trim();
    const userPhone = req.body.From;
    const hasMedia = req.body.NumMedia && parseInt(req.body.NumMedia) > 0;
    const mediaUrl = hasMedia ? req.body.MediaUrl0 : null;
    const cleanPhone = userPhone.replace(/[^a-zA-Z0-9]/g, "_");
    
    console.log("Received message:", {
      message: incomingMsg,
      from: userPhone,
      hasMedia: hasMedia,
      mediaUrl: mediaUrl
    });

    const sessionRef = admin.database().ref(`sessions/${cleanPhone}`);
    const snapshot = await sessionRef.once("value");
    let session = snapshot.val() || { 
      state: STATES.START, 
      data: {
        name: "",
        phone: "",
        location: "",
        description: "",
        images: []
      } 
    };

    let responseMessage = "";

    if (session.state === STATES.START) {
      if (incomingMsg === "1") {
        session.state = STATES.COLLECTING_NAME;
        responseMessage = "I'm sorry to hear that you've lost something. To help you better, could you please answer a few questions?\n\nFirst, what is your full name?";
      } else {
        responseMessage = processQuery(incomingMsg);
      }
    } else {
      switch (session.state) {
        case STATES.COLLECTING_NAME:
          session.data.name = req.body.Body;
          session.state = STATES.COLLECTING_PHONE;
          responseMessage = "Thank you. Could you please share your contact number?";
          break;

        case STATES.COLLECTING_PHONE:
          session.data.phone = req.body.Body;
          session.state = STATES.COLLECTING_LOCATION;
          responseMessage = "Where did you lose the item? Please provide the location details.";
          break;

        case STATES.COLLECTING_LOCATION:
          session.data.location = req.body.Body;
          session.state = STATES.COLLECTING_DESCRIPTION;
          responseMessage = "Please describe the lost item in detail (color, size, unique features).";
          break;

        case STATES.COLLECTING_DESCRIPTION:
          session.data.description = req.body.Body;
          session.state = STATES.COLLECTING_IMAGE;
          responseMessage = "Thank you for the description. Do you have any pictures of the lost item? If yes, please send them now. If not, please type 'no'.";
          break;

        case STATES.COLLECTING_IMAGE:
          if (hasMedia) {
            if (!Array.isArray(session.data.images)) {
              session.data.images = [];
            }
            session.data.images.push(mediaUrl);
            responseMessage = "Thank you for sharing the image. Do you have any more pictures to share? If not, please type 'no'.";
          } else if (incomingMsg === "no") {
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
                status: "MATCHED",
                matchedBoxId: matchResult.boxId,
                matchedWith: matchResult.itemDetails
              });

              responseMessage = `Great news! We've found a potential match for your lost item!\n\n` +
                `Reference Number: ${refNumber}\n` +
                `Location: Box ${matchResult.boxId}\n\n` +
                `Please open our mobile app and enter this reference number to proceed with claiming your item.`;
            } else {
              await storeLostReport({
                ...session.data,
                referenceNumber: refNumber,
                status: "PENDING"
              });

              responseMessage = `We've recorded your lost item report.\n\n` +
                `Reference Number: ${refNumber}\n\n` +
                `We haven't found any matching items yet, but we'll notify you immediately if something is found. ` +
                `You can check the status anytime using this reference number in our mobile app.`;
            }

            session.state = STATES.START;
            session.data = {
              name: "",
              phone: "",
              location: "",
              description: "",
              images: []
            };
          } else {
            responseMessage = "Please send an image of your lost item or type 'no' if you don't have any images to share.";
          }
          break;

        default:
          session.state = STATES.START;
          responseMessage = getWelcomeMessage();
      }
    }

    await sessionRef.set(session);
    console.log("Sending response:", responseMessage);

    twiml.message(responseMessage);
    res.writeHead(200, {"Content-Type": "text/xml"});
    res.end(twiml.toString());

  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).send(error);
  }
});