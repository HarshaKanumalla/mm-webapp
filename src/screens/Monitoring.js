import React, { useRef, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth, signOut } from "firebase/auth";
import { getDatabase, ref as dbRef, onValue, get, set } from "firebase/database";
import { getStorage, ref as storageRef, getDownloadURL, listAll } from "firebase/storage";


// Image imports
import dashboard from "./dashboard.png";
import dataCenter from "./monitoring.png";
import futures from "./ads.png";
import lineChart from "./line-chart.png";
import tasks from "./tasks.png";
import logout from "./logout.png";
import lessThan from "./less-than.png";
import moreThan from "./more-than.png";
import openParcel from "./open-parcel.png";
import boxImportant from "./box-important.png";
import mmlogo from './mmlogo.png';


// Constants
const TIME_WINDOW = 5 * 60 * 1000; // 5 minutes
const DEFAULT_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

const ImageAnalysisDisplay = React.memo(({ imageUrl, timestamp, boxId }) => {
  const [analysisData, setAnalysisData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchAnalysis = async () => {
      if (!imageUrl || !timestamp || !boxId) {
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const db = getDatabase();
        const analysisRef = dbRef(db, 'image_analysis/camera');
        const rowTime = new Date(timestamp).getTime();

        console.log('[Analysis Display] Processing row timestamp:', new Date(rowTime).toISOString());

        const unsubscribe = onValue(analysisRef, (snapshot) => {
          if (!isMounted) return;

          const allAnalyses = snapshot.val();
          if (!allAnalyses) {
            setIsLoading(false);
            return;
          }

          Object.entries(allAnalyses).forEach(([key, data]) => {
            if (!data.metadata?.timestamp) return;

            // Convert UTC analysis time to IST by adding 5 hours and 30 minutes
            const analysisTimeUTC = new Date(data.metadata.timestamp).getTime();
            const analysisTimeIST = analysisTimeUTC + (5 * 60 + 30) * 60 * 1000;
            const timeDiff = Math.abs(analysisTimeIST - rowTime);

            console.log('[Analysis Display] Comparing timestamps:', {
              key,
              rowTime: new Date(rowTime).toISOString(),
              analysisTimeUTC: new Date(analysisTimeUTC).toISOString(),
              analysisTimeIST: new Date(analysisTimeIST).toISOString(),
              diffSeconds: Math.floor(timeDiff / 1000)
            });

            if (timeDiff < 60000) {
              console.log('[Analysis Display] Found matching analysis for row:', {
                key,
                matchedTime: new Date(analysisTimeIST).toISOString()
              });
              setAnalysisData(data.analysis);
            }
          });
          setIsLoading(false);
        });

        return () => unsubscribe();

      } catch (error) {
        console.error('[Analysis Display] Error:', error);
        if (isMounted) setIsLoading(false);
      }
    };

    fetchAnalysis();
    return () => { isMounted = false; };
  }, [imageUrl, timestamp, boxId]);

  const formatResults = (data) => {
    if (!data) return [];
    
    let results = [];
    
    if (data.text) {
      // Split the text into chunks of 35 characters while preserving words
      const words = data.text.split(' ');
      let currentLine = 'Text: ';
      let lines = [];
      
      words.forEach(word => {
        if ((currentLine + word).length > 35) {
          lines.push(currentLine.trim());
          currentLine = word + ' ';
        } else {
          currentLine += word + ' ';
        }
      });
      if (currentLine) {
        lines.push(currentLine.trim());
      }
      
      // Only take the first 2 lines to maintain compact display
      results.push(...lines.slice(0, 2));
      if (lines.length > 2) {
        const lastLine = results[results.length - 1];
        results[results.length - 1] = lastLine.substring(0, 32) + '...';
      }
    }
    
    if (data.labels?.length > 0) {
      const topLabels = data.labels
        .sort((a, b) => parseFloat(b.confidence) - parseFloat(a.confidence))
        .slice(0, 2)
        .map(label => `${label.description} (${parseFloat(label.confidence).toFixed(0)}%)`);
      
      const labelText = `Labels: ${topLabels.join(', ')}`;
      if (labelText.length > 35) {
        results.push(labelText.substring(0, 32) + '...');
      } else {
        results.push(labelText);
      }
    }

    return results;
  };

  if (!imageUrl || imageUrl === "-") return null;
  if (isLoading) return <div className="text-xs text-[#858080] mt-1">Loading analysis...</div>;
  if (!analysisData) return null;

  const results = formatResults(analysisData);
  if (results.length === 0) return null;

  return (
    <div className="mt-1 max-w-[180px]">
      {results.map((result, index) => (
        <div key={index} className="text-xs text-[#858080] leading-4">{result}</div>
      ))}
    </div>
  );
});

