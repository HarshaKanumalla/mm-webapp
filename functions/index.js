// Missing Matters System - Phase 2
// Enhanced WhatsApp integration and core functionality

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const twilio = require('twilio');
const { OpenAI } = require('openai');
const { onValueCreated } = require('firebase-functions/v2/database');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onObjectFinalized } = require('firebase-functions/v2/storage');

// Set up error handling for uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Initialize Firebase
admin.initializeApp();

// Explicitly log configuration attempt for debugging
console.log('Loading Firebase configuration...');

// Safely access Firebase configuration
let firebaseConfig = {};
try {
  firebaseConfig = functions.config();
  console.log('Firebase configuration loaded successfully');
  
  // Debug configuration (don't log actual secrets)
  console.log('Configuration keys available:', Object.keys(firebaseConfig));
  if (firebaseConfig.twilio) {
    console.log('Twilio config keys:', Object.keys(firebaseConfig.twilio));
  } else {
    console.log('No Twilio configuration found');
  }
  
  if (firebaseConfig.openai) {
    console.log('OpenAI config keys:', Object.keys(firebaseConfig.openai));
  } else {
    console.log('No OpenAI configuration found');
  }
} catch (error) {
  console.error('Error loading Firebase config:', error);
}

// Initialize Twilio client with additional logging
let twilioClient;
try {
  // Check for Twilio configuration
  if (firebaseConfig.twilio && 
      firebaseConfig.twilio.account_sid && 
      firebaseConfig.twilio.auth_token) {
    
    console.log('Initializing Twilio client with configured credentials');
    twilioClient = twilio(
      firebaseConfig.twilio.account_sid,
      firebaseConfig.twilio.auth_token
    );
    console.log('Twilio client initialized successfully');
    
    // Store in environment variables for other functions
    process.env.TWILIO_ACCOUNT_SID = firebaseConfig.twilio.account_sid;
    process.env.TWILIO_AUTH_TOKEN = firebaseConfig.twilio.auth_token;
    
    if (firebaseConfig.twilio.phone_number) {
      process.env.TWILIO_PHONE_NUMBER = firebaseConfig.twilio.phone_number;
      console.log('Twilio phone number configured:', firebaseConfig.twilio.phone_number);
    } else {
      console.warn('Twilio phone number not configured');
    }
  } else {
    console.warn('Missing Twilio credentials. Twilio functionality will be limited.');
  }
} catch (error) {
  console.error('Error initializing Twilio client:', error);
}

// Initialize OpenAI with proper error handling
let openai;
try {
  if (firebaseConfig.openai && firebaseConfig.openai.apikey) {
    console.log('Initializing OpenAI client');
    openai = new OpenAI({
      apiKey: firebaseConfig.openai.apikey
    });
    process.env.OPENAI_API_KEY = firebaseConfig.openai.apikey;
    console.log('OpenAI client initialized successfully');
  } else {
    console.warn('OpenAI API key not found. OpenAI functionality will be limited.');
  }
} catch (error) {
  console.error('Error initializing OpenAI client:', error);
}

// Initialize Vision API with error handling
let vision;
try {
  vision = new (require('@google-cloud/vision').ImageAnnotatorClient)();
  console.log('Vision API client initialized successfully');
} catch (error) {
  console.error('Error initializing Vision API client:', error);
}

// Company information for reference
const COMPANY_INFO = {
  pmatts_description: `PMatts Private Limited is a leading technology innovation company transforming businesses through cutting-edge solutions in smart infrastructure, digital transformation, and security systems. Founded in 2010, PMatts has grown into a global technology leader with offices in 12 countries.

Through our innovation arm, PMatts Catalysts, we pioneer advancements in AI, ML, IoT, and blockchain technology to create solutions that address real-world challenges.

Our solutions deliver measurable impact:
- 40% reduction in operational costs
- 60% improvement in process efficiency
- 75% increase in automation coverage
- 30% energy savings across implementations
- 90% enhancement in security threat detection

PMatts serves clients across multiple industries including finance, healthcare, retail, and transportation.`,

  missing_matters_info: `Missing Matters is our flagship lost and found platform designed to help people recover their lost items quickly and securely.

Our platform works in three simple steps:
1. Report your lost item with details and optional photos
2. Our AI matching system scans all found items in the database
3. When a match is found, the item is securely stored in a smart box for you to retrieve

Missing Matters was founded in 2022 by the PMatts innovation team led by Dr. Sarah Johnson and has since helped thousands of people recover their valuable belongings with a 65% success rate - significantly higher than traditional lost and found systems.

Some key statistics about Missing Matters:
- Over 25,000 lost items successfully returned to owners
- Average recovery time of just 48 hours
- Available in 15 major cities across the country
- Partnerships with 50+ major transportation hubs and shopping centers
- Dedicated 24/7 customer support team`
};

