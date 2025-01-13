import React, { useRef, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth, signOut } from "firebase/auth";
import { getDatabase, ref as dbRef, onValue, get, set } from "firebase/database";
import { getStorage, ref as storageRef, getDownloadURL, listAll } from "firebase/storage";

// Image imports
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
const TIME_WINDOW = 5 * 60 * 1000; // 5 minutes
const DEFAULT_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

// Camera Image Cell Component
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
        </div>
      </div>
    </div>
  );
});

CameraImageCell.displayName = 'CameraImageCell';

export const Monitoring = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  const db = getDatabase();
  const storage = getStorage();
  const scrollContainerRef = useRef(null);

  // State Management
  const [selectedBox, setSelectedBox] = useState(1506);
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
        // Parse door timestamp
        const doorTime = new Date(doorTimestamp).getTime();
        
        // Find images within the 5-minute window after door opened
        const relevantImages = boxImages.filter(image => {
          const imageTimeStr = image.name.split('_')[1].replace('.jpg', '');
          // Convert format like "20250111T160329.000Z" to "2025-01-11T16:03:29.000Z"
          const formattedImageTime = imageTimeStr.replace(
            /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d{3})Z/,
            '$1-$2-$3T$4:$5:$6.$7Z'
          );
          const imageTime = new Date(formattedImageTime).getTime();
          return imageTime >= doorTime && imageTime <= doorTime + TIME_WINDOW;
        });
        
        if (relevantImages.length === 0) {
          console.log(`[Camera Monitor] No images found within 5-minute window after door opened at ${doorTimestamp}`);
          if (retryCount < maxRetries) {
            setTimeout(() => {
              checkForNewImage(boxId, doorTimestamp, retryCount + 1, maxRetries);
            }, 10000);
          }
          return false;
        }
        
        // Sort relevant images by timestamp
        const sortedImages = relevantImages.sort((a, b) => {
          const timeA = a.name.split('_')[1].replace('.jpg', '');
          const timeB = b.name.split('_')[1].replace('.jpg', '');
          return timeB.localeCompare(timeA);
        });

        const mostRecent = sortedImages[0];
        console.log(`[Camera Monitor] Found relevant image: ${mostRecent.name}`);
        
        const imageTimestamp = mostRecent.name.split('_')[1].replace('.jpg', '');
        console.log(`[Camera Monitor] Image timestamp: ${imageTimestamp}, Door timestamp: ${doorTimestamp}`);

        const imageUrl = await getDownloadURL(mostRecent);
        
        setBoxDetails(prevDetails => {
          const updatedDetails = { ...prevDetails };
          const boxContent = updatedDetails[boxId]?.middleContent;
          
          if (!boxContent?.length) return prevDetails;

          // Find the most recent row that matches our criteria
          const targetRowIndex = boxContent.findIndex(row => {
            // Parse both timestamps to milliseconds for comparison
            const rowTime = new Date(row.timestamp).getTime();
            const doorTime = new Date(doorTimestamp).getTime();
            
            return row.bottomActions.doorOpened && 
                   row.cameraImage === "-" &&
                   Math.abs(rowTime - doorTime) < 60000; // Allow 1-minute difference
          });
          
          if (targetRowIndex !== -1) {
            console.log(`[Camera Monitor] Successfully updating row ${targetRowIndex} with new image`);
            console.log(`[Camera Monitor] Row timestamp: ${boxContent[targetRowIndex].timestamp}`);
            updatedDetails[boxId].middleContent[targetRowIndex].cameraImage = imageUrl;
            updatedDetails[boxId].middleContent[targetRowIndex].bottomActions.imageCaptured = true;
            updatedDetails[boxId].middleContent[targetRowIndex].bottomActions.sentToCloud = true;
            setActiveRow(targetRowIndex);

            // Save to Complete_data in Firebase
            try {
              const safeTimestamp = boxContent[targetRowIndex].timestamp.replace(/[.]/g, '_');
              const completeDataRef = dbRef(db, `Complete_data/${boxId}/${safeTimestamp}`);
              set(completeDataRef, {
                box_ID: boxId,
                camera_image: imageUrl,
                timestamp: boxContent[targetRowIndex].timestamp,
                status: "UNCLAIMED"
              });
            } catch (error) {
              console.error('[Camera Monitor] Error saving to Firebase:', error);
            }
          } else {
            console.log(`[Camera Monitor] No matching row found for timestamp ${doorTimestamp}`);
          }
          
          return updatedDetails;
        });
        
        return true;
      } else {
        console.log(`[Camera Monitor] No matching images found yet`);
        
        if (retryCount < maxRetries) {
          setTimeout(() => {
            checkForNewImage(boxId, doorTimestamp, retryCount + 1, maxRetries);
          }, 10000);
        } else {
          console.log(`[Camera Monitor] Exceeded maximum retry attempts`);
        }
        
        return false;
      }
    } catch (error) {
      console.error('[Camera Monitor] Error checking for new image:', error);
      console.error('Error details:', error.message);
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
const checkAndUpdateClaimStatus = useCallback(async (itemDescription) => {
  if (!itemDescription || itemDescription === "-") return "UNCLAIMED";
  
  try {
    const lostReportsRef = dbRef(db, 'lost_reports');
    const snapshot = await get(lostReportsRef);
    const lostReports = snapshot.val();
    
    if (!lostReports) return "UNCLAIMED";

    const isMatched = Object.values(lostReports).some(report => {
      const reportDesc = report.description.toLowerCase().trim();
      const itemDesc = itemDescription.toLowerCase().trim();
      return reportDesc.includes(itemDesc) || itemDesc.includes(reportDesc);
    });
    
    console.log(`[Claim Status] Item "${itemDescription}" matched: ${isMatched}`);
    return isMatched ? "CLAIMED" : "UNCLAIMED";
  } catch (error) {
    console.error("Error checking lost reports:", error);
    return "UNCLAIMED";
  }
}, [db]);

const monitorAdditionalDetails = useCallback((boxId) => {
  console.log(`[Form Monitor] Starting monitoring for Box ${boxId}`);
  const responsesRef = dbRef(db, 'responses');
  
  return onValue(responsesRef, async (snapshot) => {
    const responses = snapshot.val();
    if (!responses) return;

    setBoxDetails(prevDetails => {
      const updatedDetails = { ...prevDetails };
      const boxContent = updatedDetails[boxId]?.middleContent;
      if (!boxContent?.length) return prevDetails;

      boxContent.forEach(async (row, rowIndex) => {
        const doorOpenTime = new Date(row.timestamp).getTime();
        const endWindow = doorOpenTime + TIME_WINDOW;
        const now = Date.now();

        if (now <= endWindow) {
          const relevantResponses = Object.values(responses).filter(data => {
            if (data["Please enter the box ID you're putting the item in?"] !== boxId) return false;

            const formDate = new Date(data.timestamp);
            formDate.setHours(formDate.getHours() + 5);
            formDate.setMinutes(formDate.getMinutes() + 30);
            const formTime = formDate.getTime();

            return formTime >= doorOpenTime && formTime <= endWindow;
          });

          if (relevantResponses.length > 0 && !row.bottomActions.formSubmitted) {
            const mostRecent = relevantResponses[relevantResponses.length - 1];
            console.log(`[Form Monitor] Processing form submission for timestamp: ${row.timestamp}`);

            const formData = {
              name: mostRecent.Name || "-",
              phone: mostRecent["Phone number"] || "-",
              item_description: mostRecent["Please describe the item"] || "-",
              item_type: mostRecent["What is the item?"] || "-",
              location: mostRecent["Where did you find the item?"] || "-"
            };

            let processedFormImageUrl = mostRecent.formImageUrl || "-";
            if (processedFormImageUrl && processedFormImageUrl.includes('drive.google.com')) {
              const matches = processedFormImageUrl.match(/\/d\/(.*?)\/|id=(.*?)(&|$)/);
              const fileId = matches ? (matches[1] || matches[2]) : null;
              if (fileId) {
                processedFormImageUrl = `https://drive.google.com/uc?id=${fileId}`;
              }
            }

            // Get claim status
            const claimStatus = await checkAndUpdateClaimStatus(formData.item_description);

            // Update the row immediately
            updatedDetails[boxId].middleContent[rowIndex] = {
              ...row,
              Name: formData.name,
              "Phone number": formData.phone,
              "Please describe the item": formData.item_description,
              "What is the item?": formData.item_type,
              "Where did you find the item?": formData.location,
              status: claimStatus,
              formImageUrl: processedFormImageUrl,
              bottomActions: {
                ...row.bottomActions,
                formSubmitted: true,
                qrDisplayed: true
              }
            };

            // Force immediate UI update for the active row
            if (activeRow === rowIndex) {
              setActiveRow(rowIndex);
            }

            // Save to Firebase
            try {
              const safeTimestamp = row.timestamp.replace(/[.]/g, '_');
              const completeDataRef = dbRef(db, `Complete_data/${boxId}/${safeTimestamp}`);
              
              const firebaseData = {
                box_ID: boxId,
                camera_image: row.cameraImage || "-",
                form_image: processedFormImageUrl || "-",
                status: claimStatus || "UNCLAIMED",
                timestamp: row.timestamp,
                additional_details: formData
              };

              await set(completeDataRef, firebaseData);
              console.log('[Form Monitor] Form data saved successfully');
            } catch (error) {
              console.error('[Form Monitor] Error saving form data:', error);
            }
          }
        }
      });

      return updatedDetails;
    });
  });
}, [db, checkAndUpdateClaimStatus, TIME_WINDOW, activeRow]);


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

// Setup Effects
useEffect(() => {
  const unsubscribers = [];
  setIsLoading(true);

  const setupMonitoring = async () => {
    try {
      // First load saved data
      const completeDataRef = dbRef(db, 'Complete_data');
      const snapshot = await get(completeDataRef);
      const savedData = snapshot.val();
      
      if (savedData) {
        const processedData = {};
        Object.entries(savedData).forEach(([boxId, boxData]) => {
          processedData[boxId] = { middleContent: [] };
          
          Object.entries(boxData).forEach(([timestamp, data]) => {
            const row = {
              timestamp: data.timestamp,
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
          
          processedData[boxId].middleContent.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
          );
        });
        
        setBoxDetails(processedData);
      }

      // Then set up real-time monitoring
      const boxIds = ['1506', '1507'];
      boxIds.forEach(boxId => {
        unsubscribers.push(
          monitorDoorStatus(boxId),
          monitorAdditionalDetails(boxId)
        );
      });

    } catch (error) {
      console.error('Failed to setup monitoring:', error);
    } finally {
      setIsLoading(false);
    }
  };

  setupMonitoring();

  return () => {
    console.log('Removing listeners and subscriptions');
    unsubscribers.forEach(unsubscribe => unsubscribe());
  };
}, [db, monitorDoorStatus, monitorAdditionalDetails]);

// Initialize selected box
useEffect(() => {
  setSelectedBox(1506);
}, []);

  // Render Methods
  const renderBottomContainer = () => {
    const selectedRow = activeRow !== null && boxDetails[selectedBox]?.middleContent[activeRow];
    
    return (
      <div className="bg-[#1E1E1E] border border-[#2E2E2E] rounded-[25px] h-[125px] mx-10 mt-6">
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


  // Main Render
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
          {renderBottomContainer()}

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
                        handleImageClick={handleImageClick}
                        formatTimestamp={formatTimestamp}
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