// Update the CameraImageCell to pass boxId
const CameraImageCell = React.memo(({ item, handleImageClick, formatTimestamp }) => {
  if (item.cameraImage === "-") {
    return <span className="text-[#858080]">-</span>;
  }

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
        </div>
        <div className="flex flex-col ml-2">
          <span className="text-sm text-[#858080]">{formatTimestamp(item.timestamp)}</span>
          <ImageAnalysisDisplay 
            imageUrl={item.cameraImage} 
            timestamp={item.timestamp}
            boxId={item["Please enter the box ID you're putting the item in?"]}
          />
        </div>
      </div>
    </div>
  );
});

CameraImageCell.displayName = 'CameraImageCell';

const FormImageCell = React.memo(({ item, handleImageClick, formatTimestamp }) => {
  console.log('[FormImageCell] Received item data:', {
    formImageUrl: item.formImageUrl,
    timestamp: item.timestamp
  });

  if (!item.formImageUrl || item.formImageUrl === "-") {
    console.log('[FormImageCell] No valid image URL found');
    return <span className="text-[#858080]">-</span>;
  }

  let displayUrl = item.formImageUrl;
  if (displayUrl.includes('drive.google.com')) {
    const fileId = displayUrl.match(/id=(.*?)(&|$)/)?.[1];
    if (fileId) {
      displayUrl = `https://drive.google.com/uc?id=${fileId}`;
      console.log('[FormImageCell] Processed Google Drive URL:', displayUrl);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center">
        <div className="relative">
          <img
            src={displayUrl}
            alt="Form Upload"
            className="w-10 h-10 rounded-md object-cover cursor-pointer"
            onClick={() => handleImageClick(displayUrl)}
            onError={(e) => {
              console.log('[FormImageCell] Image load error, trying thumbnail');
              if (displayUrl.includes('drive.google.com')) {
                const fileId = displayUrl.match(/id=(.*?)(&|$)/)?.[1];
                if (fileId) {
                  e.target.src = `https://drive.google.com/thumbnail?id=${fileId}`;
                }
              } else {
                e.target.src = DEFAULT_IMAGE;
              }
            }}
          />
        </div>
        <div className="flex flex-col ml-2">
          <span className="text-sm text-[#858080]">{formatTimestamp(item.timestamp)}</span>
        </div>
      </div>
    </div>
  );
});

FormImageCell.displayName = 'FormImageCell';

export const Monitoring = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  const db = getDatabase();
  const storage = getStorage();
  const scrollContainerRef = useRef(null);

  // State Management
  const [selectedBox, setSelectedBox] = useState(null);
  const [popUpImage, setPopUpImage] = useState(null);
  const [showDetailsBox, setShowDetailsBox] = useState(false);
  const [activeRow, setActiveRow] = useState(null);
  const [boxDetails, setBoxDetails] = useState({});
  const [isLoading, setIsLoading] = useState(true);


  // Utility Functions
  const isWithinTimeWindow = useCallback((timestamp1, timestamp2) => {
    if (!timestamp1 || !timestamp2) return false;
    const date1 = new Date(timestamp1).getTime();
    const date2 = new Date(timestamp2).getTime();
    return Math.abs(date1 - date2) <= TIME_WINDOW;
  }, []);

  const parseTimestamp = useCallback((timestampStr) => {
    try {
      if (!timestampStr) return null;

      if (timestampStr.match(/^\d{8}T\d{6}\.\d{3}Z$/)) {
        const year = timestampStr.substring(0, 4);
        const month = timestampStr.substring(4, 6);
        const day = timestampStr.substring(6, 8);
        const hour = timestampStr.substring(9, 11);
        const minute = timestampStr.substring(11, 13);
        const second = timestampStr.substring(13, 15);
        const ms = timestampStr.substring(16, 19);
        timestampStr = `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}Z`;
      }

      const parsedTimestamp = new Date(timestampStr);
      return isNaN(parsedTimestamp.getTime()) ? null : parsedTimestamp;
    } catch (error) {
      console.error('Timestamp parsing error:', error);
      return null;
    }
  }, []);

  const formatTimestamp = useCallback((timestamp) => {
    if (!timestamp) return '-';
    const parsedDate = parseTimestamp(timestamp);
    if (!parsedDate) return '-';
    
    try {
      return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC'
      }).format(parsedDate);
    } catch (error) {
      console.error('Error formatting timestamp:', error);
      return '-';
    }
  }, [parseTimestamp]);