// ---------- SESSION MANAGEMENT FUNCTIONS ---------- //

// Helper function to sanitize phone numbers for database keys
function sanitizePhoneNumber(phone) {
  return phone.replace(/[^\w]/g, '_');
}

async function getOrCreateSession(userPhone) {
  const sessionRef = admin.database().ref(`sessions/${sanitizePhoneNumber(userPhone)}`);
  const snapshot = await sessionRef.once('value');
  let session = snapshot.val();

  if (!session) {
    session = {
      userPhone,
      conversationState: 'GREETING',
      lastActivity: Date.now(),
      messages: [],
      lostItemReport: {}
    };
    await sessionRef.set(session);
  }

  return session;
}

async function updateSession(userPhone, updates) {
  const sessionRef = admin.database().ref(`sessions/${sanitizePhoneNumber(userPhone)}`);
  return sessionRef.update({
    ...updates,
    lastActivity: Date.now()
  });
}

// Generate reference numbers for lost item reports
function generateReferenceNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `MM-${timestamp}-${random}`;
}

// ---------- SIMPLE INTENT DETECTION ---------- //

// Simple intent detection function without OpenAI dependency
function detectIntent(message) {
  const lowerMessage = message.toLowerCase();
  
  // Simple pattern matching for common intents
  if (/^(hi|hello|hey|greetings)/i.test(lowerMessage)) {
    return 'GREETING';
  }
  
  if (/lost|missing|find|found|report/i.test(lowerMessage)) {
    return 'LOST_ITEM';
  }
  
  if (/about|company|pmatts|info/i.test(lowerMessage)) {
    return 'COMPANY_INFO';
  }
  
  if (/^(1|one)$/i.test(lowerMessage)) {
    return 'LOST_ITEM';
  }
  
  if (/^(2|two)$/i.test(lowerMessage)) {
    return 'COMPANY_INFO';
  }
  
  if (/^(skip)$/i.test(lowerMessage)) {
    return 'SKIP_IMAGE';
  }
  
  // Default intent
  return 'UNKNOWN';
}

// Generate a simple response based on state and intent
function generateResponse(intent, session) {
  const userName = session.userName || 'there';
  const conversationState = session.conversationState;
  
  // Basic state machine for responses
  switch (conversationState) {
    case 'GREETING':
      return `👋 Hi ${userName}! Welcome to Missing Matters. I'm here to help you recover lost items or brief you about our services. Please choose an option: 1. I lost something. 2. About PMatts Private Limited. (Type "1" or "2" to proceed)`;
      
    case 'MENU_PROMPT':
      if (intent === 'LOST_ITEM') {
        return `I'm sorry to hear you've lost something. Could you please describe the item you've lost?`;
      } else if (intent === 'COMPANY_INFO') {
        return COMPANY_INFO.pmatts_description;
      } else {
        return `Please choose an option: 1. I lost something. 2. About PMatts Private Limited.`;
      }
  }
  
  // Default responses based on intent only
  switch (intent) {
    case 'GREETING':
      return `👋 Hi ${userName}! How can I help you today?`;
      
    case 'LOST_ITEM':
      return `I can help you report a lost item. Could you please describe what you've lost?`;
      
    case 'COMPANY_INFO':
      return COMPANY_INFO.pmatts_description;
      
    default:
      return `Hi ${userName}! I'm here to help with lost items. Type "1" to report a lost item or "2" to learn about PMatts Private Limited.`;
  }
}

// ---------- ENHANCED WHATSAPP WEBHOOK FUNCTION ---------- //

