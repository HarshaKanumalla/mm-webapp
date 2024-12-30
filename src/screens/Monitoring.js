import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth, signOut } from "firebase/auth";
import { getDatabase, ref as dbRef, set, onChildAdded, onValue, update } from "firebase/database";
import { getStorage, ref as storageRef, listAll, getDownloadURL } from "firebase/storage";
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as mobilenet from '@tensorflow-models/mobilenet';

// Import all necessary images
import dashboard from "./dashboard.png";
import dataCenter from "./data-center.png";
import futures from "./futures.png";
import lineChart from "./line-chart.png";
import tasks from "./tasks.png";
import logout from "./logout.png";
import lessThan from "./less-than.png";
import moreThan from "./more-than.png";
import openParcel from "./open-parcel.png";
import boxImportant from "./box-important.png";

// Constants
const DEFAULT_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
const DETECTION_THRESHOLD = 0.7;
const MODEL_CONFIG = {
  version: 2,
  alpha: 1.0,
  inputSize: { width: 224, height: 224 },
  quantBytes: 4
};

// Advanced AI Detection System
class AIObjectDetector {
  constructor() {
    this.model = null;
    this.isInitialized = false;
    this.processingQueue = new Map();
    
    // Comprehensive item categories and labels
    this.itemCategories = {
      bags: {
        labels: ['backpack', 'bag', 'handbag', 'suitcase', 'briefcase', 'duffel', 'luggage'],
        confidence: 0.75
      },
      electronics: {
        labels: ['laptop', 'computer', 'mobile phone', 'camera', 'tablet', 'phone', 'electronic device'],
        confidence: 0.8
      },
      documents: {
        labels: ['book', 'document', 'folder', 'paper', 'notebook', 'magazine'],
        confidence: 0.7
      },
      personal_items: {
        labels: ['wallet', 'purse', 'umbrella', 'watch', 'glasses', 'keys'],
        confidence: 0.75
      },
      containers: {
        labels: ['bottle', 'container', 'box', 'package', 'carton'],
        confidence: 0.65
      }
    };

    // Enhanced label mapping for better accuracy
    this.labelMap = {
      'laptop computer': 'Laptop',
      'notebook computer': 'Laptop',
      'cellular telephone': 'Mobile Phone',
      'mobile phone': 'Mobile Phone',
      'cellphone': 'Mobile Phone',
      'hand bag': 'Handbag',
      'brief case': 'Briefcase',
      'back pack': 'Backpack',
      'shopping bag': 'Bag',
      'plastic bag': 'Bag',
      'paper bag': 'Bag',
      'carrying case': 'Bag',
      'suit case': 'Suitcase',
      'traveling bag': 'Suitcase',
      'document holder': 'Document',
      'folder': 'Document',
      'container': 'Container',
      'package': 'Package',
      'box': 'Box',
      'carton': 'Box'
    };
  }

  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      await tf.setBackend('webgl');
      await tf.ready();
      console.log('TensorFlow.js initialized successfully');