// Update the handleDoorOpen function
const handleDoorOpen = useCallback((boxId, doorData) => {
  console.log(`[Door Monitor] Creating row for Box ${boxId}`);
  setSelectedBox(parseInt(boxId));
  
  setBoxDetails(prevDetails => {
    const updatedDetails = { ...prevDetails };
    if (!updatedDetails[boxId]) {
      updatedDetails[boxId] = { middleContent: [] };
    }

    const existingRowIndex = updatedDetails[boxId].middleContent.findIndex(row => 
      isWithinTimeWindow(row.timestamp, doorData.timestamp)
    );

    if (existingRowIndex !== -1) {
      console.log(`[Door Monitor] Row already exists for this event`);
      return prevDetails;
    }

    const newRow = {
      timestamp: doorData.timestamp,
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

    console.log(`[Door Monitor] Adding new row with timestamp: ${doorData.timestamp}`);
    updatedDetails[boxId].middleContent.unshift(newRow);
    
    // Ensure the new row is selected
    setTimeout(() => {
      setActiveRow(0);
    }, 0);
    
    return updatedDetails;
  });
}, [isWithinTimeWindow]);

const checkForNewImage = useCallback(async (boxId, doorTimestamp, retryCount = 0, maxRetries = 30) => {
  console.log(`[Camera Monitor] Checking for new image (attempt ${retryCount + 1}/${maxRetries})`);
  
  try {
    const imageRef = storageRef(storage, 'missingmatters_photos/Camera_Images');
    const files = await listAll(imageRef);
    
    console.log(`[Camera Monitor] Found ${files.items.length} files in storage`);
    
    const boxImages = files.items.filter(item => item.name.startsWith(`HN ${boxId}_`));
    console.log(`[Camera Monitor] Found ${boxImages.length} images for Box ${boxId}`);
    
    if (boxImages.length > 0) {
      const doorTime = new Date(doorTimestamp).getTime();
      
      const relevantImages = boxImages.filter(image => {
        const imageTimeStr = image.name.split('_')[1].replace('.jpg', '');
        const formattedImageTime = imageTimeStr.replace(
          /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d{3})Z/,
          '$1-$2-$3T$4:$5:$6.$7Z'
        );
        const imageTime = new Date(formattedImageTime).getTime();
        return imageTime >= doorTime && imageTime <= doorTime + TIME_WINDOW;
      });
      
      if (relevantImages.length === 0) {
        console.log(`[Camera Monitor] No images found within time window after door opened at ${doorTimestamp}`);
        if (retryCount < maxRetries) {
          setTimeout(() => {
            checkForNewImage(boxId, doorTimestamp, retryCount + 1, maxRetries);
          }, 10000);
        }
        return false;
      }
      
      const mostRecent = relevantImages[0];
      console.log(`[Camera Monitor] Found relevant image: ${mostRecent.name}`);
      
      const imageTimestamp = mostRecent.name.split('_')[1].replace('.jpg', '');
      console.log(`[Camera Monitor] Image timestamp: ${imageTimestamp}, Door timestamp: ${doorTimestamp}`);

      const imageUrl = await getDownloadURL(mostRecent);
      
      setBoxDetails(prevDetails => {
        const updatedDetails = { ...prevDetails };
        const boxContent = updatedDetails[boxId]?.middleContent;
        
        if (!boxContent?.length) return prevDetails;

        const targetRowIndex = boxContent.findIndex(row => {
          const rowTime = new Date(row.timestamp).getTime();
          const doorTime = new Date(doorTimestamp).getTime();
          
          return Math.abs(rowTime - doorTime) < 60000; // Allow 1-minute difference
        });
        
        if (targetRowIndex !== -1) {
          console.log(`[Camera Monitor] Successfully updating row ${targetRowIndex} with new image`);
          console.log(`[Camera Monitor] Row timestamp: ${boxContent[targetRowIndex].timestamp}`);
          updatedDetails[boxId].middleContent[targetRowIndex].cameraImage = imageUrl;
          updatedDetails[boxId].middleContent[targetRowIndex].bottomActions.imageCaptured = true;
          updatedDetails[boxId].middleContent[targetRowIndex].bottomActions.sentToCloud = true;
          setActiveRow(targetRowIndex);

          const safeTimestamp = boxContent[targetRowIndex].timestamp.replace(/[.]/g, '_');
          const completeDataRef = dbRef(db, `Complete_data/${boxId}/${safeTimestamp}`);
          set(completeDataRef, {
            box_ID: boxId,
            camera_image: imageUrl,
            timestamp: boxContent[targetRowIndex].timestamp,
            status: "UNCLAIMED"
          });
          
          return updatedDetails;
        }
        
        console.log(`[Camera Monitor] No matching row found for timestamp ${doorTimestamp}`);
        return prevDetails;
      });
      
      return true;
    }
    
    if (retryCount < maxRetries) {
      setTimeout(() => {
        checkForNewImage(boxId, doorTimestamp, retryCount + 1, maxRetries);
      }, 10000);
    }
    
    return false;
  } catch (error) {
    console.error('[Camera Monitor] Error checking for new image:', error);
    return false;
  }
}, [storage, db]);

  // Update QR Status
  const updateQRStatus = useCallback((boxId, timestamp) => {
    console.log(`[Door Monitor] Updating QR displayed status for Box ${boxId}`);
    setBoxDetails(prevDetails => {
      const updatedDetails = { ...prevDetails };
      const boxContent = updatedDetails[boxId]?.middleContent;
      
      if (!boxContent?.length) return prevDetails;
      
      const targetRowIndex = boxContent.findIndex(row => 
        row.bottomActions.doorOpened && 
        isWithinTimeWindow(row.timestamp, timestamp)
      );
      
      if (targetRowIndex !== -1) {
        updatedDetails[boxId].middleContent[targetRowIndex].bottomActions.qrDisplayed = true;
        console.log(`[Door Monitor] QR displayed status updated for Box ${boxId}`);
      }
      
      return updatedDetails;
    });
  }, [isWithinTimeWindow]);

  // Door Status Monitoring
  const monitorDoorStatus = useCallback((boxId) => {
    console.log(`[Door Monitor] Starting monitoring for Box ${boxId}`);

    const deviceBoxId = `HN ${boxId}`; // This ensures consistent formatting
    const doorStatusRef = dbRef(db, `devices/HN ${boxId}/door_status`);
    
    return onValue(doorStatusRef, async (snapshot) => {
      if (!snapshot.exists()) return;
      
      const statusData = snapshot.val();
      const entries = Object.entries(statusData).sort((a, b) => {
        const timeA = new Date(a[1].timestamp).getTime();
        const timeB = new Date(b[1].timestamp).getTime();
        return timeB - timeA;
      });
      
      const [latestKey, data] = entries[0];
      
      if (data.door_status === "door_open") {
        console.log(`[Door Monitor] Door open event detected for Box ${boxId}`);
        handleDoorOpen(boxId, {
          timestamp: data.timestamp,
          device_name: data.device_name
        });
      } else if (data.door_status === "door_closed") {
        console.log(`[Door Monitor] Door closed event detected for Box ${boxId}`);
        
        setBoxDetails(prevDetails => {
          const updatedDetails = { ...prevDetails };
          const boxContent = updatedDetails[boxId]?.middleContent;
          
          if (!boxContent?.length) return prevDetails;
          
          const targetRowIndex = boxContent.findIndex(row => 
            row.bottomActions.doorOpened && 
            row.cameraImage === "-"
          );
          
          if (targetRowIndex !== -1) {
            updatedDetails[boxId].middleContent[targetRowIndex].bottomActions.imageCaptured = true;
          }
          
          return updatedDetails;
        });
        
        checkForNewImage(boxId, data.timestamp);
        setTimeout(() => updateQRStatus(boxId, data.timestamp), 6000);
      }
    });
  }, [db, handleDoorOpen, checkForNewImage, updateQRStatus]);


