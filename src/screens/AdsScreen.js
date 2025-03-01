import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ref, listAll, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../firebase";
import dashboard from "./dashboard.png";
import dataCenter from "./monitoring.png";
import futures from "./ads.png";
import lineChart from "./line-chart.png";
import tasks from "./tasks.png";
import logout from "./logout.png";
import circledPlay from "./circled-play.png";
import menuVertical from "./menu-vertical.png";
import deleteIcon from "./delete-icon.png";
import uploadArrow from "./upload-arrow.png";
import mmlogo from './mmlogo.png';

const MetricsBox = ({ title }) => {
  const sampleData = [800, 600, 1506, 1200];
  const total = 150624;

  return (
    <div 
      className="w-full h-48 rounded-xl relative overflow-hidden"
      style={{
        background: 'linear-gradient(to bottom, rgba(21, 20, 26, 0.9), rgba(46, 45, 51, 1))'
      }}
    >
      <div className="p-6 h-full flex flex-col">
        <h2 className="font-['Montserrat'] text-gray-300 text-base mb-4">
          {title}
        </h2>
        
        <div className="flex justify-between items-end flex-1">
          <div>
            <span className="text-white text-5xl font-light">
              {total.toLocaleString()}
            </span>
          </div>
          
          <div className="flex items-end gap-3 h-20">
            {sampleData.map((value, index) => {
              const maxValue = Math.max(...sampleData);
              const height = (value / maxValue) * 100;
              return (
                <div 
                  key={index}
                  className="w-8 flex items-end"
                  style={{ height: '100%' }}
                >
                  <div 
                    className={`w-full rounded-sm transition-all duration-300 ${
                      index === sampleData.length - 1 ? 'bg-[#2A9D8F]' : 'bg-[#E8DCD0]'
                    }`}
                    style={{ height: `${height}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-[#E8DCD0]" />
      </div>
    </div>
  );
};

const CircularProgress = ({ currentBox, storage }) => {
  const [currentBoxCount, setCurrentBoxCount] = useState(0);
  const [totalAdsCount, setTotalAdsCount] = useState(0);
  
  useEffect(() => {
    const fetchBoxData = async () => {
      if (!currentBox || !storage) {
        console.log('Missing required props:', { currentBox, storage });
        return;
      }
      
      try {
        const currentBoxRef = ref(storage, `missingmatters_videos/${currentBox}/`);
        const currentBoxResult = await listAll(currentBoxRef);
        const currentCount = currentBoxResult.items.length;
        console.log(`Current box ${currentBox} count:`, currentCount);
        setCurrentBoxCount(currentCount);
        
        const boxes = ["HN 1506", "HN 1507", "HN 1508", "HN 1509"];
        const boxPromises = boxes.map(async (box) => {
          const boxRef = ref(storage, `missingmatters_videos/${box}/`);
          const result = await listAll(boxRef);
          return result.items.length;
        });
        
        const boxCounts = await Promise.all(boxPromises);
        const total = boxCounts.reduce((sum, count) => sum + count, 0);
        console.log('Total ads count:', total);
        setTotalAdsCount(total);
        
      } catch (error) {
        console.error("Error fetching box data:", error);
      }
    };

    fetchBoxData();
  }, [currentBox, storage]);
  
  const radius = 65;
  const strokeWidth = 12;
  const center = radius + strokeWidth;
  const size = (radius + strokeWidth) * 2;
  
  const startAngle = -160;
  const endAngle = 160;
  const progressAngle = startAngle + ((endAngle - startAngle) * (currentBoxCount / (totalAdsCount || 1)));

  const polarToCartesian = (angle) => {
    const angleInRadians = (angle - 90) * Math.PI / 180.0;
    return {
      x: center + (radius * Math.cos(angleInRadians)),
      y: center + (radius * Math.sin(angleInRadians))
    };
  };

  const generateArc = (start, end) => {
    const startPoint = polarToCartesian(start);
    const endPoint = polarToCartesian(end);
    const largeArcFlag = end - start <= 180 ? "0" : "1";

    return [
      "M", startPoint.x, startPoint.y,
      "A", radius, radius, 0, largeArcFlag, 1, endPoint.x, endPoint.y
    ].join(" ");
  };

  return (
    <div className="bg-white rounded-3xl relative" style={{ height: '190px' }}>
      <div className="absolute top-8 left-8">
        <span className="block text-[64px] leading-none font-extralight text-[#222222]">
          {currentBoxCount}
        </span>
        <div className="mt-2">
          <span className="block text-sm text-[#222222] font-medium">
            {currentBox}
          </span>
          <span className="block text-sm text-gray-400 font-light">
            / TOTAL
          </span>
        </div>
      </div>

      <div className="absolute top-8 right-8">
        <svg width={size} height={size}>
          <defs>
            <linearGradient id="progressGradient" gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3C3B3B" />
              <stop offset="100%" stopColor="#2A9D8F" />
            </linearGradient>
          </defs>

          <path
            d={generateArc(startAngle, endAngle)}
            fill="none"
            stroke="#F3F4F4"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          <path
            d={generateArc(startAngle, progressAngle)}
            fill="none"
            stroke="url(#progressGradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className="transition-all duration-500 ease-in-out"
          />

          <foreignObject 
            x={center - 20} 
            y={center - 10} 
            width={40} 
            height={20}
          >
            <div className="text-[11px] text-gray-400 font-light text-center">
              /{totalAdsCount}
            </div>
          </foreignObject>
        </svg>
      </div>
    </div>
  );
};

export const AdsScreen = () => {
  const navigate = useNavigate();
  const [activeMenu, setActiveMenu] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedBoxes, setSelectedBoxes] = useState([]);
  const [boxFiles, setBoxFiles] = useState({});
  const [currentBox, setCurrentBox] = useState("HN 1506");
  const [selectedForBox, setSelectedForBox] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);

  useEffect(() => {
    const fetchLargeContainerFiles = async () => {
      try {
        const folderRef = ref(storage, `missingmatters_videos/`);
        const result = await listAll(folderRef);
  
        const files = [];
        await Promise.all(
          result.items.map(async (itemRef) => {
            try {
              const url = await getDownloadURL(itemRef);
              const fileType = itemRef.name.split('.').pop().toLowerCase();
              files.push({ 
                name: itemRef.name, 
                url,
                type: `${fileType.startsWith('mp') ? 'video' : 'image'}/${fileType}`,
                isVideo: fileType.startsWith('mp')
              });
            } catch (error) {
              // Skip files that don't exist
              if (error.code !== 'storage/object-not-found') {
                console.error("Error fetching file:", error);
              }
            }
          })
        );
  
        setUploadedFiles(files);
      } catch (error) {
        console.error("Error syncing files:", error);
      }
    };
  
    fetchLargeContainerFiles();
  
    // Set up periodic sync every 60 seconds
    const syncInterval = setInterval(fetchLargeContainerFiles, 60000);
    return () => clearInterval(syncInterval);
  }, []);

  useEffect(() => {
    const fetchBoxFiles = async () => {
      try {
        const boxFolderRef = ref(storage, `missingmatters_videos/${currentBox}/`);
        const result = await listAll(boxFolderRef);

        const files = [];
        await Promise.all(
          result.items.map(async (itemRef) => {
            const url = await getDownloadURL(itemRef);
            const fileType = itemRef.name.split('.').pop().toLowerCase();
            files.push({ 
              name: itemRef.name, 
              url,
              type: `${fileType.startsWith('mp') ? 'video' : 'image'}/${fileType}`,
              isVideo: fileType.startsWith('mp')
            });
          })
        );

        setBoxFiles(prev => ({
          ...prev,
          [currentBox]: files,
        }));
      } catch (error) {
        console.error("Error fetching box files:", error);
      }
    };

    fetchBoxFiles();
  }, [currentBox]);

  const toggleMenu = (index) => {
    setActiveMenu(prev => prev === index ? null : index);
  };

  const handleSelectFileForBox = (file) => {
    setSelectMode(true);
    
    setSelectedForBox(prev => {
      const alreadySelected = prev.some(selected => selected.name === file.name);
      return alreadySelected
        ? prev.filter(selected => selected.name !== file.name)
        : [...prev, file];
    });
    
    const index = uploadedFiles.findIndex(f => f.name === file.name);
    setSelectedBoxes(prev => {
      return prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index];
    });
    
    setBoxFiles(prev => {
      const currentFiles = prev[currentBox] || [];
      const fileExists = currentFiles.some(existingFile => existingFile.name === file.name);
      
      if (fileExists) {
        return {
          ...prev,
          [currentBox]: currentFiles.filter(existingFile => existingFile.name !== file.name)
        };
      } else {
        return {
          ...prev,
          [currentBox]: [...currentFiles, { ...file, isNew: true }]
        };
      }
    });
    
    setActiveMenu(null);
  };

  const toggleSelectBox = (index) => {
    if (!selectMode) return;
    
    const selectedFile = uploadedFiles[index];
    if (!selectedFile) return;

    setSelectedForBox(prev => {
      const alreadySelected = prev.some(file => file.name === selectedFile.name);
      return alreadySelected 
        ? prev.filter(file => file.name !== selectedFile.name)
        : [...prev, selectedFile];
    });

    setSelectedBoxes(prev => {
      return prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index];
    });

    setBoxFiles(prev => {
      const currentFiles = prev[currentBox] || [];
      const fileExists = currentFiles.some(file => file.name === selectedFile.name);
      
      if (fileExists) {
        return {
          ...prev,
          [currentBox]: currentFiles.filter(file => file.name !== selectedFile.name)
        };
      } else {
        return {
          ...prev,
          [currentBox]: [...currentFiles, { ...selectedFile, isNew: true }]
        };
      }
    });
  };

  const handleFileUpload = async (file) => {
    if (!file) {
      console.error("No file selected.");
      return;
    }
  
    const allowedTypes = ['image/jpeg', 'image/png', 'video/mp4', 'video/x-mpv'];
    if (!allowedTypes.includes(file.type)) {
      alert(`File type ${file.type} is not supported. Please upload JPG, PNG, MP4, or MPV files.`);
      return;
    }
  
    try {
      const maxSize = 100 * 1024 * 1024;
      if (file.size > maxSize) {
        alert("File size exceeds 100MB limit");
        return;
      }
  
      const fileName = file.name;
      const fileRef = ref(storage, `missingmatters_videos/${fileName}`);
  
      try {
        await getDownloadURL(fileRef);
        alert("A file with this name already exists. Please rename the file or choose a different one.");
        return;
      } catch (error) {
        if (error.code === 'storage/object-not-found') {
          await uploadBytes(fileRef, file);
          const url = await getDownloadURL(fileRef);
  
          setUploadedFiles(prev => [...prev, { 
            name: fileName,
            url,
            type: file.type,
            isVideo: file.type.startsWith('video/')
          }]);
        } else {
          throw error;
        }
      }
  
    } catch (error) {
      console.error("Error uploading file:", error);
      alert(`Upload failed: ${error.message}`);
    }
  };

  const handleDeleteFile = async (fileName) => {
    try {
      const fileRef = ref(storage, `missingmatters_videos/${fileName}`);
      await deleteObject(fileRef);
  
      // Immediately update UI state
      setUploadedFiles(prev => prev.filter(file => file.name !== fileName));
      setSelectedForBox(prev => prev.filter(file => file.name !== fileName));
      setSelectedBoxes(prev => prev.filter(index => uploadedFiles[index]?.name !== fileName));
      
      // Remove from all boxes
      setBoxFiles(prev => {
        const newBoxFiles = { ...prev };
        Object.keys(newBoxFiles).forEach(box => {
          newBoxFiles[box] = newBoxFiles[box].filter(file => file.name !== fileName);
        });
        return newBoxFiles;
      });
  
      // Refresh main container files
      const folderRef = ref(storage, 'missingmatters_videos/');
      const result = await listAll(folderRef);
      const updatedFiles = await Promise.all(
        result.items.map(async (itemRef) => {
          const url = await getDownloadURL(itemRef);
          const fileType = itemRef.name.split('.').pop().toLowerCase();
          return { 
            name: itemRef.name, 
            url,
            type: `${fileType.startsWith('mp') ? 'video' : 'image'}/${fileType}`,
            isVideo: fileType.startsWith('mp')
          };
        })
      );
      setUploadedFiles(updatedFiles);
  
    } catch (error) {
      console.error("Error deleting file:", error);
      alert("Failed to delete file. Please try again.");
    }
  };

  const handleUploadToSelectedBoxes = async () => {
    try {
      if (selectedForBox.length === 0) {
        alert("No files selected for upload.");
        return;
      }
  
      const boxFolderPath = `missingmatters_videos/${currentBox}/`;
      
      // First, check what's actually in the box
      const boxRef = ref(storage, boxFolderPath);
      const boxContents = await listAll(boxRef);
      const existingFileNames = boxContents.items.map(item => item.name);
  
      // Filter out already existing files
      const filesToUpload = selectedForBox.filter(file => !existingFileNames.includes(file.name));
  
      if (filesToUpload.length === 0) {
        alert("All selected files are already in the box.");
        return;
      }
  
      // Upload new files
      for (const file of filesToUpload) {
        const boxFileRef = ref(storage, `${boxFolderPath}${file.name}`);
        const response = await fetch(file.url);
        const blob = await response.blob();
        await uploadBytes(boxFileRef, blob);
      }
  
      // Refresh box contents after upload
      const updatedBoxContents = await listAll(boxRef);
      const updatedFiles = await Promise.all(
        updatedBoxContents.items.map(async (itemRef) => {
          const url = await getDownloadURL(itemRef);
          const fileType = itemRef.name.split('.').pop().toLowerCase();
          return { 
            name: itemRef.name, 
            url,
            type: `${fileType.startsWith('mp') ? 'video' : 'image'}/${fileType}`,
            isVideo: fileType.startsWith('mp')
          };
        })
      );
  
      setBoxFiles(prev => ({
        ...prev,
        [currentBox]: updatedFiles
      }));
  
      setSelectMode(false);
      setSelectedForBox([]);
      setSelectedBoxes([]);
      
      alert(`Successfully uploaded ${filesToUpload.length} file(s) to ${currentBox}`);
    } catch (error) {
      console.error("Upload error:", error);
      alert(`Upload failed: ${error.message}`);
    }
  };

  const handleRemoveFileFromBox = async (fileName) => {
    try {
      const fileRef = ref(storage, `missingmatters_videos/${currentBox}/${fileName}`);
      await deleteObject(fileRef);

      setBoxFiles(prev => ({
        ...prev,
        [currentBox]: prev[currentBox].filter(file => file.name !== fileName)
      }));

      setSelectedForBox(prev => prev.filter(file => file.name !== fileName));
      setSelectedBoxes(prev => prev.filter(index => uploadedFiles[index]?.name !== fileName));
    } catch (error) {
      console.error("Error removing file:", error);
      alert("Failed to remove file. Please try again.");
    }
  };

  const handleBoxNavigation = (direction) => {
    const boxes = ["HN 1506", "HN 1507", "HN 1508", "HN 1509"];
    const currentIndex = boxes.indexOf(currentBox);
    const newIndex = direction === "prev"
      ? (currentIndex - 1 + boxes.length) % boxes.length
      : (currentIndex + 1) % boxes.length;
    setCurrentBox(boxes[newIndex]);
  };

  const handleLogout = () => {
    navigate("/");
  };

  const renderFilePreview = (file) => {
    if (file.isVideo) {
      return (
        <video 
          className="w-full h-full object-cover rounded-[25px]"
          src={file.url}
          controls={false}
        >
          <source src={file.url} type={file.type} />
        </video>
      );
    }
    
    return (
      <div
        className="w-full h-full bg-cover bg-center rounded-[25px]"
        style={{ backgroundImage: `url(${file.url})` }}
      />
    );
  };

  return (
    <div className="flex h-screen bg-[#F3F4F4] text-white">
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col px-10 pt-6 pb-6">
        <div className="flex flex-row gap-6">
          {/* Left Container */}
          <div className="flex flex-col" style={{ width: "70%" }}>
            {/* Large Container */}
            <div className="bg-[#FFFFFF] border border-[#D9D9D9] rounded-[25px] overflow-y-auto mb-6" 
                style={{ height: "calc(100vh - 280px)" }}>
              <div className="p-6">
                <h1 className="font-['Montserrat'] font-light text-[32px] text-[#3C3B3B] mb-0.5">
                  AD DATABASE
                </h1>
                <p className="font-['Montserrat'] text-[16px] text-[#858080] mb-6">
                  /Upload the files here
                </p>
                <div className="grid grid-cols-5 gap-6">
                  {/* Upload Box */}
                  <div className="flex items-center justify-center bg-[#2A2929] border border-[#FFFFFF] rounded-[25px]" 
                      style={{ width: "150px", height: "150px" }}>
                    <input
                      type="file"
                      id="file-upload"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e.target.files[0])}
                      accept=".jpg,.png,.mp4,.mpv"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <img src={circledPlay} alt="Upload" className="w-12 h-12" />
                    </label>
                  </div>

                  {/* Files Grid */}
                  {uploadedFiles.map((file, index) => (
                    <div
                      key={index}
                      className={`relative flex items-center justify-center ${
                        selectMode && selectedBoxes.includes(index)
                          ? "bg-[#4a4a4a] border-2 border-[#858080]"
                          : "bg-[#2A2929] border border-[#3C3B3B]"
                      } rounded-[25px]`}
                      style={{ width: "150px", height: "150px" }}
                      onClick={() => toggleSelectBox(index)}
                    >
                      {renderFilePreview(file)}
                      <div className="absolute bottom-0 w-full bg-[#1E1E1E] text-[#E8DCD0] text-[12px] text-center font-montserrat truncate px-2 py-1"
                          style={{ borderTop: "1px solid #3C3B3B", borderBottomLeftRadius: "24px", borderBottomRightRadius: "24px" }}>
                        {file.name}
                      </div>

                      <img
                        src={menuVertical}
                        alt="Menu"
                        className="absolute top-3 right-3 w-5 h-5 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMenu(index);
                        }}
                      />

                      {activeMenu === index && (
                        <div className="absolute top-10 right-5 bg-[#1E1E1E] border border-[#3C3B3B] rounded-[10px] p-3 z-20" style={{ width: "120px" }}>
                          <div
                            className="text-[#858080] hover:text-red-500 cursor-pointer"
                            onClick={() => handleDeleteFile(file.name)}
                          >
                            Delete
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Metrics Boxes */}
            <div className="flex gap-6">
              <div className="w-1/2">
                <MetricsBox title="AD INTERACTIONS" />
              </div>
              <div className="w-1/2">
                <CircularProgress
                  currentBox={currentBox} 
                  storage={storage} 
                />
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div className="bg-[#FFFFFF] border border-[#D9D9D9] rounded-[25px] flex flex-col" 
              style={{ height: "calc(100vh - 50px)", width: "30%", padding: "20px" }}>
            {/* Box Header */}
            <div className="flex justify-between items-center mb-2">
              <button
                className="text-[#858080] text-[20px] font-medium"
                onClick={() => handleBoxNavigation("prev")}
              >
                &lt;
              </button>
              <span className="text-[#858080] font-montserrat font-medium text-[22px]">
                {currentBox}
              </span>
              <button
                className="text-[#858080] text-[20px] font-medium"
                onClick={() => handleBoxNavigation("next")}
              >
                &gt;
              </button>
            </div>

            <p className="font-['Montserrat'] text-[16px] text-[#858080] text-center mb-4">
              Upload files to box by clicking icon below
            </p>

            {/* Selection Circle */}
            <div className="flex justify-center items-center mb-6">
              <div className="flex items-center justify-center bg-[#2A2929] border border-[#3C3B3B] rounded-[25px]"
                  style={{ width: "180px", height: "180px", position: "relative" }}>
                <img
                  src={circledPlay}
                  alt="Play"
                  className="absolute w-12 h-12 cursor-pointer"
                  style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
                  onClick={() => {
                    setSelectMode(true);
                    alert("You can now select files from the database.");
                  }}
                />
              </div>
            </div>

            {/* File List */}
            <div className="flex flex-col gap-2 overflow-y-auto pr-2 flex-grow">
              {(boxFiles[currentBox] || []).map((file, index) => (
                <div key={index} className="flex items-center justify-between text-[#858080] text-[14px]">
                  <div className="flex items-center gap-6">
                    <span className="bg-[#FFFFFF] border border-[#D9D9D9] rounded-full flex items-center justify-center w-9 h-9 text-base">
                      {index + 1}
                    </span>
                    <span className="truncate">{file.name}</span>
                  </div>
                  <button onClick={() => handleRemoveFileFromBox(file.name)}>
                    <img src={deleteIcon} alt="Delete" className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Upload Button */}
            <button
              className="mt-4 flex items-center justify-center w-3/4 py-3 bg-[#2A9D8F] border border-[#2A9D8F] text-[#E8DCD0] rounded-full hover:bg-[#2A2929] active:bg-[#1E1E1E] transform active:scale-95 transition-all duration-200 mx-auto"
              style={{ fontSize: "14px", height: "45px" }}
              onClick={handleUploadToSelectedBoxes}
            >
              Upload to Box
              <img src={uploadArrow} alt="Arrow" className="ml-4 w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdsScreen; 