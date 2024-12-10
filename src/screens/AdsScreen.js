import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ref, listAll, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../firebase"; // Adjust path as necessary
import dashboard from "./dashboard.png";
import dataCenter from "./data-center.png";
import futures from "./futures.png";
import lineChart from "./line-chart.png";
import tasks from "./tasks.png";
import logout from "./logout.png";
import expandArrow from "./expand-arrow.png";
import circledPlay from "./circled-play.png";
import menuVertical from "./menu-vertical.png";
import deleteIcon from "./delete-icon.png";
import uploadArrow from "./upload-arrow.png";

export const AdsScreen = () => {
  const navigate = useNavigate();
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [activeMenu, setActiveMenu] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedBoxes, setSelectedBoxes] = useState([]);
  const [uploadedFileNames] = useState({});
  const [boxFiles, setBoxFiles] = useState({}); // Stores files specific to each box
  const [currentBox, setCurrentBox] = useState("HN 1506"); // Default box
  const [selectedForBox, setSelectedForBox] = useState([]); // Files selected for the box
  const [uploadedFiles, setUploadedFiles] = useState([]); // Fixing improper initialization


   // Fetch files in the large container on load
   useEffect(() => {
    const fetchLargeContainerFiles = async () => {
      try {
        const folderRef = ref(storage, `missingmatters_videos/`);
        const result = await listAll(folderRef);


        const files = [];
        await Promise.all(
          result.items.map(async (itemRef) => {
            const url = await getDownloadURL(itemRef);
            files.push({ name: itemRef.name, url });
          
          })
        );

        setUploadedFiles(files);
      } catch (error) {
        console.error("Error fetching large container files:", error);
      }
    };

    fetchLargeContainerFiles();
  }, []);

  // Fetch files for the current box
  useEffect(() => {
    const fetchBoxFiles = async () => {
      try {
        const boxFolderRef = ref(storage, `missingmatters_videos/${currentBox}/`);
        const result = await listAll(boxFolderRef);

        const files = [];
        await Promise.all(
          result.items.map(async (itemRef) => {
            const url = await getDownloadURL(itemRef);
            files.push({ name: itemRef.name, url });
          })
        );

        setBoxFiles((prev) => ({
          ...prev,
          [currentBox]: files,
        }));
      } catch (error) {
        console.error("Error fetching box files:", error);
      }
    };

    fetchBoxFiles();
  }, [currentBox]);

    
  const toggleDropdown = (menu) => {
    setActiveDropdown((prev) => (prev === menu ? null : menu));
  };
  
  const toggleMenu = (index) => {
    setActiveMenu((prev) => (prev === index ? null : index));
  };
  
  const toggleSelectBox = (index) => {
    if (!selectMode) return; // Allow selection only in select mode
  
    const selectedFile = uploadedFiles[index]; // Get the file from the large container
    if (!selectedFile) {
      alert("No file uploaded for this box.");
      return;
    }
    
    // Add the selected file to `selectedForBox` state
    setSelectedForBox((prev) => {
      const alreadySelected = prev.some((file) => file.name === selectedFile.name);
      if (alreadySelected) {
        return prev.filter((file) => file.name !== selectedFile.name); // Remove if already selected
      }
      return [...prev, selectedFile]; // Add to selection
        
    });

    setBoxFiles((prev) => ({
      ...prev,
      [currentBox]: [...(prev[currentBox] || []), selectedFile],
    }));
  };
 
  
 // Handle file upload to the large container
 const handleFileUpload = async (file) => {
  if (!file) {
    console.error("No file selected.");
    return;
  }

  try {
    const fileRef = ref(storage, `missingmatters_videos/${file.name}`); // File name remains the same
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);

    setUploadedFiles((prev) => [...prev, { name: file.name, url }]); // File name remains unchanged
  } catch (error) {
    console.error("Error uploading file:", error);
    }
  };

  // Handle file deletion from the large container
  const handleDeleteFile = async (fileName) => {
    try {
      const fileRef = ref(storage, `missingmatters_videos/${fileName}`);
      await deleteObject(fileRef);

      setUploadedFiles((prev) => prev.filter((file) => file.name !== fileName));
    } catch (error) {
      console.error("Error deleting file:", error);
    }
  };

  const handleRemoveFileFromBox = async (fileName) => {
    try {
      const fileRef = ref(storage, `missingmatters_videos/${currentBox}/${fileName}`);
      await deleteObject(fileRef); // Delete the file from Firebase
  
      // Update the UI to remove the file
      setBoxFiles((prev) => ({
        ...prev,
        [currentBox]: prev[currentBox].filter((file) => file.name !== fileName),
      }));
      alert(`File '${fileName}' removed from box '${currentBox}'.`);
    } catch (error) {
      console.error(`Error removing file '${fileName}':`, error);
    }
  };
  

  // Handle file selection for a specific box
  const handleSelectFileForBox = (file) => {
    if (selectedForBox.some((selected) => selected.name === file.name)) {
      setSelectedForBox((prev) => prev.filter((selected) => selected.name !== file.name));
    } else {
      setSelectedForBox((prev) => [...prev, file]);
    }
  };

  const handleUploadToBox = async () => {
    try {
      if (selectedForBox.length === 0) {
        alert("No files selected for upload.");
        return;
      }
  
      const boxFolderPath = `missingmatters_videos/${currentBox}/`;
  
      await Promise.all(
        selectedForBox.map(async (file) => {
          const blob = await fetch(file.url).then((res) => res.blob());
  
          // Upload to the specific box folder
          const boxFolderRef = ref(storage, `${boxFolderPath}${file.name}`);
          await uploadBytes(boxFolderRef, blob);
  
          // Upload to the main folder (large container)
          const mainFolderRef = ref(storage, `missingmatters_videos/${file.name}`);
          await uploadBytes(mainFolderRef, blob);
        })
      );
  
      // Update the state for the specific box
      setBoxFiles((prev) => ({
        ...prev,
        [currentBox]: [...(prev[currentBox] || []), ...selectedForBox],
      }));
  
      // Clear the selected files
      setSelectedForBox([]);
      alert(`Files uploaded successfully to box: ${currentBox}`);
    } catch (error) {
      console.error("Error uploading to box:", error);
      alert("Failed to upload files. Please try again.");
    }
  };
  

 
  
  // Navigation to handle previous/next boxes