// Additional Details Monitoring
const monitorAdditionalDetails = useCallback((boxId) => {
  const responsesRef = dbRef(db, 'responses');
  
  return onValue(responsesRef, async (snapshot) => {
    if (!snapshot.exists()) return;
    
    const responses = snapshot.val();
    console.log('[Form Monitor] Processing all responses:', {
      totalResponses: Object.keys(responses).length,
      boxId: boxId
    });

    setBoxDetails(prevDetails => {
      const updatedDetails = { ...prevDetails };
      if (!updatedDetails[boxId]?.middleContent) return prevDetails;

      const allResponses = Object.entries(responses).map(([id, data]) => ({...data, responseId: id}));
      console.log('[Form Monitor] All responses mapped:', allResponses.length);

      const boxResponses = allResponses.filter(form => {
        const matches = form["Please enter the box ID you're putting the item in?"] === String(boxId);
        console.log('[Form Monitor] Checking response:', {
          responseId: form.responseId,
          formBoxId: form["Please enter the box ID you're putting the item in?"],
          expectedBoxId: String(boxId),
          matches: matches
        });
        return matches;
      });
      
      console.log('[Form Monitor] Matching responses for box:', {
        boxId: boxId,
        matches: boxResponses.length
      });

      if (boxResponses.length === 0) return prevDetails;

      const latestForm = boxResponses.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      )[0];

      const formTimeUTC = new Date(latestForm.timestamp);
      const formTimeIST = new Date(formTimeUTC.getTime() + (5 * 60 + 30) * 60 * 1000);

      const rowIndex = updatedDetails[boxId].middleContent.findIndex(row => {
        const doorTime = new Date(row.timestamp).getTime();
        const timeDiff = Math.abs(formTimeIST.getTime() - doorTime);
        console.log('[Form Monitor] Time comparison:', {
          formTime: formTimeIST.toISOString(),
          doorTime: new Date(doorTime).toISOString(),
          diffMinutes: Math.floor(timeDiff / 60000),
          withinWindow: timeDiff <= TIME_WINDOW
        });
        return timeDiff <= TIME_WINDOW;
      });

      if (rowIndex !== -1) {
        let formImageUrl = latestForm.formImageUrl;
        if (formImageUrl && formImageUrl.includes('drive.google.com')) {
          const fileId = formImageUrl.match(/id=(.*?)(&|$)/)?.[1];
          if (fileId) {
            formImageUrl = `https://drive.google.com/uc?id=${fileId}`;
            console.log('[Form Monitor] Processed image URL:', formImageUrl);
          }
        }

        updatedDetails[boxId].middleContent[rowIndex] = {
          ...updatedDetails[boxId].middleContent[rowIndex],
          Name: latestForm["Name "] || "-",
          "Phone number": latestForm["Phone number "] || "-",
          "Please describe the item": latestForm["Please describe the item"] || "-",
          "What is the item?": latestForm["What is the item?"] || "-",
          "Where did you find the item?": latestForm["Where did you find the item?"] || "-",
          formImageUrl: formImageUrl || "-",
          bottomActions: {
            ...updatedDetails[boxId].middleContent[rowIndex].bottomActions,
            formSubmitted: true
          }
        };

        console.log('[Form Monitor] Updated row data:', {
          rowIndex,
          formImage: formImageUrl,
          hasFormSubmitted: true
        });

        const safeTimestamp = updatedDetails[boxId].middleContent[rowIndex].timestamp.replace(/[.]/g, '_');
        const completeDataRef = dbRef(db, `Complete_data/${boxId}/${safeTimestamp}`);
        
        set(completeDataRef, {
          box_ID: boxId,
          camera_image: updatedDetails[boxId].middleContent[rowIndex].cameraImage || "-",
          form_image: formImageUrl || "-",
          timestamp: updatedDetails[boxId].middleContent[rowIndex].timestamp,
          status: updatedDetails[boxId].middleContent[rowIndex].status,
          additional_details: {
            name: latestForm["Name "] || "-",
            phone: latestForm["Phone number "] || "-",
            item_description: latestForm["Please describe the item"] || "-",
            item_type: latestForm["What is the item?"] || "-",
            location: latestForm["Where did you find the item?"] || "-"
          }
        });

        return updatedDetails;
      }

      console.log('[Form Monitor] No matching row found within time window');
      return prevDetails;
    });
  });
}, [db, TIME_WINDOW]);

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

