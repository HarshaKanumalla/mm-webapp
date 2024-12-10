import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth, signOut } from "firebase/auth";
import { getDatabase, ref as dbRef, set, onChildAdded } from "firebase/database";
import { getStorage, ref as storageRef, listAll, getDownloadURL } from "firebase/storage";

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

// Default base64 image if no image is available
const DEFAULT_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

// Function to save row data to Complete_data
const saveRowToCompleteData = async (boxId, rowData) => {
  try {
    const db = getDatabase();
    const timestamp = rowData.timestamp;

    // Format the timestamp for Firebase path (remove special characters)
    const formattedTimestamp = timestamp.replace(/[.[\]#$/]/g, '_');
    const path = `Complete_data/${boxId}/${formattedTimestamp}`;

    const dataToSave = {
      box_ID: boxId,
      timestamp: timestamp, // Keep original timestamp in the data
      camera_image: rowData.cameraImage || "-",
      form_image: rowData.formImageUrl || "-",
      status: rowData.status || "UNCLAIMED",
      additional_details: {
        name: rowData.Name || "-",
        phone_number: rowData["Phone number"] || "-",
        item_description: rowData["Please describe the item"] || "-",
        box_id: rowData["Please enter the box ID you're putting the item in?"] || boxId,
        item_type: rowData["What is the item?"] || "-",
        item_location: rowData["Where did you find the item?"] || "-"
      }
    };

    console.log('Saving data for path:', path);
    console.log('Data being saved:', dataToSave);

    await set(dbRef(db, path), dataToSave);
    console.log(`Row saved successfully for timestamp: ${timestamp}`);
    return true;
  } catch (error) {
    console.error("Error saving row:", error);
    console.error("Failed data:", rowData);
    return false;
  }
};

export const Monitoring = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  const db = getDatabase();
  const storage = getStorage();

  // State variables
  const [selectedBox, setSelectedBox] = useState(1506);
  const [popUpImage, setPopUpImage] = useState(null);
  const [showDetailsBox, setShowDetailsBox] = useState(false);
  const [activeRow, setActiveRow] = useState(0);
  const [boxDetails, setBoxDetails] = useState({});
  const [processedEvents] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const scrollContainerRef = useRef(null);



// Update the getDirectImageUrl function
const getDirectImageUrl = (driveUrl) => {
  if (!driveUrl || driveUrl === "-") return null;
  
  try {
    if (driveUrl.includes('drive.google.com')) {
      const fileId = driveUrl.match(/id=([^&]+)/)[1];
      // Return a more reliable format for Google Drive images
      return `https://drive.google.com/uc?id=${fileId}&export=view`;
    }
    return driveUrl;
  } catch (error) {
    console.error('Error processing image URL:', error);
    return null;
  }
};

  // Modified bottom container data structure
  const defaultBottomActions = {
    doorOpened: false,
    imageCaptured: false,
    sentToCloud: false,
    qrDisplayed: false,
    formSubmitted: false
  };

  // Create a separate function to handle door events
  const handleDoorEvent = (prevDetails, selectedBox, doorData) => {
    const updatedDetails = JSON.parse(JSON.stringify(prevDetails));

    if (!updatedDetails[selectedBox]) {
      updatedDetails[selectedBox] = { middleContent: [] };
    }

    const boxContent = updatedDetails[selectedBox].middleContent;

    // Create new entry for door open event
    const newEntry = {
      timestamp: doorData.timestamp,
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
        ...defaultBottomActions,
        doorOpened: true
      }
    };

    boxContent.push(newEntry);

    // Save the new row immediately
    saveRowToCompleteData(selectedBox, newEntry);

    return updatedDetails;
  };

  // Keep existing timestamp-related functions
  const parseTimestamp = (timestampStr) => {
    try {
      // Handle compact format (20241206T190451.000Z)
      let reformattedTimestamp = timestampStr;

      // Check if timestamp is in compact format without separators
      if (timestampStr.match(/^\d{8}T\d{6}\.\d{3}Z$/)) {
        reformattedTimestamp = timestampStr.replace(
        /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d{3})Z$/,
        "$1-$2-$3T$4:$5:$6.$7Z"
      );
    } else {
      // Handle existing format with time separators
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
    if (!timestamp1 || !timestamp2) {
      if (logDetails) {
        console.log('Timestamp matching failed: One or both timestamps are null');
      }
      return false;
    }
    
    const date1 = parseTimestamp(timestamp1);
    const date2 = parseTimestamp(timestamp2);
    
    if (!date1 || !date2) {
      if (logDetails) {
        console.log('Timestamp parsing failed for one or both timestamps');
      }
      return false;
    }
    
    const timeDiffMs = Math.abs(date1.getTime() - date2.getTime());
    const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

    const isInRange = timeDiffMs <= TIMESTAMP_WINDOW_MS;

    if (logDetails) {
      console.group('Timestamp Matching Analysis');
      console.log('Timestamp 1:', timestamp1, '(Parsed:', date1.toISOString(), ')');
      console.log('Timestamp 2:', timestamp2, '(Parsed:', date2.toISOString(), ')');
      console.log('Time Difference:', timeDiffMs / 1000 / 60, 'minutes');
      console.log('Matching Window:', TIMESTAMP_WINDOW_MS / 1000 / 60, 'minutes');
      console.log('Timestamps Match:', isInRange);
      console.groupEnd();
    }

    return isInRange;
  };

  // Modified fetchCameraImages function - keep existing implementation
  const fetchCameraImages = async (storage, boxId) => {
    try {
      console.group(`Fetching camera images for Box ${boxId}`);
      const imagesRef = storageRef(storage, 'missingmatters_photos/Camera_Images/');
      const imagesList = await listAll(imagesRef);
      const cameraImages = new Set();
      
      for (const item of imagesList.items) {
        const fileName = item.name;
        if (fileName.startsWith(`HN ${boxId}`)) {
          const imageId = `${boxId}-${fileName}`;
          if (!processedEvents.has(imageId)) {
            try {
              // Updated regex to match both formats:
              // - 20241206T190451.000Z (compact)
              // - 2024-12-06T190451.000Z (with separators)
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
              } else {
                console.warn(`No valid timestamp found in filename: ${fileName}`);
              }
            } catch (error) {
              console.error(`Error processing image ${fileName}:`, error);
            }
          }
        }
      }
  
      const uniqueCameraImages = Array.from(cameraImages).map(jsonStr => JSON.parse(jsonStr));
      console.log(`Found ${uniqueCameraImages.length} unique images for box ${boxId}`);
      console.groupEnd();
      return uniqueCameraImages;
    } catch (error) {
      console.error("Error fetching camera images:", error);
      console.groupEnd();
      return [];
    }
  };
  

  const mergeOrCreateEntry = (prevDetails, selectedBox, newData, isCamera = false) => {
  console.group(`Merging ${isCamera ? 'Camera Image' : 'Additional Details'} for Box ${selectedBox}`);
  
  const updatedDetails = JSON.parse(JSON.stringify(prevDetails));
  
  if (!updatedDetails[selectedBox]) {
    updatedDetails[selectedBox] = { middleContent: [] };
  }

  const boxContent = updatedDetails[selectedBox].middleContent;

  const findMatchingDoorEntry = (timestamp) => {
    return boxContent.findIndex(entry => 
      entry.bottomActions.doorOpened && 
      isTimestampInRange(entry.timestamp, timestamp, true)
    );
  };
  
  if (isCamera) {
    const matchingEntryIndex = findMatchingDoorEntry(newData.timestamp);

    if (matchingEntryIndex !== -1) {
      boxContent[matchingEntryIndex].cameraImage = newData.cameraImage;
      boxContent[matchingEntryIndex].bottomActions = {
        ...boxContent[matchingEntryIndex].bottomActions,
        imageCaptured: true,
        sentToCloud: true
      };
      // Save updated entry
      saveRowToCompleteData(selectedBox, boxContent[matchingEntryIndex]);
    } else {
      const existingCameraEntryIndex = boxContent.findIndex(entry => 
        entry.cameraImage === "-" && 
        isTimestampInRange(entry.timestamp, newData.timestamp, true)
      );

      if (existingCameraEntryIndex !== -1) {
        boxContent[existingCameraEntryIndex].cameraImage = newData.cameraImage;
        boxContent[existingCameraEntryIndex].timestamp = newData.timestamp;
        // Save updated entry
        saveRowToCompleteData(selectedBox, boxContent[existingCameraEntryIndex]);
      } else {
        const newEntry = {
          timestamp: newData.timestamp,
          imageTimestamp: newData.timestamp,
          cameraImage: newData.cameraImage,
          formImageUrl: "-",
          Name: "-",
          "Phone number": "-",
          "Please describe the item": "-",
          "Please enter the box ID you're putting the item in?": selectedBox,
          "What is the item?": "-",
          "Where did you find the item?": "-",
          status: "UNCLAIMED",
          bottomActions: {
            ...defaultBottomActions,
            imageCaptured: true,
            sentToCloud: true
          }
        };
        boxContent.push(newEntry);
        // Save new entry
        saveRowToCompleteData(selectedBox, newEntry);
      }
    }
  } else {
    // This is for form submissions
    console.log('Processing form submission:', newData);
    const matchingEntryIndex = findMatchingDoorEntry(newData.timestamp);

    if (matchingEntryIndex !== -1) {
      boxContent[matchingEntryIndex] = {
        ...boxContent[matchingEntryIndex],
        ...newData,
        bottomActions: {
          ...boxContent[matchingEntryIndex].bottomActions,
          qrDisplayed: true,
          formSubmitted: true
        }
      };
      // Save updated form entry
      console.log('Saving updated form entry:', boxContent[matchingEntryIndex]);
      saveRowToCompleteData(selectedBox, boxContent[matchingEntryIndex]);
    } else {
      const newEntry = {
        ...newData,
        cameraImage: "-",
        formImageUrl: newData.formImageUrl || "-",
        status: "UNCLAIMED",
        bottomActions: {
          ...defaultBottomActions,
          qrDisplayed: true,
          formSubmitted: true
        }
      };
      boxContent.push(newEntry);
      // Save new form entry
      console.log('Saving new form entry:', newEntry);
      saveRowToCompleteData(selectedBox, newEntry);
    }
  }
  console.groupEnd();
  return updatedDetails;
};

// Single useEffect for data fetching and listeners
useEffect(() => {
  let isSubscribed = true;
  const unsubscribers = [];
  setIsLoading(true);

  const setupListeners = async () => {
    try {
      // Door events listener
      const doorEventsRef = dbRef(db, 'door_events');
      const doorUnsubscribe = onChildAdded(doorEventsRef, (snapshot) => {
        const eventId = `door-${snapshot.key}`;
        if (!processedEvents.has(eventId) && isSubscribed) {
          const data = snapshot.val();
          if (data.boxId === String(selectedBox)) {
            setBoxDetails(prevDetails => handleDoorEvent(prevDetails, selectedBox, data));
            processedEvents.add(eventId);
          }
        }
      });
      unsubscribers.push(doorUnsubscribe);

      const responsesRef = dbRef(db, 'responses');
      const responseUnsubscribe = onChildAdded(responsesRef, (snapshot) => {
        const eventId = `response-${snapshot.key}`;
        if (!processedEvents.has(eventId) && isSubscribed) {
          const data = snapshot.val();
          console.log("Processing form response:", {
            eventId,
            formImageUrl: data.formImageUrl,
            boxId: data["Please enter the box ID you're putting the item in?"],
            selectedBox: selectedBox
          });

          if (data["Please enter the box ID you're putting the item in?"] === String(selectedBox)) {
            const detailsEntry = {
              Name: data["Name "] || "Unknown",
              "Phone number": data["Phone number "] || "Unknown",
              "Please describe the item": data["Please describe the item"] || "No description",
              "Please enter the box ID you're putting the item in?": selectedBox,
              "What is the item?": data["What is the item?"] || "Unknown",
              "Where did you find the item?": data["Where did you find the item?"] || "Unknown",
              formImageUrl: data.formImageUrl, // Remove the fallback options since we know the exact property name
              timestamp: data.timestamp,
              status: data.status || "UNCLAIMED",
              bottomActions: {
                ...defaultBottomActions,
                qrDisplayed: true,
                formSubmitted: true
              }
            };

            console.log("Created details entry:", detailsEntry);

            // Save the form submission immediately
            saveRowToCompleteData(selectedBox, detailsEntry);
      
            setBoxDetails(prevDetails => {
              const updatedDetails = JSON.parse(JSON.stringify(prevDetails));
              if (!updatedDetails[selectedBox]) {
                updatedDetails[selectedBox] = { middleContent: [] };
              }
      
              const boxContent = updatedDetails[selectedBox].middleContent;
              const matchingEntryIndex = boxContent.findIndex(entry => 
                isTimestampInRange(entry.timestamp, data.timestamp, true)
              );

              const updatedEntry = matchingEntryIndex !== -1
              ? {
                ...boxContent[matchingEntryIndex],
                ...detailsEntry,
                cameraImage: boxContent[matchingEntryIndex].cameraImage || "-"
              }
            : {
               ...detailsEntry,
               cameraImage: "-"
              };
              console.log("Final entry to be added/updated:", updatedEntry);

              if (matchingEntryIndex !== -1) {
                boxContent[matchingEntryIndex] = updatedEntry;
              } else {
                boxContent.push(updatedEntry);
              }

      
              return updatedDetails;
            });
            
            processedEvents.add(eventId);
          }
        }
      });

      // Fetch camera images
      const cameraImages = await fetchCameraImages(storage, selectedBox);
      if (isSubscribed) {
        cameraImages.forEach(imageData => {
          setBoxDetails(prevDetails => mergeOrCreateEntry(prevDetails, selectedBox, imageData, true));
        });
      }

      if (isSubscribed) {
        setIsLoading(false);
      }
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


  // Handler functions
  const handleScrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: -200,
        behavior: "smooth",
      });
    }
  };

  const handleScrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: 200,
        behavior: "smooth",
      });
    }
  };

  const handleBoxClick = (num) => {
    setSelectedBox(num);
    setActiveRow(0);
    console.log("Selected Box:", num);
  };

  const handleRowClick = (rowIndex) => {
    setActiveRow(rowIndex);
    console.log("Active Row:", rowIndex);
    console.log("Data for Active Row:", boxDetails[selectedBox]?.middleContent[rowIndex]);
  };

  const handleLogout = () => {
    signOut(auth)
      .then(() => {
        console.log("Logged out successfully");
        navigate("/");
      })
      .catch((error) => {
        console.error("Error logging out:", error);
      });
  };