      this.model = await mobilenet.load();
      console.log('MobileNet model loaded successfully');

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Model initialization error:', error);
      this.isInitialized = false;
      return false;
    }
  }

  preprocessImage(imageElement) {
    return tf.tidy(() => {
      console.log('Starting image preprocessing');
      
      // Basic input validation
      if (!imageElement.complete) {
        throw new Error('Image not fully loaded');
      }

      // Create tensor from image and log shape
      const tensor = tf.browser.fromPixels(imageElement);
      console.log('Original tensor shape:', tensor.shape);

      // Resize to model's expected size (224x224)
      const resized = tf.image.resizeBilinear(tensor, [224, 224]);
      console.log('Resized tensor shape:', resized.shape);

      // Normalize values to [-1, 1] range
      const normalized = resized.toFloat().div(tf.scalar(127.5)).sub(tf.scalar(1));
      console.log('Normalized tensor stats:', {
        shape: normalized.shape,
        dtype: normalized.dtype
      });

      // Add batch dimension
      const batched = normalized.expandDims(0);
      console.log('Final tensor shape:', batched.shape);

      return batched;
    });
  }
  
  async detectObjects(imageElement) {
    if (!this.isInitialized || !this.model) {
      throw new Error('AI Object Detector not initialized');
    }
    
    let imageTensor = null;
    try {
      // Log image properties for debugging
      console.log('Image properties:', {
        width: imageElement.naturalWidth,
        height: imageElement.naturalHeight,
        complete: imageElement.complete,
        crossOrigin: imageElement.crossOrigin
      });

      imageTensor = this.preprocessImage(imageElement);

      // Perform classification with lower threshold for testing
      const predictions = await this.model.classify(imageTensor, {
        topk: 5,
        threshold: 0.05
      });

      console.log('Raw predictions from model:', predictions);

      if (!predictions || predictions.length === 0) {
        return {
          success: false,
          message: 'No predictions detected',
          detections: null
        };
      } 

      // Process and enhance predictions
      const enhancedPredictions = this.enhanceDetections(predictions);
      console.log('Enhanced predictions:', enhancedPredictions);
      
      // Ensure we have valid enhanced predictions
      if (!enhancedPredictions || enhancedPredictions.length === 0) {
        console.log('No valid enhanced predictions');
        return {
          success: false,
          message: 'No valid predictions after enhancement',
          detections: null
        };
      }

      // Sort predictions by confidence and apply additional filtering
      const finalPredictions = this.filterAndRankPredictions(enhancedPredictions);
      console.log('Final filtered predictions:', finalPredictions);

      // Ensure we have at least one valid prediction after filtering
      if (!finalPredictions || finalPredictions.length === 0) {
        console.log('No predictions passed confidence threshold');
        return {
          success: false,
          message: 'No predictions met confidence threshold',
          detections: null
        };
      }

      // Create properly structured detection result
      const detectionResult = {
        success: true,
        detections: {
          primaryObject: {
            originalLabel: finalPredictions[0].originalLabel,
            confidence: finalPredictions[0].confidence,
            category: finalPredictions[0].category
          },
          allObjects: finalPredictions.map(pred => ({
            originalLabel: pred.originalLabel,
            confidence: pred.confidence,
            category: pred.category
          })),
          timestamp: Date.now(),
          metadata: {
            modelVersion: MODEL_CONFIG.version,
            threshold: DETECTION_THRESHOLD,
            processingTime: Date.now()
          }
        }
      };

      // Log successful detection
      console.log('Detection completed successfully:', detectionResult);
      
      return detectionResult;

  } catch (error) {
      console.error('Detailed error during object detection:', {
        message: error.message,
        stack: error.stack
      });
      return {
        success: false,
        message: error.message,
        detections: null
      };
    } finally {
      if (imageTensor) {
        imageTensor.dispose();
      }
    }
  }

  enhanceDetections(predictions) {
    if (!Array.isArray(predictions)) {
      console.error('Invalid predictions array received');
      return [];
    }

    return predictions.map(prediction => {
      if (!prediction || !prediction.className) {
        console.warn('Invalid prediction object encountered');
        return null;
      }

      const normalizedLabel = prediction.className.toLowerCase();
      const category = this.categorizeItem(normalizedLabel);
      const enhancedLabel = this.enhanceLabel(prediction.className);
      
      return {
        originalLabel: enhancedLabel || 'Unknown Object',
        category: category.name || 'other',
        confidence: Math.round((prediction.probability || 0) * 100),
        threshold: category.confidence || DETECTION_THRESHOLD,
        metadata: {
          rawScore: prediction.probability || 0,
          modelName: 'MobileNet',
          originalLabel: prediction.className || 'unknown'
        }
      };
    }).filter(Boolean); // Remove any null entries
  }

  enhanceDetections(predictions) {
    return predictions.map(prediction => {
      const normalizedLabel = prediction.className.toLowerCase();
      const category = this.categorizeItem(normalizedLabel);
      const enhancedLabel = this.enhanceLabel(prediction.className);
      
      return {
        originalLabel: enhancedLabel,
        category: category.name,
        confidence: Math.round(prediction.probability * 100),
        threshold: category.confidence,
        metadata: {
          rawScore: prediction.probability,
          modelName: 'MobileNet',
          originalLabel: prediction.className
        }
      };
    });
  }

  filterAndRankPredictions(predictions) {
    return predictions
      .filter(pred => {
        const categoryThreshold = this.getCategoryThreshold(pred.category);
        return (pred.confidence / 100) >= categoryThreshold;
      })
      .sort((a, b) => b.confidence - a.confidence)
      .map(pred => ({
        ...pred,
        confidence: Math.min(Math.round(pred.confidence * 1.2), 100) // Slight confidence boost for matched categories
      }));
  }

  categorizeItem(label) {
    for (const [categoryName, category] of Object.entries(this.itemCategories)) {
      if (category.labels.some(itemLabel => label.includes(itemLabel))) {
        return {
          name: categoryName,
          confidence: category.confidence
        };
      }
    }
    return {
      name: 'other',
      confidence: DETECTION_THRESHOLD
    };
  }

  getCategoryThreshold(category) {
    return this.itemCategories[category]?.confidence || DETECTION_THRESHOLD;
  }

  enhanceLabel(label) {
    const normalizedLabel = label.toLowerCase();
    return this.labelMap[normalizedLabel] || label;
  }
}