// Update your handleBoxClick function to ensure consistent formatting
const handleBoxClick = (num) => {
  setSelectedBox(num);
  setActiveRow(0);
  const formattedBoxId = `HN ${num}`;
  navigate(`/monitoring?box=${encodeURIComponent(formattedBoxId)}`, { replace: true });
  console.log('Box selected:', formattedBoxId);
};

// Modify row click handler to prevent changing selection during process
const handleRowClick = (rowIndex) => {
  const currentRow = boxDetails[selectedBox]?.middleContent[rowIndex];
  if (currentRow) {
    const isProcessComplete = 
      currentRow.bottomActions.doorOpened &&
      currentRow.bottomActions.imageCaptured &&
      currentRow.bottomActions.sentToCloud &&
      currentRow.bottomActions.qrDisplayed &&
      currentRow.bottomActions.formSubmitted;
      
    // Only allow changing selection if process is complete
    if (isProcessComplete || activeRow === null) {
      setActiveRow(rowIndex);
    } else {
      console.log('[Row Selection] Cannot change selection - process incomplete');
    }
  }
};

  const handleLogout = () => {
    signOut(auth)
      .then(() => navigate("/"))
      .catch((error) => console.error("Error logging out:", error));
  };

  const handleImageClick = (imageSrc) => {
    if (!imageSrc || imageSrc === "-") return;
    
    let popupUrl = imageSrc;
    if (imageSrc.includes('drive.google.com')) {
      try {
        const fileId = imageSrc.match(/id=(.*?)(&|$)/)[1];
        // Use high-quality view URL for popup
        popupUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
      } catch (error) {
        console.error('Error processing popup image URL:', error);
        return;
      }
    }
    
    setPopUpImage(popupUrl);
  };
  
  const handleDetailsIconClick = (index) => {
    setActiveRow(index);
    setShowDetailsBox(true);
  };

  const closePopUp = () => {
    setActiveRow(null);
    setShowDetailsBox(false);
  };