// Main webhook to handle incoming WhatsApp messages
exports.whatsappWebhook = functions.https.onRequest(async (req, res) => {
  try {
    // Extract message details from Twilio request
    const incomingMessage = req.body.Body || '';
    const userPhone = req.body.From || '';
    const hasMedia = req.body.NumMedia && parseInt(req.body.NumMedia) > 0;
    const mediaUrl = hasMedia ? req.body.MediaUrl0 : null;
    
    console.log(`Received message from ${userPhone}: ${incomingMessage}`);
    console.log(`Media included: ${hasMedia}`);
    
    if (!userPhone) {
      return res.status(400).send('Missing required parameters');
    }
    
    // Get or create user session
    const session = await getOrCreateSession(userPhone);
    
    // Add message to conversation history
    if (!session.messages) {
      session.messages = [];
    }
    
    session.messages.push({
      role: 'user',
      content: incomingMessage,
      timestamp: Date.now()
    });
    
    // Limit conversation history to last 20 messages
    if (session.messages.length > 20) {
      session.messages = session.messages.slice(-20);
    }
    
    // Detect intent
    const intent = detectIntent(incomingMessage);
    console.log(`Detected intent: ${intent}`);
    
    // Set default state if none exists
    if (!session.conversationState) {
      session.conversationState = 'GREETING';
    }
    
    // Update state based on intent
    if (intent === 'GREETING') {
      session.conversationState = 'GREETING';
    } else if (intent === 'LOST_ITEM' && session.conversationState === 'MENU_PROMPT') {
      session.conversationState = 'COLLECT_DESCRIPTION';
    } else if (intent === 'COMPANY_INFO') {
      // Stay in current state after providing company info
    } else if (session.conversationState === 'GREETING') {
      session.conversationState = 'MENU_PROMPT';
    }
    
    // Generate response based on intent and state
    let responseMessage = generateResponse(intent, session);
    
    // Handle media attachments
    if (hasMedia) {
      responseMessage = `Thank you for sharing the image. This will help us identify your item better. ${responseMessage}`;
    }
    
    // Add response to conversation history
    session.messages.push({
      role: 'assistant',
      content: responseMessage,
      timestamp: Date.now()
    });
    
    // Update session
    await updateSession(userPhone, { 
      messages: session.messages,
      conversationState: session.conversationState
    });
    
    // Send response via Twilio
    if (twilioClient) {
      console.log('Sending response via Twilio');
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message(responseMessage);
      
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(twiml.toString());
    } else {
      // Fallback if Twilio is not initialized
      console.warn('Twilio client not initialized, sending plain text response');
      res.status(200).send(responseMessage);
    }
    
  } catch (error) {
    console.error('Error processing WhatsApp message:', error);
    
    try {
      // Even with errors, attempt to send a response
      if (twilioClient) {
        const twiml = new twilio.twiml.MessagingResponse();
        twiml.message('I apologize, but I encountered an error processing your message. Please try again later.');
        
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end(twiml.toString());
      } else {
        res.status(500).send('Error processing message');
      }
    } catch (responseError) {
      console.error('Error sending error response:', responseError);
      res.status(500).send('Error processing request');
    }
  }
});

// ---------- STORAGE TRIGGER FUNCTION ---------- //

// Image analysis function - Enhanced but still simplified
exports.analyzeStorageImage = onObjectFinalized({
  bucket: undefined, 
  region: 'us-central1'
}, async (event) => {
  try {
    const object = event.data;
    if (!object || !object.name) {
      console.error('Invalid storage object received');
      return null;
    }

    const filePath = object.name;
    const fileName = filePath.split('/').pop();

    console.log(`Processing uploaded file: ${fileName}`);
    
    // Check if Vision API is available
    if (!vision) {
      console.warn('Vision API client not available, skipping image analysis');
      return {
        success: false,
        message: 'Vision API not available'
      };
    }
    
    // Basic image properties (minimal implementation)
    return {
      success: true,
      fileName,
      filePath,
      message: 'File processed. Full analysis will be implemented in next phase.'
    };
  } catch (error) {
    console.error('Error in analyzeStorageImage:', error);
    return { success: false, error: error.message };
  }
});

// ---------- DATABASE TRIGGER FUNCTIONS ---------- //