// Enhanced CameraImageCell Component with Advanced Detection Integration
const CameraImageCell = React.memo(({ 
  item, 
  detector, 
  selectedBox, 
  index, 
  detectedObjects, 
  handleImageClick, 
  formatTimestamp,
  updateDetectionInFirebase 
}) => {
  const [detectionDetails, setDetectionDetails] = useState(null);
  const [detectionStatus, setDetectionStatus] = useState('pending');
  const hasProcessed = useRef(false);
  const processingTimeout = useRef(null);

  useEffect(() => {
    const detectObjects = async () => {
      if (!hasProcessed.current && detector && item.cameraImage !== "-") {
        hasProcessed.current = true;
        setDetectionStatus('processing');
    
        try {
          const img = new Image();
          img.crossOrigin = "anonymous";
          
          await new Promise((resolve, reject) => {
            img.onload = () => {
              console.log('Image loaded successfully:', {
                width: img.naturalWidth,
                height: img.naturalHeight,
                complete: img.complete
              });
              resolve();
            };
            img.onerror = (error) => {
              console.error('Image load error:', error);
              reject(new Error('Failed to load image'));
            };
            img.src = item.cameraImage;
          });
    
          // Ensure image is fully loaded before processing
          if (!img.complete || !img.naturalWidth) {
            throw new Error('Image failed to load properly');
          }
    
          const result = await detector.detectObjects(img);
          
          if (result?.success && result?.detections) {
            setDetectionDetails(result.detections);
            setDetectionStatus('completed');
            
            if (updateDetectionInFirebase) {
              await updateDetectionInFirebase(
                selectedBox,
                item.timestamp,
                result.detections
              );
            }
          } else {
            console.error('Detection failed:', result?.message);
            setDetectionStatus('failed');
          }
        } catch (error) {
          console.error('Detection process error:', error);
          setDetectionStatus('error');
        }
      }
    };

    detectObjects();

    // Cleanup function
    return () => {
      if (processingTimeout.current) {
        clearTimeout(processingTimeout.current);
      }
    };
  }, [detector, item.cameraImage, selectedBox, item.timestamp, updateDetectionInFirebase]);

  // Handle case when no image is present
  if (item.cameraImage === "-") {
    return <span className="text-[#858080]">-</span>;
  }

  const imageId = `${selectedBox}-${index}`;
  const detection = detectedObjects[imageId] || detectionDetails;

  // Render detection status and results
  const renderDetectionInfo = () => {
    if (detection?.primaryObject) {
      return (
        <div className="text-xs">
          <span className="text-[#339265]">
            {detection.primaryObject.originalLabel} ({detection.primaryObject.confidence}%)
          </span>
          {detection.allObjects?.length > 1 && (
            <span className="text-[#858080] mt-1 block">
              +{detection.allObjects.length - 1} more items
            </span>
          )}
          <span className="text-[#858080] text-xs block">
            {detection.primaryObject.category}
          </span>
        </div>
      );
    }

    // Show different messages based on detection status
    const statusMessages = {
      pending: "Waiting to process...",
      processing: "Analyzing image...",
      timeout: "Detection timed out",
      failed: "Detection failed",
      error: "Error processing image"
    };

    return (
      <span className="text-xs text-[#858080]">
        {statusMessages[detectionStatus] || "Processing..."}
      </span>
    );
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center">
        <div className="relative">
          <img
            src={item.cameraImage}
            alt="Box Camera"
            className="w-10 h-10 rounded-md object-cover cursor-pointer"
            onClick={() => handleImageClick(item.cameraImage)}
          />
          {detectionStatus === 'processing' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-md">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
        <div className="flex flex-col ml-2">
          <span className="text-sm text-[#858080]">
            {formatTimestamp(item.timestamp)}
          </span>
          {renderDetectionInfo()}
        </div>
      </div>
    </div>
  );
});

CameraImageCell.displayName = 'CameraImageCell';

// Firebase Integration Helper Functions
const saveRowToCompleteData = async (boxId, rowData, detectedObjects = {}) => {
  try {
    const db = getDatabase();
    const timestamp = rowData.timestamp;
    const formattedTimestamp = timestamp.replace(/[.[\]#$/]/g, '_');
    const path = `Complete_data/${boxId}/${formattedTimestamp}`;

    const imageId = `${boxId}-${rowData.timestamp}`;
    const detectedItem = detectedObjects[imageId];

    const dataToSave = {
      box_ID: boxId,
      timestamp: timestamp,
      camera_image: rowData.cameraImage || "-",
      form_image: rowData.formImageUrl || "-",
      status: rowData.status || "UNCLAIMED",
      detected_item: detectedItem ? {
        primary_object: {
          label: detectedItem.primaryObject.originalLabel,
          confidence: detectedItem.primaryObject.confidence,
          category: detectedItem.primaryObject.category
        },
        all_objects: detectedItem.allObjects,
        detection_timestamp: detectedItem.timestamp,
        metadata: detectedItem.metadata
      } : null,
      additional_details: {
        name: rowData.Name || "-",
        phone_number: rowData["Phone number"] || "-",
        item_description: rowData["Please describe the item"] || "-",
        box_id: rowData["Please enter the box ID you're putting the item in?"] || boxId,
        item_type: rowData["What is the item?"] || "-",
        item_location: rowData["Where did you find the item?"] || "-"
      }
    };

    await set(dbRef(db, path), dataToSave);
    return true;
  } catch (error) {
    console.error("Error saving row:", error);
    return false;
  }
};

export const Monitoring = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  const db = getDatabase();
  const storage = getStorage();
  const activeBoxRef = useRef(null);
  const scrollContainerRef = useRef(null);

  // State Management
  const [selectedBox, setSelectedBox] = useState(1506);
  const [popUpImage, setPopUpImage] = useState(null);
  const [showDetailsBox, setShowDetailsBox] = useState(false);
  const [activeRow, setActiveRow] = useState(0);
  const [boxDetails, setBoxDetails] = useState({});
  const [processedEvents] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [detector, setDetector] = useState(null);
  const [detectedObjects, setDetectedObjects] = useState({});

  // Initialize AI Detector
  useEffect(() => {
    const initializeDetector = async () => {
      try {
        const aiDetector = new AIObjectDetector();
        const initialized = await aiDetector.initialize();
        if (initialized) {
          setDetector(aiDetector);
          console.log('AI Detector initialized successfully');
        } else {
          console.error('Failed to initialize AI Detector');
        }
      } catch (error) {
        console.error('Error during detector initialization:', error);
      }
    };

    initializeDetector();
  }, []);

  // Firebase Integration Functions
  const updateDetectionInFirebase = async (boxId, timestamp, detectionResult) => {
    try {
      // First, validate that we have the required data
      if (!detectionResult || !detectionResult.primaryObject) {
        console.log('No valid detection results to update in Firebase');
        return;
      }
  
      const formattedTimestamp = timestamp.replace(/[.[\]#$/]/g, '_');
      const path = `Complete_data/${boxId}/${formattedTimestamp}/detected_item`;
  
      // Create a safe version of the detection data
      const detectionData = {
        primary_object: {
          label: detectionResult.primaryObject?.originalLabel || 'Unknown',
          confidence: detectionResult.primaryObject?.confidence || 0,
          category: detectionResult.primaryObject?.category || 'unknown'
        },
        all_objects: Array.isArray(detectionResult.allObjects) 
          ? detectionResult.allObjects.map(obj => ({
              label: obj?.originalLabel || 'Unknown',
              confidence: obj?.confidence || 0,
              category: obj?.category || 'unknown'
            }))
          : [],
        detection_timestamp: detectionResult.timestamp || Date.now(),
        metadata: {
          modelVersion: detectionResult.metadata?.modelVersion || '',
          threshold: detectionResult.metadata?.threshold || 0,
          processingTime: detectionResult.metadata?.processingTime || Date.now()
        }
      };
  
      // Update Firebase with the validated data
      const db = getDatabase();
      await update(dbRef(db, path), detectionData);
      console.log('Detection data successfully updated in Firebase');
    } catch (error) {
      console.error('Error updating Firebase with detection:', error);
    }
  };

  const handleDoorStatusChange = async (boxId, status) => {
    if (status === 'door_open') {
      const numericBoxId = parseInt(boxId);
      activeBoxRef.current = numericBoxId;
      setSelectedBox(numericBoxId);
      setActiveRow(0);

      setBoxDetails(prevDetails => {
        const updatedDetails = { ...prevDetails };
        if (!updatedDetails[boxId]) {
          updatedDetails[boxId] = { middleContent: [] };
        }

        const timestamp = new Date().toISOString();
        const newEntry = {
          timestamp,
          cameraImage: "-",
          formImageUrl: "-",
          Name: "-",
          "Phone number": "-",
          "Please describe the item": "-",
          "Please enter the box ID you're putting the item in?": boxId,
          "What is the item?": "-",
          "Where did you find the item?": "-",
          status: "UNCLAIMED",
          bottomActions: {
            doorOpened: true,
            imageCaptured: false,
            sentToCloud: false,
            qrDisplayed: false,
            formSubmitted: false
          }
        };

        const recentEntryIndex = updatedDetails[boxId].middleContent.findIndex(
          entry => isTimestampInRange(entry.timestamp, timestamp)
        );

        if (recentEntryIndex !== -1) {
          updatedDetails[boxId].middleContent[recentEntryIndex].bottomActions.doorOpened = true;
          saveRowToCompleteData(boxId, updatedDetails[boxId].middleContent[recentEntryIndex]);
        } else {
          updatedDetails[boxId].middleContent.push(newEntry);
          saveRowToCompleteData(boxId, newEntry);
        }

        return updatedDetails;
      });
    }
  };

  const fetchCameraImages = async (storage, boxId) => {
    try {
      const imagesRef = storageRef(storage, 'missingmatters_photos/Camera_Images/');
      const imagesList = await listAll(imagesRef);
      const cameraImages = new Set();

      for (const item of imagesList.items) {
        const fileName = item.name;
        if (fileName.startsWith(`HN ${boxId}`)) {
          const imageId = `${boxId}-${fileName}`;
          if (!processedEvents.has(imageId)) {
            try {
              const timestampMatch = fileName.match(/(?:\d{4}-?\d{2}-?\d{2})T\d{6}\.\d{3}Z/);
              const timestamp = timestampMatch ? timestampMatch[0] : null;

              if (timestamp) {
                const imageUrl = await getDownloadURL(item);
                cameraImages.add(JSON.stringify({
                  timestamp,
                  cameraImage: imageUrl,
                  fileName,
                  id: imageId
                }));
                processedEvents.add(imageId);
              }
            } catch (error) {
              console.error(`Error processing image ${fileName}:`, error);
            }
          }
        }
      }

      return Array.from(cameraImages).map(jsonStr => JSON.parse(jsonStr));
    } catch (error) {
      console.error("Error fetching camera images:", error);
      return [];
    }
  };

  // Time and Format Utilities
  const parseTimestamp = (timestampStr) => {
    try {
      let reformattedTimestamp = timestampStr;
      if (timestampStr.match(/^\d{8}T\d{6}\.\d{3}Z$/)) {
        reformattedTimestamp = timestampStr.replace(
          /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d{3})Z$/,
          "$1-$2-$3T$4:$5:$6.$7Z"
        );
      } else {
        reformattedTimestamp = timestampStr.replace(
          /T(\d{2})(\d{2})(\d{2})\.(\d{3})Z$/,
          "T$1:$2:$3.$4Z"
        );
      }

      const parsedTimestamp = new Date(reformattedTimestamp);
      if (isNaN(parsedTimestamp.getTime())) {
        console.error("Invalid timestamp format:", timestampStr);
        return null;
      }
      return parsedTimestamp;
    } catch (error) {
      console.error(`Timestamp Parsing Error: ${error.message}`, timestampStr);
      return null;
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '-';
    const parsedDate = parseTimestamp(timestamp);
    if (!parsedDate) return '-';
    try {
      return parsedDate.toLocaleString('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
        day: 'numeric',
        month: 'short'
      });
    } catch (error) {
      console.error('Error formatting timestamp:', error);
      return '-';
    }
  };

  const isTimestampInRange = (timestamp1, timestamp2, logDetails = false) => {
    if (!timestamp1 || !timestamp2) return false;
    
    const date1 = parseTimestamp(timestamp1);
    const date2 = parseTimestamp(timestamp2);
    
    if (!date1 || !date2) return false;
    
    const timeDiffMs = Math.abs(date1.getTime() - date2.getTime());
    const TIMESTAMP_WINDOW_MS = 2 * 60 * 1000; // 2 minutes window

    return timeDiffMs <= TIMESTAMP_WINDOW_MS;
  };

  // Event Handlers
  const handleScrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -200, behavior: "smooth" });
    }
  };

  const handleScrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 200, behavior: "smooth" });
    }
  };

  const handleBoxClick = (num) => {
    setSelectedBox(num);
    setActiveRow(0);
  };

  const handleRowClick = (rowIndex) => {
    setActiveRow(rowIndex);
  };

  const handleLogout = () => {
    signOut(auth)
      .then(() => navigate("/"))
      .catch((error) => console.error("Error logging out:", error));
  };

  const handleImageClick = (imageSrc) => {
    if (!imageSrc) return;
    if (imageSrc.includes('drive.google.com')) {
      try {
        const fileId = imageSrc.match(/id=([^&]+)/)[1];
        setPopUpImage(`https://drive.google.com/uc?id=${fileId}&export=view`);
      } catch (error) {
        console.error('Error processing pop-up image URL:', error);
      }
    } else {
      setPopUpImage(imageSrc);
    }
  };

  const handleDetailsIconClick = (index) => {
    setActiveRow(index);
    setShowDetailsBox(true);
  };

  const closePopUp = () => {
    setActiveRow(null);
    setShowDetailsBox(false);
  };

  // Firebase Listeners Setup
  useEffect(() => {
    let isSubscribed = true;
    const unsubscribers = [];
    setIsLoading(true);

    const setupListeners = async () => {
      try {
        const boxIds = ['1506', '1507'];
        
        // Door status listeners
        boxIds.forEach(boxId => {
          const doorStatusRef = dbRef(db, `devices/${boxId}/door_status`);
          const unsubscribe = onValue(doorStatusRef, (snapshot) => {
            if (isSubscribed) {
              const status = snapshot.val();
              handleDoorStatusChange(boxId, status);
            }
          });
          unsubscribers.push(unsubscribe);
        });

        // Door events listener
        const doorEventsRef = dbRef(db, 'door_events');
        const doorUnsubscribe = onChildAdded(doorEventsRef, (snapshot) => {
          const eventId = `door-${snapshot.key}`;
          if (!processedEvents.has(eventId) && isSubscribed) {
            const data = snapshot.val();
            if (data.boxId === String(selectedBox)) {
              setBoxDetails(prevDetails => {
                const updatedDetails = { ...prevDetails };
                if (!updatedDetails[selectedBox]) {
                  updatedDetails[selectedBox] = { middleContent: [] };
                }

                const boxContent = updatedDetails[selectedBox].middleContent;
                const recentEntryIndex = boxContent.findIndex(
                  entry => isTimestampInRange(entry.timestamp, data.timestamp)
                );

                if (recentEntryIndex !== -1) {
                  boxContent[recentEntryIndex].bottomActions.doorOpened = true;
                  saveRowToCompleteData(selectedBox, boxContent[recentEntryIndex]);
                } else {
                  const newEntry = {
                    timestamp: data.timestamp,
                    cameraImage: "-",
                    formImageUrl: "-",
                    Name: "-",
                    "Phone number": "-",
                    "Please describe the item": "-",
                    "Please enter the box ID you're putting the item in?": selectedBox,
                    "What is the item?": "-",
                    "Where did you find the item?": "-",
                    status: "UNCLAIMED",
                    bottomActions: {
                      doorOpened: true,
                      imageCaptured: false,
                      sentToCloud: false,
                      qrDisplayed: false,
                      formSubmitted: false
                    }
                  };
                  boxContent.push(newEntry);
                  saveRowToCompleteData(selectedBox, newEntry);
                }
                return updatedDetails;
              });
              processedEvents.add(eventId);
            }
          }
        });
        unsubscribers.push(doorUnsubscribe);

        // Form responses listener
        const responsesRef = dbRef(db, 'responses');
        const responseUnsubscribe = onChildAdded(responsesRef, (snapshot) => {
          const eventId = `response-${snapshot.key}`;
          if (!processedEvents.has(eventId) && isSubscribed) {
            const data = snapshot.val();
            if (data["Please enter the box ID you're putting the item in?"] === String(selectedBox)) {
              setBoxDetails(prevDetails => {
                const updatedDetails = { ...prevDetails };
                if (!updatedDetails[selectedBox]) {
                  updatedDetails[selectedBox] = { middleContent: [] };
                }
                
                const boxContent = updatedDetails[selectedBox].middleContent;
                const matchingEntryIndex = boxContent.findIndex(entry => 
                  isTimestampInRange(entry.timestamp, data.timestamp)
                );

                if (matchingEntryIndex !== -1) {
                  boxContent[matchingEntryIndex] = {
                    ...boxContent[matchingEntryIndex],
                    ...data,
                    bottomActions: {
                      ...boxContent[matchingEntryIndex].bottomActions,
                      qrDisplayed: true,
                      formSubmitted: true
                    }
                  };
                  saveRowToCompleteData(selectedBox, boxContent[matchingEntryIndex]);
                } else {
                  const newEntry = {
                    ...data,
                    cameraImage: "-",
                    status: "UNCLAIMED",
                    bottomActions: {
                      doorOpened: false,
                      imageCaptured: false,
                      sentToCloud: false,
                      qrDisplayed: true,
                      formSubmitted: true
                    }
                  };
                  boxContent.push(newEntry);
                  saveRowToCompleteData(selectedBox, newEntry);
                }
                return updatedDetails;
              });
              processedEvents.add(eventId);
            }
          }
        });
        unsubscribers.push(responseUnsubscribe);

        // Fetch and process camera images
        const cameraImages = await fetchCameraImages(storage, selectedBox);
        if (isSubscribed) {
          cameraImages.forEach(imageData => {
            setBoxDetails(prevDetails => {
              const updatedDetails = { ...prevDetails };
              if (!updatedDetails[selectedBox]) {
                updatedDetails[selectedBox] = { middleContent: [] };
              }

              const boxContent = updatedDetails[selectedBox].middleContent;
              const matchingEntryIndex = boxContent.findIndex(entry => 
                entry.bottomActions.doorOpened && 
                isTimestampInRange(entry.timestamp, imageData.timestamp)
              );

              if (matchingEntryIndex !== -1) {
                boxContent[matchingEntryIndex].cameraImage = imageData.cameraImage
                boxContent[matchingEntryIndex].bottomActions = {
                  ...boxContent[matchingEntryIndex].bottomActions,
                  imageCaptured: true,
                  sentToCloud: true
                };
                saveRowToCompleteData(selectedBox, boxContent[matchingEntryIndex]);
              } else {
                const emptyImageEntryIndex = boxContent.findIndex(entry => 
                  entry.cameraImage === "-" && 
                  isTimestampInRange(entry.timestamp, imageData.timestamp)
                );

                if (emptyImageEntryIndex !== -1) {
                  boxContent[emptyImageEntryIndex].cameraImage = imageData.cameraImage;
                  boxContent[emptyImageEntryIndex].bottomActions = {
                    ...boxContent[emptyImageEntryIndex].bottomActions,
                    imageCaptured: true,
                    sentToCloud: true
                  };
                  saveRowToCompleteData(selectedBox, boxContent[emptyImageEntryIndex]);
                } else {
                  const newEntry = {
                    timestamp: imageData.timestamp,
                    cameraImage: imageData.cameraImage,
                    formImageUrl: "-",
                    Name: "-",
                    "Phone number": "-",
                    "Please describe the item": "-",
                    "Please enter the box ID you're putting the item in?": selectedBox,
                    "What is the item?": "-",
                    "Where did you find the item?": "-",
                    status: "UNCLAIMED",
                    bottomActions: {
                      doorOpened: false,
                      imageCaptured: true,
                      sentToCloud: true,
                      qrDisplayed: false,
                      formSubmitted: false
                    }
                  };
                  boxContent.push(newEntry);
                  saveRowToCompleteData(selectedBox, newEntry);
                }
              }
              return updatedDetails;
            });
          });
        }

        setIsLoading(false);
      } catch (error) {
        console.error("Error setting up listeners:", error);
        if (isSubscribed) {
          setIsLoading(false);
        }
      }
    };

    setupListeners();

    return () => {
      isSubscribed = false;
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [selectedBox, db, storage]);

  // Initial box selection
  useEffect(() => {
    setSelectedBox(1506);
  }, []);

  // Main render
  return (
    <div className="flex flex-col h-screen bg-[#D9D9D9] text-white">
      {/* Sidebar */}
      <div className="flex h-full">
        <div className="flex flex-col items-center py-8 bg-[#1e1e1e] w-24 rounded-tr-[25px] rounded-br-[25px]">
          <div className="bg-[#2A2929] rounded-full h-16 w-16 flex items-center justify-center mb-8">
            <span className="text-[#858080] text-[24px] font-semibold font-montserrat">MM</span>
          </div>
          <nav className="flex flex-col items-center justify-center flex-grow space-y-4">
            <img
              src={futures}
              alt="Futures"
              className="w-8 h-8 hover:opacity-80 cursor-pointer"
              onClick={() => navigate("/dashboard")}
            />
            <img
              src={dataCenter}
              alt="Data Center"
              className="w-8 h-8 hover:opacity-80 cursor-pointer"
              onClick={() => navigate("/ads")}
            />
            <img
              src={dashboard}
              alt="Dashboard"
              className="w-8 h-8 hover:opacity-80 cursor-pointer"
              onClick={() => navigate("/monitoring")}
            />
            <img 
              src={lineChart} 
              alt="Line Chart" 
              className="w-8 h-8 hover:opacity-80 cursor-pointer" 
            />
            <img 
              src={tasks} 
              alt="Tasks" 
              className="w-8 h-8 hover:opacity-80 cursor-pointer" 
            />
          </nav>
          <div className="mt-auto mb-4">
            <img
              src={logout}
              alt="Logout"
              className="w-8 h-8 hover:opacity-80 cursor-pointer"
              onClick={handleLogout}
            />
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 p-6 space-y-6">
          {/* Top Container - Box Selection */}
          <div className="flex items-center justify-between bg-[#D9D9D9] border border-[#1E1E1E] rounded-[25px] py-8 px-4 mx-10 relative">
            <button onClick={handleScrollLeft} className="p-2">
              <img src={lessThan} alt="Previous" className="w-6 h-6" />
            </button>
            <div
              ref={scrollContainerRef}
              className="flex overflow-x-auto space-x-6 ml-2 scrollbar-hide"
              style={{ scrollBehavior: "smooth" }}
            >
              {[1506, 1507].map((num) => (
                <div
                  key={num}
                  onClick={() => handleBoxClick(num)}
                  className="flex items-center justify-center space-x-4 p-3 rounded-[25px] shadow-md cursor-pointer"
                  style={{
                    width: "173.25px",
                    backgroundColor: selectedBox === num ? "#1E1E1E" : "#D9D9D9",
                    color: selectedBox === num ? "#858080" : "#000",
                    border: "1px solid #1E1E1E",
                  }}
                >
                  <img src={openParcel} alt="Box Icon" className="w-8 h-8" />
                  <span className="text-lg font-montserrat font-normal">HN {num}</span>
                </div>
              ))}
            </div>
            <button onClick={handleScrollRight} className="p-2">
              <img src={moreThan} alt="Next" className="w-6 h-6" />
            </button>
          </div>

          {/* Bottom Container - Action Status */}
          <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-[25px] h-[125px] mx-10 mt-6">
            <div className="flex items-center justify-evenly h-full px-10">
              {[
                { key: 'doorOpened', label: 'Door Opened' },
                { key: 'imageCaptured', label: 'Image Captured' },
                { key: 'sentToCloud', label: 'Sent to Cloud' },
                { key: 'qrDisplayed', label: 'QR displayed' },
                { key: 'formSubmitted', label: 'Form Submitted' }
              ].map(({ key, label }) => {
                const isActive = selectedBox && 
                  activeRow !== null && 
                  boxDetails[selectedBox]?.middleContent[activeRow]?.bottomActions?.[key];
                
                return (
                  <div key={key} className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                        isActive ? "border-[#339265]" : "border-[#D9D9D9]"
                      }`}
                    >
                      {isActive && (
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="#339265" 
                          strokeWidth="3" 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          className="w-6 h-6"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <p 
                      className="text-[#858080] mt-2"
                      style={{ 
                        fontFamily: 'Montserrat, sans-serif',
                        fontSize: '16px',
                        fontWeight: '400'
                      }}
                    >
                      {label}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Middle Container - Box Contents */}
          {selectedBox && (
            <div className="bg-[#1E1E1E] border border-[#858080] rounded-[25px] mx-10 p-4 mt-6 h-[50vh] overflow-y-auto">
              {/* Table Header */}
              <div className="flex items-center px-4 bg-[#1E1E1E] border border-[#3C3B3B] rounded-[15px] h-[50px] w-[95%] mx-auto">
                <div className="text-sm text-[#858080] font-semibold w-[10%] text-center">S. NO</div>
                <div className="h-full w-[1px] bg-gray-600"></div>
                <div className="text-sm text-[#858080] font-semibold flex-1 text-center">CAMERA IMAGE</div>
                <div className="h-full w-[1px] bg-gray-600"></div>
                <div className="text-sm text-[#858080] font-semibold flex-1 text-center">FORM IMAGE</div>
                <div className="h-full w-[1px] bg-gray-600"></div>
                <div className="text-sm text-[#858080] font-semibold flex-1 text-center">ADDITIONAL DETAILS</div>
                <div className="h-full w-[1px] bg-gray-600"></div>
                <div className="text-sm text-[#858080] font-semibold flex-1 text-center">STATUS</div>
              </div>

              {/* Table Content */}
              {boxDetails[selectedBox]?.middleContent?.length > 0 ? (
                boxDetails[selectedBox].middleContent.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center py-4 px-4 mt-4"
                    style={{
                      width: "95%",
                      margin: "0 auto",
                      borderBottom:
                        index < boxDetails[selectedBox].middleContent.length - 1
                          ? "1px solid #3C3B3B"
                          : "none",
                    }}
                  >
                    <div
                      className={`w-[10%] text-center text-sm font-semibold cursor-pointer ${
                        activeRow === index ? "bg-gray-700 rounded-full text-white" : "text-[#858080]"
                      }`}
                      onClick={() => handleRowClick(index)}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      <CameraImageCell
                        item={item}
                        detector={detector}
                        selectedBox={selectedBox}
                        index={index}
                        detectedObjects={detectedObjects}
                        handleImageClick={handleImageClick}
                        formatTimestamp={formatTimestamp}
                        updateDetectionInFirebase={updateDetectionInFirebase}
                      />
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      {item.formImageUrl && item.formImageUrl !== "-" ? (
                        <div className="flex items-center">
                          <img
                            src={item.formImageUrl.includes('drive.google.com') 
                              ? `https://drive.google.com/uc?id=${item.formImageUrl.match(/id=([^&]+)/)[1]}&export=view`
                              : item.formImageUrl}
                            alt="Form Upload"
                            className="w-10 h-10 rounded-md object-cover cursor-pointer"
                            onClick={() => handleImageClick(item.formImageUrl)}
                            onError={(e) => {
                              if (item.formImageUrl.includes('drive.google.com')) {
                                const fileId = item.formImageUrl.match(/id=([^&]+)/)[1];
                                e.target.src = `https://drive.google.com/thumbnail?id=${fileId}`;
                              } else {
                                e.target.src = DEFAULT_IMAGE;
                              }
                            }}
                          />
                          <span className="text-sm text-[#858080] ml-2">
                            {formatTimestamp(item.timestamp)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[#858080]">-</span>
                      )}
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      <img
                        src={boxImportant}
                        alt="Details Icon"
                        className="w-6 h-6 mr-2 cursor-pointer"
                        onClick={() => handleDetailsIconClick(index)}
                      />
                      <p 
                        className="text-sm text-[#858080] cursor-pointer" 
                        onClick={() => handleDetailsIconClick(index)}
                      >
                        Details
                      </p>
                    </div>
                    <div className="flex-1 text-center">
                      <button
                        className={`px-4 py-2 rounded-full text-white font-montserrat text-[8px] ${
                          item.status === "CLAIMED" ? "bg-[#339265]" : "bg-[#A14342]"
                        }`}
                      >
                        {item.status}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-[#858080] py-4">No items in this box</div>
              )}
            </div>
          )}

          {/* Image Pop-up */}
          {popUpImage && (
            <div
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
              onClick={() => setPopUpImage(null)}
            >
              <img 
                src={popUpImage}
                alt="Popup"
                className="max-w-[80%] max-h-[80%] rounded-md"
                onClick={(e) => e.stopPropagation()}
                onError={(e) => {
                  if (popUpImage.includes('drive.google.com')) {
                    const fileId = popUpImage.match(/id=([^&]+)/)[1];
                    e.target.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
                  }
                }}
              />
            </div>
          )}

          {/* Details Pop-up */}
          {showDetailsBox && (
            <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={closePopUp}
          >
            <div
              className="bg-[#1E1E1E] p-6 rounded-[25px] shadow-lg text-[#858080] w-[400px]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-white">Additional Details</h2>
                <button 
                  onClick={closePopUp}
                  className="text-white hover:text-gray-300 transition-colors duration-200"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              
              {boxDetails[selectedBox]?.middleContent[activeRow] ? (
                <div className="space-y-3">
                  {[
                    { label: "Name", key: "Name" },
                    { label: "Phone Number", key: "Phone number" },
                    { label: "Item Description", key: "Please describe the item" },
                    { label: "Box ID", key: "Please enter the box ID you're putting the item in?" },
                    { label: "Item Type", key: "What is the item?" },
                    { label: "Item Location", key: "Where did you find the item?" },
                    { label: "Timestamp", key: "timestamp", formatter: formatTimestamp }
                  ].map(({ label, key, formatter }) => (
                    <div key={key} className="border-b border-[#3C3B3B] pb-2">
                      <p className="font-semibold text-white">{label}:</p>
                      <p className="break-words">
                        {formatter 
                          ? formatter(boxDetails[selectedBox].middleContent[activeRow][key])
                          : boxDetails[selectedBox].middleContent[activeRow][key] || "Not Specified"}
                      </p>
                    </div>
                  ))}

                  {/* AI Detection Results Section */}
                  {boxDetails[selectedBox].middleContent[activeRow].cameraImage !== "-" && (
                    <div className="mt-4 pt-2 border-t border-[#3C3B3B]">
                      <p className="font-semibold text-white mb-2">AI Detection Results:</p>
                      <div className="bg-[#2A2929] rounded-lg p-3">
                        {detectedObjects[`${selectedBox}-${activeRow}`]?.primaryObject ? (
                          <>
                            <div className="mb-2">
                              <span className="text-[#339265] font-medium">Primary Detection:</span>
                              <p className="text-white">
                                {detectedObjects[`${selectedBox}-${activeRow}`].primaryObject.originalLabel}
                                {" "}
                                <span className="text-[#858080]">
                                  ({detectedObjects[`${selectedBox}-${activeRow}`].primaryObject.confidence}% confidence)
                                </span>
                              </p>
                            </div>
                            {detectedObjects[`${selectedBox}-${activeRow}`].allObjects?.length > 1 && (
                              <div>
                                <span className="text-[#339265] font-medium">Additional Detections:</span>
                                <div className="mt-1 space-y-1">
                                  {detectedObjects[`${selectedBox}-${activeRow}`].allObjects
                                    .slice(1)
                                    .map((obj, idx) => (
                                      <p key={idx} className="text-[#858080] text-sm">
                                        {obj.originalLabel} ({obj.confidence}%)
                                      </p>
                                    ))}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-[#858080]">No AI detection results available</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-32">
                  <p className="text-center text-gray-500">No details available</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
);
};

export default Monitoring;