// Setup Effects
useEffect(() => {
  const unsubscribers = [];
  setIsLoading(true);

  const setupMonitoring = async () => {
    try {
      // First load existing data from Complete_data
      const completeDataRef = dbRef(db, 'Complete_data');
      const snapshot = await get(completeDataRef);
      const savedData = snapshot.val();
      
      if (savedData) {
        const processedData = {};
        
        Object.entries(savedData).forEach(([boxId, boxData]) => {
          if (!processedData[boxId]) {
            processedData[boxId] = { middleContent: [] };
          }
          
          Object.entries(boxData).forEach(([timestamp, data]) => {
            const formattedTimestamp = timestamp.replace(/_/g, '.');
            
            const row = {
              timestamp: formattedTimestamp,
              cameraImage: data.camera_image || "-",
              formImageUrl: data.form_image || "-",
              Name: data.additional_details?.name || "-",
              "Phone number": data.additional_details?.phone || "-",
              "Please describe the item": data.additional_details?.item_description || "-",
              "What is the item?": data.additional_details?.item_type || "-",
              "Where did you find the item?": data.additional_details?.location || "-",
              "Please enter the box ID you're putting the item in?": boxId,
              status: data.status || "UNCLAIMED",
              bottomActions: {
                doorOpened: true,
                imageCaptured: data.camera_image !== "-",
                sentToCloud: data.camera_image !== "-",
                qrDisplayed: true,
                formSubmitted: data.additional_details?.name !== "-" || data.form_image !== "-"
              }
            };
            
            processedData[boxId].middleContent.push(row);
          });
          
          // Sort by timestamp in descending order
          processedData[boxId].middleContent.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
          );
        });
        
        setBoxDetails(processedData);
      }

      // Set up real-time monitoring for selected box
      if (selectedBox) {
        console.log(`Setting up monitoring for box ${selectedBox}`);
        unsubscribers.push(
          monitorDoorStatus(selectedBox),
          monitorAdditionalDetails(selectedBox)
        );
      }

    } catch (error) {
      console.error('Failed to setup monitoring:', error);
    } finally {
      setIsLoading(false);
    }
  };

  setupMonitoring();

  return () => {
    console.log('Cleaning up monitoring subscriptions');
    unsubscribers.forEach(unsubscribe => unsubscribe());
  };
}, [db, monitorDoorStatus, monitorAdditionalDetails, selectedBox]);