// Update the handleImageClick function
const handleImageClick = (imageSrc) => {
  if (!imageSrc) return;

  if (imageSrc.includes('drive.google.com')) {
    try {
      const fileId = imageSrc.match(/id=([^&]+)/)[1];
      // Use the same format as getDirectImageUrl for consistency
      setPopUpImage(`https://drive.google.com/uc?id=${fileId}&export=view`);
    } catch (error) {
      console.error('Error processing pop-up image URL:', error);
    }
  } else {
    setPopUpImage(imageSrc);
  }
};

  const handleDetailsIconClick = (index) => {
    const details = boxDetails[selectedBox]?.middleContent[index] || {};
  
    console.log("Additional Details:", {
      Name: details.Name || "Unknown",
      PhoneNumber: details["Phone number"] || "Unknown",
      ItemDescription: details["Please describe the item"] || "No description",
      BoxID: details["Please enter the box ID you're putting the item in?"] || "Unknown",
      ItemType: details["What is the item?"] || "Unknown",
      ItemLocation: details["Where did you find the item?"] || "Unknown",
      Timestamp: details.timestamp || "Unknown"
    });
  
    setActiveRow(index);
    setShowDetailsBox(true);
  };
  
  const closePopUp = () => {
    setActiveRow(null);
    setShowDetailsBox(false);
  };

  // Set initial box on component mount
  useEffect(() => {
    setSelectedBox(1506);
  }, []);

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
            <img src={lineChart} alt="Line Chart" className="w-8 h-8 hover:opacity-80 cursor-pointer" />
            <img src={tasks} alt="Tasks" className="w-8 h-8 hover:opacity-80 cursor-pointer" />
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

          {/* Conditional rendering wrapper */}
          {selectedBox && (
            <div>
              {/* Middle Container - Box Contents */}
              <div
                className="bg-[#1E1E1E] border border-[#858080] rounded-[25px] mx-10 p-4 mt-6"
                style={{
                  height: "50vh",
                  overflowY: "auto",
                }}
              >
                {/* Table Header */}
                <div
                  className="flex items-center px-4"
                  style={{
                    backgroundColor: "#1E1E1E",
                    border: "1px solid #3C3B3B",
                    borderRadius: "15px",
                    height: "50px",
                    width: "95%",
                    margin: "0 auto",
                  }}
                >
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
                        {item.cameraImage !== "-" ? (
                          <div className="flex items-center">
                            <img
                              src={item.cameraImage}
                              alt="Box Camera"
                              className="w-10 h-10 rounded-md object-cover cursor-pointer"
                              onClick={() => handleImageClick(item.cameraImage)}
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
  {item.formImageUrl && item.formImageUrl !== "-" ? (
    <div className="flex items-center">
      <img
        src={getDirectImageUrl(item.formImageUrl)}
        alt="Form Upload"
        className="w-10 h-10 rounded-md object-cover cursor-pointer"
        onClick={() => handleImageClick(getDirectImageUrl(item.formImageUrl))}
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
                        <p className="text-sm text-[#858080] cursor-pointer" onClick={() => handleDetailsIconClick(index)}>
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

              {/* Bottom Container */}
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
        // If the primary URL fails, try the thumbnail URL
        if (popUpImage.includes('drive.google.com')) {
          const fileId = popUpImage.match(/id=([^&]+)/)[1];
          e.target.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
        }
      }}
    />
  </div>
)}
          {/* Details Pop-Up */}
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
                    className="text-white hover:text-gray-300"
                  >
                    ✕
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
                      { label: "Timestamp", key: "timestamp" }
                    ].map(({ label, key }) => (
                      <div key={key} className="border-b border-[#3C3B3B] pb-2">
                        <p className="font-semibold text-white">{label}:</p>
                        <p>{boxDetails[selectedBox].middleContent[activeRow][key] || "Not Specified"}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-500">No details available</p>
                )}
                </div>
              </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Monitoring;