const handleBoxNavigation = (direction) => {
  const boxes = ["HN 1506", "HN 1507", "HN 1508", "HN 1509"];
  const currentIndex = boxes.indexOf(currentBox);
  const newIndex =
    direction === "prev"
      ? (currentIndex - 1 + boxes.length) % boxes.length
      : (currentIndex + 1) % boxes.length;

  setCurrentBox(boxes[newIndex]); // Update currentBox state
};

// Logout navigation logic
const handleLogout = () => {
  navigate("/"); // Redirect to login or home page
};

  
  return (
    <div className="flex h-screen bg-[#000000] text-white">
      {/* Sidebar */}
      <div className="flex flex-col items-center py-8 bg-[#1E1E1E] w-24 rounded-tr-[25px] rounded-br-[25px]">
        <div className="bg-[#2A2929] rounded-full h-16 w-16 flex items-center justify-center mb-8">
          <span className="text-[#858080] text-[24px] font-semibold font-montserrat">MM</span>
        </div>
        <nav className="flex flex-col items-center justify-center flex-grow space-y-4">
          <img
            src={futures}
            alt="Dashboard"
            className="w-8 h-8 hover:opacity-80 cursor-pointer"
            onClick={() => navigate("/dashboard")}
          />
          <img
            src={dataCenter}
            alt="MM Ads"
            className="w-8 h-8 hover:opacity-80 cursor-pointer"
            onClick={() => navigate("/ads")}
          />
          <img
            src={dashboard}
            alt="Monitoring"
            className="w-8 h-8 hover:opacity-80 cursor-pointer"
            onClick={() => navigate("/monitoring")}
          />
          <img
            src={lineChart}
            alt="Analytics"
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col px-10 pt-6">
        {/* Top Navigation */}
        <div
          className="relative flex items-center bg-[#1E1E1E] border border-[#3C3B3B] rounded-[25px] px-4"
          style={{
            height: "80px",
            marginBottom: "20px",
            justifyContent: "space-between",
          }}
        >
          <div className="flex items-center justify-center cursor-pointer">
            <span className="text-[#858080] text-[24px] font-montserrat">&lt;</span>
          </div>
          {Object.entries({
            MMBoxes: ["HN 1506", "HN 1507", "HN 1508", "HN 1509"],
            FileType: [".jpg", ".png", ".mpv", ".mp4"],
            Playlists: ["Playlist-I", "Playlist-II", "Playlist-III"],
            Location: ["Kondapur", "Madhapur", "Uppal"],
            Daylisting: ["Morning", "Afternoon", "Evening", "Night"],
            Timing: ["9AM - 12PM", "12PM - 3PM", "3PM - 6PM", "6PM - 9PM"],
          }).map(([key, values], index) => (
            <div
              key={index}
              className="relative flex flex-col items-center justify-center p-3 rounded-[25px] cursor-pointer"
              style={{
                width: "173.25px",
                backgroundColor: "#1E1E1E",
                border: "1px solid #3C3B3B",
                color: "#858080",
              }}
              onClick={() => toggleDropdown(key)}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[16px] font-montserrat mr-1">{key}</span>
                <img src={expandArrow} alt="Expand" className="w-4 h-4" />
              </div>
              {activeDropdown === key && (
                <div
                  className="absolute bg-[#1E1E1E] border border-[#3C3B3B] rounded-[25px] p-4 z-50"
                  style={{
                    width: "173.25px",
                    top: "60px",
                  }}
                >
                  {values.map((option, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between mb-2"
                    >
                      <label
                        htmlFor={`${key}-${idx}`}
                        className="text-[#858080] text-[14px] font-montserrat mr-1"
                      >
                        {option}
                      </label>
                      <input
                        type="checkbox"
                        id={`${key}-${idx}`}
                        className="appearance-none w-5 h-5 border-[#3C3B3B] border-2 bg-[#1E1E1E] checked:bg-[#3C3B3B] focus:outline-none rounded-[4px]"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent dropdown close
                          // Add your checkbox select logic here
                          console.log(`Checkbox for ${option} clicked`);
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center justify-center cursor-pointer">
            <span className="text-[#858080] text-[24px] font-montserrat">&gt;</span>
          </div>
        </div>

        {/* Main Section */}
        <div className="flex flex-row gap-6">
          {/* Large Container */}
          <div
            className="bg-[#000000] border border-[#3C3B3B] rounded-[25px] overflow-y-auto"
            style={{
              height: "550px",
              width: "70%",
            }}
          >
            <div
              className="grid grid-cols-5 gap-6 p-6"
              style={{
                maxHeight: "500px",
              }}
            >
              {uploadedFiles.map((file, index) => (
                <div
                  key={index}
                  className={`relative flex items-center justify-center ${
                    selectMode && selectedBoxes.includes(index)
                      ? "bg-[#4a4a4a]"
                      : "bg-[#2A2929]"
                  } border border-[#3C3B3B] rounded-[25px]`}
                  style={{
                    width: "150px",
                    height: "150px",
                    backgroundImage: file.url
                      ? `url(${file.url})`
                      : "none",
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      
                  }}
                  onClick={() => toggleSelectBox(index)} // Ensure toggleSelectBox is defined properly
                >
                  {/* Hidden File Input */}
                  <input
                    type="file"
                    accept=".png,.jpg,.mp4,.mpv"
                    style={{ display: "none" }}
                    id={`file-input-${index}`}
                    onChange={(e) => {
                      const file = e.target.files[0]; // Get the selected file
                      if (file) {
                        handleFileUpload(file); // Pass the selected file to the handler
                      } else {
                        console.error("No file selected.");
                      }
                    }}
                  />
                  {/* Label for File Input */}
                  <label
                    htmlFor={`file-input-${index}`}
                    className="absolute cursor-pointer"
                    style={{ width: "50px", height: "50px", position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
                  >
                    <img src={circledPlay} alt="Play" style={{ width: "50px", height: "50px", opacity: 1}} />
                  </label>

                  {/* File Name Display */}
                  <div
                    className="absolute bottom-0 w-full bg-[#1E1E1E] text-[#E8DCD0] text-[12px] text-center font-montserrat truncate px-2 py-1"
                    style={{
                      borderTop: "1px solid #3C3B3B", // Adds a border between the thumbnail and the name
                      }}
                    >
                      {file.name} {/* File name is displayed exactly as it was uploaded */}
                  </div>
                  
                  {/* Menu Options */}
                  <img
                    src={menuVertical}  
                    alt="Menu"
                    className="absolute top-3 cursor-pointer"
                    style={{
                      right: "5px",
                      width: "20px",
                      height: "20px",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMenu(index);
                    }}
                  />
                  {activeMenu === index && (
                    <div
                    className="absolute top-10 right-5 bg-[#1E1E1E] border border-[#3C3B3B] rounded-[10px] p-3 z-20"
                    style={{
                      width: "120px",
                    }}
                    >
                      <div
                      className="text-[#858080] text-[14px] font-montserrat cursor-pointer hover:text-white mb-2"
                      onClick={() => handleSelectFileForBox(file)} // Pass the correct file object
                      >
                        Select
                      </div>  
                      <div className="text-[#858080] text-[14px] font-montserrat cursor-pointer hover:text-white">
                        Add to Playlist
                      </div>
                      <div
                        className="text-[#858080] text-[14px] font-montserrat cursor-pointer hover:text-red-500"
                        onClick={() => handleDeleteFile(file.name)} // Ensure file.name exists
                      >
                        Delete
                      </div>
                    </div>
                    )}
                  </div>
                  ))}
                </div>
              </div>
            


          {/* Rectangular Container */}
          <div
            className="bg-[#1E1E1E] border border-[#3C3B3B] rounded-[25px] flex flex-col"
            style={{
              height: "550px",
              width: "30%",
              padding: "20px",
            }}
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <button className="text-[#858080] text-[20px] font-medium"
                      onClick={() => handleBoxNavigation("prev")}
              >
                &lt;
              </button>
              <span
                className="text-[#858080] font-montserrat font-medium"
                style={{ fontSize: "22px" }}
              >
                {currentBox}
              </span>
              <button
                className="text-[#858080] text-[20px] font-medium"
                onClick={() => handleBoxNavigation("next")}
              >  
                &gt;
              </button>
            </div>


            {/* Play Icon Section */}
            <div 
              className="flex justify-center items-center mb-6"
              style={{
                position: "relative", // Ensure this container is the reference for absolute positioning
              }}

            >

              <div
                className="flex items-center justify-center bg-[#2A2929] border border-[#3C3B3B] rounded-[25px]"
                style={{
                  width: "180px",
                  height: "180px",
                  position: "relative", // Ensure child absolute positioning works
                }}
              >
                <img src={circledPlay} 
                alt="Play" 
                className="absolute w-12 h-12 cursor pointer"
                style={{
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)", // Center the icon
                  zIndex: 10, // Ensure it's above other elements
                }}
                onClick={(e) => {
                  e.stopPropagation(); // Prevent click propagation 
                  alert("You can now select files from the large container.");
                  setSelectMode(true); // Enable selection mode
                }}
              />
              </div>
            </div>

            {/* Ad List */}
            <div className="flex flex-col gap-2 overflow-y-auto pr-2">
              {(boxFiles[currentBox] || []).map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-[#858080] text-[14px]"
                >
                  <div className="flex items-center gap-6">
                    <span
                      className="bg-[#464646] rounded-full flex items-center justify-center"
                      style={{
                        width: "36px",
                        height: "36px",
                        fontSize: "16px",
                      }}
                    >
                      {index + 1}
                    </span>
                    <div>
                      <p>{file.name}</p> {/* Show the file name */}
                    </div>
                  </div>
                  <button
                      onClick={() => 
                        setBoxFiles((prev) => ({
                          ...prev,
                          [currentBox]: prev[currentBox].filter((_, i) => i !== index), // Remove from box
                        }))
                      }
                      >
                    <img src={deleteIcon} alt="Delete" className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Upload Button */}
            <div className="mt-auto">
              <button
                className="flex items-center justify-center w-3/4 py-3 bg-[#1E1E1E] border border-[#3C3B3B] text-[#E8DCD0] rounded-full"
                style={{
                  fontSize: "14px",
                  margin: "0 auto",
                  height: "45px",}}
                  onClick={handleUploadToBox}
                
              >
                Upload to Box
                <img src={uploadArrow} alt="Arrow" className="ml-4 w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdsScreen;