// Initialize selected box
useEffect(() => {
  setSelectedBox(1506);
}, []);

  // Render Methods
  const renderBottomContainer = () => {
    const selectedRow = activeRow !== null && boxDetails[selectedBox]?.middleContent[activeRow];
    
    return (
      <div className="bg-[#FFFFFF] border border-[#D9D9D9] rounded-[25px] h-[125px] mx-10 mt-6">
        <div className="flex items-center justify-evenly h-full px-10">
          {[
            { key: 'doorOpened', label: 'Door Opened' },
            { key: 'imageCaptured', label: 'Image Captured' },
            { key: 'sentToCloud', label: 'Sent to Cloud' },
            { key: 'qrDisplayed', label: 'QR displayed' },
            { key: 'formSubmitted', label: 'Form Submitted' }
          ].map(({ key, label }) => {
            const isActive = selectedRow?.bottomActions?.[key] || false;
            
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
                <p className="text-[#858080] mt-2 font-montserrat text-base font-normal">
                  {label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };


  return (
    <div className="flex h-screen bg-[#F3F4F4] overflow-hidden">
      {/* Sidebar */}
      <div className="flex flex-col items-center py-8 bg-[#FFFFFF] w-24 rounded-[25px] m-4 shadow-lg">
        <div className="bg-[#FFFFFF] rounded-full h-16 w-16 flex items-center justify-center mb-6" style={{ border: '1px solid #D9D9D9' }}>
          <img src={mmlogo} alt="MM Logo" className="h-12 w-12" />
        </div>
        
        <nav className="flex flex-col items-center justify-center flex-grow space-y-4">
          {[
            { src: futures, alt: "Futures", path: "/dashboard" },
            { src: dataCenter, alt: "Data Center", path: "/ads" },
            { src: dashboard, alt: "Dashboard", path: "/monitoring" },
            { src: lineChart, alt: "Analytics", path: "" },
            { src: tasks, alt: "Tasks", path: "" }
          ].map((item) => (
            <img
              key={item.alt}
              src={item.src}
              alt={item.alt}
              className="w-8 h-8 hover:opacity-80 cursor-pointer"
              onClick={() => item.path && navigate(item.path)}
            />
          ))}
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
          <div className="flex items-center justify-between bg-[#FFFFFF] border border-[#D9D9D9] rounded-[25px] py-8 px-4 mx-10 relative">
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
                    backgroundColor: selectedBox === num ? "#FFFFFF" : "#FFFFFF",
                    color: selectedBox === num ? "#858080" : "#000",
                    border: "1px solid #D9D9D9",
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
          {renderBottomContainer()}

{/* Middle Container - Box Contents */}
{selectedBox && (
  <div className="bg-[#FFFFFF] border border-[#D9D9D9] rounded-[25px] mx-10 p-4 mt-6 h-[50vh] overflow-y-auto">
    {/* Table Header */}
    <div className="flex items-center px-4 bg-[#FFFFFF] border border-[#D9D9D9] rounded-[25px] h-[50px] w-[95%] mx-auto">
      <div className="text-sm text-[#858080] font-semibold w-[8%] text-center">S. NO</div>
      <div className="h-full w-[1px] bg-gray-600"></div>
      <div className="text-sm text-[#858080] font-semibold w-[34%] text-center">CAMERA IMAGE</div>
      <div className="h-full w-[1px] bg-gray-600"></div>
      <div className="text-sm text-[#858080] font-semibold w-[34%] text-center">FORM IMAGE</div>
      <div className="h-full w-[1px] bg-gray-600"></div>
      <div className="text-sm text-[#858080] font-semibold w-[16%] text-center">ADDITIONAL DETAILS</div>
      <div className="h-full w-[1px] bg-gray-600"></div>
      <div className="text-sm text-[#858080] font-semibold w-[8%] text-center">STATUS</div>
    </div>

    {/* Table Content */}
    {boxDetails[selectedBox]?.middleContent?.length > 0 ? (
      [...boxDetails[selectedBox].middleContent]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .map((item, index) => (                    
          <div
            key={index}
            className="grid grid-cols-[8%_34%_34%_16%_8%] items-start py-6 px-4 mt-4"
            style={{
              width: "95%",
              margin: "0 auto",
              borderBottom:
                index < boxDetails[selectedBox].middleContent.length - 1
                  ? "1px solid #D9D9D9"
                  : "none",
            }}
          >
            <div
              className={`text-center text-sm font-semibold cursor-pointer ${
                activeRow === index ? "bg-gray-700 rounded-full text-white" : "text-[#858080]"
              }`}
              onClick={() => handleRowClick(index)}
            >
              {index + 1}
            </div>
            
            <div className="flex items-center justify-center">
              <CameraImageCell
                item={item}
                handleImageClick={handleImageClick}
                formatTimestamp={formatTimestamp}
              />
            </div>
            
            <div className="flex items-center justify-center">
              <FormImageCell
                item={item}
                handleImageClick={handleImageClick}
                formatTimestamp={formatTimestamp}
              />
            </div>
            
            <div className="flex items-center justify-center">
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
            
            <div className="text-center">
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
  );
};
export default Monitoring;