// Using V2 Firestore trigger - Simplified for initial deployment
exports.processPotentialMatchesFirestore = onDocumentCreated({
  document: 'lost_item_features/{referenceNumber}',
  region: 'us-central1'
}, async (event) => {
  const referenceNumber = event.params.referenceNumber;
  
  try {
    console.log(`Firestore trigger for referenceNumber: ${referenceNumber}`);
    return { success: true, message: 'Document processed' };
  } catch (error) {
    console.error(`Error processing Firestore document:`, error);
    return { success: false, error: error.message };
  }
});

// Using V2 RTDB trigger - Simplified for initial deployment
exports.processPotentialMatchesV2 = onValueCreated({
  ref: '/lost_item_features/{referenceNumber}',
  region: 'us-central1'
}, async (event) => {
  const referenceNumber = event.params.referenceNumber;
  
  try {
    console.log(`RTDB trigger for referenceNumber: ${referenceNumber}`);
    return { success: true, message: 'Database entry processed' };
  } catch (error) {
    console.error(`Error processing database entry:`, error);
    return { success: false, error: error.message };
  }
});

// ---------- UTILITY ENDPOINT FUNCTIONS ---------- //

// Store lost item report in database
async function storeLostItemReport(report) {
  const reportRef = admin.database().ref('lostItems');
  return reportRef.push(report);
}

// Status check endpoint with basic implementation
exports.checkLostItemStatus = functions.https.onRequest(async (req, res) => {
  try {
    const { referenceNumber, phone } = req.query;
    
    if (!referenceNumber) {
      return res.status(400).json({ error: 'Reference number is required' });
    }
    
    // Query the database for the report
    const lostItemsRef = admin.database().ref('lostItems');
    const snapshot = await lostItemsRef.orderByChild('referenceNumber').equalTo(referenceNumber).once('value');
    const reportData = snapshot.val();
    
    if (!reportData) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    // Convert from object to array
    const report = Object.values(reportData)[0];
    
    // If phone is provided, verify it matches the report
    if (phone && report.phone !== phone) {
      return res.status(403).json({ error: 'Phone number does not match report' });
    }
    
    // Return status information
    return res.status(200).json({
      referenceNumber: report.referenceNumber,
      status: report.status || 'PENDING',
      reportDate: report.reportDate,
      lastUpdated: report.lastUpdated || report.reportDate,
      potentialMatchCount: report.potentialMatches?.length || 0
    });
    
  } catch (error) {
    console.error('Error checking report status:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Enhanced health check endpoint with configuration status
exports.healthCheck = functions.https.onRequest((req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: Date.now(),
    services: {
      firebase: true,
      twilio: !!twilioClient,
      openai: !!openai,
      vision: !!vision
    },
    configuration: {
      twilio_configured: !!(firebaseConfig.twilio?.account_sid && firebaseConfig.twilio?.auth_token),
      openai_configured: !!firebaseConfig.openai?.apikey
    },
    availableConfigs: Object.keys(firebaseConfig),
    phase: '2.0',
    message: 'Missing Matters system is operational - Phase 2'
  });
});

// Function to set up Twilio configuration
exports.configureTwilio = functions.https.onRequest(async (req, res) => {
  try {
    // This should only be used in a secure environment with authentication
    const { account_sid, auth_token, phone_number } = req.body;
    
    if (!account_sid || !auth_token) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Set configuration values
    await admin.firestore().collection('config').doc('twilio').set({
      account_sid,
      auth_token,
      phone_number: phone_number || '',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Also set in Firebase Functions config
    // Note: This is a more complex operation that may require additional steps
    // and will only take effect after redeployment
    
    return res.status(200).json({ success: true, message: 'Twilio configuration updated' });
  } catch (error) {
    console.error('Error configuring Twilio:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Export all functions
module.exports = {
  whatsappWebhook: exports.whatsappWebhook,
  analyzeStorageImage: exports.analyzeStorageImage,
  processPotentialMatchesFirestore: exports.processPotentialMatchesFirestore, 
  processPotentialMatchesV2: exports.processPotentialMatchesV2,
  checkLostItemStatus: exports.checkLostItemStatus,
  healthCheck: exports.healthCheck,
  configureTwilio: exports.configureTwilio
};