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
import details from './details.png';  // Import the details icon

// Constants
const TIME_WINDOW = 5 * 60 * 1000; // 5 minutes
const DEFAULT_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

// Image Analysis component
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
    <div className="mt-1 max-w-[135px]">
      {results.map((result, index) => (
        <div key={index} className="text-[9px] text-[#858080] leading-3">{result}</div>
      ))}
    </div>
  );
});

// Reusable CheckIcon for the progress indicators with proper styling
const CheckIcon = ({ isActive }) => (
  <div className={`rounded-full w-7.5 h-7.5 flex items-center justify-center ${isActive ? "bg-white border-2 border-[#2A9D8F]" : "border border-gray-300"}`}>
    {isActive && (
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="#2A9D8F" 
        strokeWidth="2.5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className="w-4 h-4"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    )}
  </div>
);

// Navigation Item component with properly centered layout and larger icons
const NavItem = ({ iconSrc, label, isActive, onClick }) => (
  <div 
    className={`flex flex-col items-center cursor-pointer ${isActive ? 'text-[#00a896]' : 'text-gray-400'}`}
    onClick={onClick}
  >
    <div className="w-9 h-9 flex items-center justify-center mb-1">
      <img src={iconSrc} alt={label} className="w-7.5 h-7.5" />
    </div>
    <span className="text-[9px]">{label}</span>
  </div>
);

export const Monitoring = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  const db = getDatabase();
  const storage = getStorage();

  // State Management
  const [selectedBox, setSelectedBox] = useState(null);
  const [popUpImage, setPopUpImage] = useState(null);
  const [showDetailsBox, setShowDetailsBox] = useState(false);
  const [activeRow, setActiveRow] = useState(null);
  const [boxDetails, setBoxDetails] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("monitoring");
  const [smartBoxOptions] = useState([
    { id: 1506, label: "HN 1506" },
    { id: 1507, label: "HN 1507" }
  ]);
  const [locationOptions] = useState([
    { id: 1, label: "Delhi" },
    { id: 2, label: "Mumbai" },
    { id: 3, label: "Bangalore" }
  ]);
  const [showSmartBoxDropdown, setShowSmartBoxDropdown] = useState(false);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(locationOptions[0]);
  const [searchText, setSearchText] = useState("");

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
      // Match the format shown in the screenshot: Mar 13, 12:22 PM
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

  // Door Status Monitoring - Using real functionality from original code
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

  // Handle route navigation
  const handleNavigation = (route) => {
    if (route) {
      console.log(`Navigating to ${route}`);
      navigate(route);
    }
  };

  // Smart box dropdown handler
  const handleSmartBoxSelect = (boxId) => {
    setSelectedBox(boxId);
    setActiveRow(0);
    setShowSmartBoxDropdown(false);
    const formattedBoxId = `HN ${boxId}`;
    navigate(`/monitoring?box=${encodeURIComponent(formattedBoxId)}`, { replace: true });
    console.log('Box selected:', formattedBoxId);
  };

  // Location dropdown handler
  const handleLocationSelect = (location) => {
    setSelectedLocation(location);
    setShowLocationDropdown(false);
  };

  // Logout handler
  const handleLogout = () => {
    signOut(auth)
      .then(() => navigate("/"))
      .catch((error) => console.error("Error logging out:", error));
  };

  // Image popup handler
  const handleImageClick = (imageSrc, event) => {
    if (event) event.stopPropagation();
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
  
  // Form details popup handler
  const handleDetailsIconClick = (index, event) => {
    if (event) event.stopPropagation();
    console.log(`Details icon clicked for row ${index}`);
    setActiveRow(index);
    setShowDetailsBox(true);
  };

  // Close popup handlers
  const closeImagePopup = () => {
    setPopUpImage(null);
  };

  const closeDetailsPopup = () => {
    setShowDetailsBox(false);
  };

  // Handle outside click to close dropdowns
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!event.target.closest('.smart-box-dropdown') && !event.target.closest('.smart-box-button')) {
        setShowSmartBoxDropdown(false);
      }
      if (!event.target.closest('.location-dropdown') && !event.target.closest('.location-button')) {
        setShowLocationDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  // Render Methods for Process Indicators
  const renderProcessIndicators = () => {
    const selectedRow = activeRow !== null && boxDetails[selectedBox]?.middleContent[activeRow];
    
    return (
      <div className="flex justify-center items-center gap-8 px-3">
        {[
          { key: 'doorOpened', label: 'Door opened' },
          { key: 'imageCaptured', label: 'Camera Image captured' },
          { key: 'qrDisplayed', label: 'QR Displayed' },
          { key: 'sentToCloud', label: 'Sent to Cloud' },
          { key: 'formSubmitted', label: 'Form Submitted' }
        ].map(({ key, label }) => {
          const isActive = selectedRow?.bottomActions?.[key] || false;
          
          return (
            <div key={key} className="flex flex-col items-center">
              <CheckIcon isActive={isActive} />
              <span className="text-xs mt-1.5">{label}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // Setup Effects - integrating real data loading functionality
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

  return (
    <div className="min-h-screen bg-white">
      {/* Top Navigation Bar */}
      <header className="py-2 px-4 flex items-center justify-between">
        <div className="flex items-center ml-1.5">
          <img src={mmlogo} alt="Missing Matters" className="h-9 w-auto mr-1.5" />
          <h1 className="text-[#2A9D8F] font-semibold text-lg">Missing Matters</h1>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Location Dropdown */}
          <div className="relative">
            <div 
              className="px-3 py-1.5 border border-[#858080] rounded-full flex items-center space-x-1.5 cursor-pointer location-button"
              onClick={() => setShowLocationDropdown(!showLocationDropdown)}
            >
              <span className="text-[#3C3B3B] text-xs">{selectedLocation.label}</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-[#3C3B3B]" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
            
            {showLocationDropdown && (
              <div className="absolute mt-1 w-36 bg-white border border-gray-300 rounded-md shadow-lg z-20 location-dropdown">
                {locationOptions.map(location => (
                  <div 
                    key={location.id} 
                    className="px-3 py-1.5 hover:bg-gray-100 cursor-pointer text-xs"
                    onClick={() => handleLocationSelect(location)}
                  >
                    {location.label}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Smart Box Dropdown */}
          <div className="relative">
            <div 
              className="px-3 py-1.5 border border-[#858080] rounded-full flex items-center space-x-1.5 cursor-pointer smart-box-button"
              onClick={() => setShowSmartBoxDropdown(!showSmartBoxDropdown)}
            >
              <span className="text-[#3C3B3B] text-xs">
                {selectedBox ? `HN ${selectedBox}` : "Smart Box"}
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-[#3C3B3B]" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
            
            {showSmartBoxDropdown && (
              <div className="absolute mt-1 w-36 bg-white border border-gray-300 rounded-md shadow-lg z-20 smart-box-dropdown">
                {smartBoxOptions.map(option => (
                  <div 
                    key={option.id} 
                    className="px-3 py-1.5 hover:bg-gray-100 cursor-pointer text-xs"
                    onClick={() => handleSmartBoxSelect(option.id)}
                  >
                    {option.label}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="px-3 py-1.5 border border-[#858080] rounded-full w-48 pl-7 text-[#3C3B3B] placeholder-[#3C3B3B] text-xs"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-[#3C3B3B] absolute left-2 top-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          
          {/* Notifications */}
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
          </div>
          
          {/* User Profile with MM instead of JS - Increased to w-12 h-12 */}
          <div className="w-12 h-12 rounded-full bg-[#2A9D8F] flex items-center justify-center text-[#FFFFFF]">
            <span className="text-sm font-medium">MM</span>
          </div>
        </div>
      </header>

      {/* Left Navigation - Moved slightly to the right */}
      <div className="fixed left-3 w-10.5 flex flex-col items-center justify-center z-10" 
           style={{top: '50%', transform: 'translateY(-50%)', height: 'auto'}}>
        <div className="flex flex-col items-center justify-center space-y-3">
          <NavItem 
            iconSrc={dashboard} 
            label="Dashboard" 
            isActive={activeTab === "dashboard"}
            onClick={() => handleNavigation("/dashboard")} 
          />
          <NavItem 
            iconSrc={dataCenter} 
            label="Monitoring" 
            isActive={activeTab === "monitoring"}
            onClick={() => handleNavigation("/monitoring")} 
          />
          <NavItem 
            iconSrc={futures} 
            label="Ads" 
            isActive={activeTab === "ads"}
            onClick={() => handleNavigation("/ads")} 
          />
          <NavItem 
            iconSrc={logout} 
            label="Logout" 
            isActive={false}
            onClick={handleLogout} 
          />
        </div>
      </div>

      <div className="container mx-auto px-3 pt-6 pb-2">
        <div className="flex justify-center mt-2 mb-4">
          {/* Progress indicators with increased spacing */}
          <div className="flex space-x-20">
            {[
              { key: 'doorOpened', label: 'Door opened' },
              { key: 'imageCaptured', label: 'Camera Image captured' },
              { key: 'qrDisplayed', label: 'QR Displayed' },
              { key: 'sentToCloud', label: 'Sent to Cloud' },
              { key: 'formSubmitted', label: 'Form Submitted' }
            ].map(({ key, label }) => {
              const isActive = activeRow !== null && boxDetails[selectedBox]?.middleContent[activeRow]?.bottomActions?.[key] || false;
              
              return (
                <div key={key} className="flex items-center">
                  <div className={`h-5 w-5 rounded-full ${isActive ? 'bg-[#2A9D8F]' : 'bg-gray-200'} flex items-center justify-center`}>
                    {isActive && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <span className="ml-2 text-xs">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-3 pt-3 pb-3"> {/* Adjusted padding */}
        <div className="flex">
          {/* Left Navigation placeholder to maintain layout with fixed sidebar */}
          <div className="w-16 invisible">
            {/* Placeholder */}
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col h-[calc(100vh-180px)]"> {/* Reduced height by another 10% */}
            {/* Main Table with full height, rounded corners and drop shadow */}
            <div className="border border-[#D3D4D4] rounded-[18px] overflow-auto shadow-lg flex flex-col h-full" 
                 style={{boxShadow: '0 7px 11px -2px rgba(0, 0, 0, 0.1), 0 3px 5px -2px rgba(0, 0, 0, 0.05)'}}>
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-[#2A9D8F] border-b border-[#D3D4D4]">
                  <tr>
                    <th className="py-2 px-3 text-center font-medium text-white border-r border-[#D3D4D4] text-[10px]">S. NO</th>
                    <th className="py-2 px-3 text-center font-medium text-white border-r border-[#D3D4D4] w-[12%] text-[10px]">CAMERA IMAGE</th>
                    <th className="py-2 px-3 text-center font-medium text-white border-r border-[#D3D4D4] text-[10px]">CAMERA IMAGE DESCRIPTION</th>
                    <th className="py-2 px-3 text-center font-medium text-white border-r border-[#D3D4D4] w-[12%] text-[10px]">FORM IMAGE</th>
                    <th className="py-2 px-3 text-center font-medium text-white border-r border-[#D3D4D4] text-[10px]">FORM IMAGE DESCRIPTION</th>
                    <th className="py-2 px-3 text-center font-medium text-white border-r border-[#D3D4D4] text-[10px]">FORM DETAILS</th>
                    <th className="py-2 px-3 text-center font-medium text-white border-r border-[#D3D4D4] text-[10px]">CHATBOT DETAILS</th>
                    <th className="py-2 px-3 text-center font-medium text-white border-r border-[#D3D4D4] w-[8%] text-[10px]">MATCHING PERCENTAGE</th>
                    <th className="py-2 px-3 text-center font-medium text-white text-[10px]">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  
                  {/* Data Rows - Using real data from the state with Firebase monitoring */}
                  {!isLoading && selectedBox && boxDetails[selectedBox]?.middleContent?.map((item, index) => (
                    <tr 
                      key={index} 
                      className={`border-t border-[#D3D4D4] ${activeRow === index ? 'bg-gray-100' : ''}`} 
                      onClick={() => handleRowClick(index)}
                    >
                      <td className="py-3 px-3 text-center text-xs">{index + 1}.</td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center">
                          <img 
                            src={item.cameraImage !== '-' ? item.cameraImage : DEFAULT_IMAGE} 
                            alt="Camera" 
                            className="w-12 h-10.5 rounded object-cover cursor-pointer"
                            onClick={(e) => handleImageClick(item.cameraImage, e)}
                          />
                          <div className="text-[9px] text-gray-500 mt-0.5 text-center">
                            {formatTimestamp(item.timestamp)}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center">
                          <ImageAnalysisDisplay 
                            imageUrl={item.cameraImage} 
                            timestamp={item.timestamp}
                            boxId={item["Please enter the box ID you're putting the item in?"]}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center">
                          <img 
                            src={item.formImageUrl !== '-' ? item.formImageUrl : DEFAULT_IMAGE} 
                            alt="Form" 
                            className="w-12 h-10.5 rounded object-cover cursor-pointer"
                            onClick={(e) => handleImageClick(item.formImageUrl, e)}
                            onError={(e) => {
                              if (item.formImageUrl && item.formImageUrl.includes('drive.google.com')) {
                                const fileId = item.formImageUrl.match(/id=(.*?)(&|$)/)?.[1];
                                if (fileId) {
                                  e.target.src = `https://drive.google.com/thumbnail?id=${fileId}`;
                                }
                              } else {
                                e.target.src = DEFAULT_IMAGE;
                              }
                            }}
                          />
                          <div className="text-[9px] text-gray-500 mt-0.5 text-center">
                            {item.bottomActions.formSubmitted ? formatTimestamp(item.timestamp) : '-'}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="text-[9px]">
                          {item["Please describe the item"] !== '-' ? item["Please describe the item"] : 'No description available'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center">
                          <img 
                            src={details} 
                            alt="Details" 
                            className="w-4.5 h-4.5 cursor-pointer" 
                            onClick={(e) => handleDetailsIconClick(index, e)}
                          />
                          <div className="text-[9px] text-center text-gray-500 mt-0.5">
                            {item.bottomActions.formSubmitted ? formatTimestamp(item.timestamp) : '-'}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center">
                          <img 
                            src={details} 
                            alt="Details" 
                            className="w-4.5 h-4.5 cursor-pointer"
                          />
                          <div className="text-[9px] text-center text-gray-500 mt-0.5">
                            {item.bottomActions.formSubmitted ? formatTimestamp(item.timestamp) : '-'}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="text-base font-semibold">
                          {item.bottomActions.formSubmitted ? '93%' : '-'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 ${item.status === "CLAIMED" ? "bg-[#00a896]" : "bg-[#A14342]"} text-white text-[9px] rounded-full`}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {isLoading && (
                    <tr>
                      <td colSpan="9" className="py-6 text-center text-gray-500 text-xs">Loading...</td>
                    </tr>
                  )}
                  {!isLoading && (!selectedBox || !boxDetails[selectedBox]?.middleContent?.length) && (
                    <tr>
                      <td colSpan="9" className="py-6 text-center text-gray-500 text-xs">No items found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Image Pop-up */}
      {popUpImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
          onClick={closeImagePopup}
        >
          <img 
            src={popUpImage}
            alt="Popup"
            className="max-w-xl max-h-[60vh] rounded-md"
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

      {/* Form Details Pop-up */}
      {showDetailsBox && activeRow !== null && boxDetails[selectedBox]?.middleContent[activeRow] && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={closeDetailsPopup}
        >
          <div
            className="bg-[#1E1E1E] p-4.5 rounded-[18px] shadow-lg text-[#858080] w-[300px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-base font-semibold text-white">Form Details</h2>
              <button 
                onClick={closeDetailsPopup}
                className="text-white hover:text-gray-300 transition-colors duration-200"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4.5 w-4.5"
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
            
            <div className="space-y-2">
              {[
                { label: "Name", key: "Name" },
                { label: "Phone Number", key: "Phone number" },
                { label: "Item Description", key: "Please describe the item" },
                { label: "Box ID", key: "Please enter the box ID you're putting the item in?" },
                { label: "Item Type", key: "What is the item?" },
                { label: "Item Location", key: "Where did you find the item?" },
                { label: "Timestamp", key: "timestamp", formatter: formatTimestamp }
              ].map(({ label, key, formatter }) => (
                <div key={key} className="border-b border-[#3C3B3B] pb-1.5">
                  <p className="font-semibold text-white text-xs">{label}:</p>
                  <p className="break-words text-xs">
                    {formatter 
                      ? formatter(boxDetails[selectedBox].middleContent[activeRow][key])
                      : boxDetails[selectedBox].middleContent[activeRow][key] || "Not Specified"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Monitoring;