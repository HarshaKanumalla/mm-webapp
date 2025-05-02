import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth, signOut } from 'firebase/auth';
import { ref, listAll, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';

// Import icons and images
import mmlogo from "./mmlogo.png";
import dashboard from "./dashboard.png";
import dataCenter from "./monitoring.png";
import futures from "./ads.png";
import logout from "./logout.png";
import searchIcon from "./search.png";
import uploadIcon from "./upload-icon.png";
import smartboxPreview from "./smartbox-preview.png";

// Navigation Button Component
const NavButton = ({ icon, label, active, onClick }) => (
  <div 
    onClick={onClick}
    className={`flex flex-col items-center justify-center cursor-pointer pl-2
               ${active ? 'text-[#2A9D8F]' : 'text-gray-500'} hover:text-[#2A9D8F] transition-colors duration-200`}
  >
    <img src={icon} alt="" className="w-8 h-8 mb-1" />
    <span className="text-[9px] font-normal">{label}</span>
  </div>
);

// Statistic Card Component
const StatCard = ({ title, value, color = 'bg-[#2A9D8F]' }) => (
  <div className={`${color} rounded-lg p-4 text-white w-64 shadow-sm`}>
    <p className="text-xs font-light mb-1">{title}</p>
    <p className="text-3xl font-light">{value}</p>
  </div>
);

// Header Dropdown Component with Checkboxes
const HeaderDropdown = ({ label, options, selected, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <div 
        onClick={() => setIsOpen(!isOpen)} 
        className="flex items-center gap-2 bg-white rounded-full px-3 py-1.5 border border-gray-200 cursor-pointer"
      >
        <span className="text-gray-600 text-sm">{label}</span>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      
      {isOpen && (
        <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-md shadow-lg w-48">
          <div className="py-1">
            {options.map((option, index) => (
              <div key={index} className="px-4 py-2 flex items-center">
                <input
                  type="checkbox"
                  id={`${label}-${index}`}
                  checked={selected.includes(option)}
                  onChange={() => {
                    if (selected.includes(option)) {
                      onChange(selected.filter(item => item !== option));
                    } else {
                      onChange([...selected, option]);
                    }
                  }}
                  className="mr-2"
                />
                <label htmlFor={`${label}-${index}`} className="text-sm text-gray-700">
                  {option}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Search Component
const SearchBar = () => (
  <div className="relative">
    <input 
      type="text" 
      placeholder="Search" 
      className="w-full bg-white rounded-full px-4 py-1.5 pl-10 border border-gray-200 focus:outline-none focus:ring-1 focus:ring-[#2A9D8F]"
    />
    <img 
      src={searchIcon} 
      alt="Search" 
      className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" 
    />
  </div>
);

// Ad Item Component for the right panel list
const AdItem = ({ number, name, onDelete }) => {
  // Format the current date as a string (e.g., "May 2, 2025")
  const formattedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center">
        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center mr-3">
          <span className="text-gray-500 text-sm">{number}</span>
        </div>
        <div>
          <p className="text-sm text-gray-700">{name}</p>
          <p className="text-xs text-gray-400">Uploaded: {formattedDate}</p>
        </div>
      </div>
      <button className="text-gray-400 hover:text-gray-600" onClick={onDelete}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
};

// File Preview Thumbnail Component
const FilePreviewThumbnail = ({ file }) => {
  if (file.isVideo) {
    return (
      <div className="w-16 h-16 rounded overflow-hidden bg-gray-100 border border-gray-200">
        <video className="w-full h-full object-cover">
          <source src={file.url} type={file.type} />
        </video>
      </div>
    );
  }
  
  return (
    <div className="w-16 h-16 rounded overflow-hidden bg-gray-100 border border-gray-200">
      <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
    </div>
  );
};

// Notification Panel - Completely Reimplemented
const NotificationPanel = ({ notifications, clearNotification, onClose }) => {
  if (notifications.length === 0) {
    return (
      <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-md shadow-lg z-50 p-4 text-center">
        <div className="bg-[#2A9D8F] text-white px-4 py-2 flex justify-between items-center -mt-4 -mx-4 mb-4">
          <h3 className="text-sm font-medium">Notifications</h3>
          <button onClick={onClose} className="text-white hover:text-gray-200">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-gray-500 text-sm">No notifications</p>
      </div>
    );
  }
  
  // Group notifications by date
  const groupByDate = (notifications) => {
    const groups = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    notifications.forEach(notification => {
      const notifDate = new Date(notification.timestamp);
      notifDate.setHours(0, 0, 0, 0);
      
      let dateString;
      if (notifDate.getTime() === today.getTime()) {
        dateString = "Today";
      } else if (notifDate.getTime() === yesterday.getTime()) {
        dateString = "Yesterday";
      } else {
        dateString = notifDate.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        });
      }
      
      if (!groups[dateString]) {
        groups[dateString] = [];
      }
      
      groups[dateString].push(notification);
    });
    
    return groups;
  };
  
  const groupedNotifications = groupByDate(notifications);
  
  return (
    <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-[500px] overflow-y-auto">
      <div className="bg-[#2A9D8F] text-white px-4 py-2 flex justify-between items-center sticky top-0 z-10">
        <h3 className="text-sm font-medium">Notifications</h3>
        <button onClick={onClose} className="text-white hover:text-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {Object.entries(groupedNotifications).map(([date, notifications]) => (
        <div key={date}>
          <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 sticky top-10 z-5">
            <h4 className="text-xs font-semibold text-gray-600">{date}</h4>
          </div>
          
          {notifications.map(notification => (
            <div key={notification.id} className="border-b border-gray-100 px-4 py-2 relative">
              <div className="absolute top-2 right-2 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-sm text-gray-700 pr-6">{notification.message}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(notification.timestamp).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export const AdsScreen = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  
  // State management
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [currentBox, setCurrentBox] = useState("HN 1506");
  const [boxFiles, setBoxFiles] = useState({});
  const [activeMenu, setActiveMenu] = useState(null);
  const [fileBoxAssignments, setFileBoxAssignments] = useState({});
  const [pendingChanges, setPendingChanges] = useState(false);
  const [pendingUploadTasks, setPendingUploadTasks] = useState([]);
  const [pendingRemovalTasks, setPendingRemovalTasks] = useState([]);
  
  // Storage for notifications in localStorage
  const [notifications, setNotifications] = useState(() => {
    const savedNotifications = localStorage.getItem('adsNotifications');
    return savedNotifications ? JSON.parse(savedNotifications) : [];
  });
  
  const [showNotifications, setShowNotifications] = useState(false);
  
  // Dropdown states
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [selectedBoxes, setSelectedBoxes] = useState([]);
  
  // Available options
  const availableBoxes = ["HN 1506", "HN 1507", "HN 1508", "HN 1509"];
  const availableLocations = ["Hyderabad", "Bangalore"];

  // Save notifications to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('adsNotifications', JSON.stringify(notifications));
  }, [notifications]);

  // Add a notification with specific ad info
  const addNotification = (message) => {
    const newNotification = {
      id: Date.now(),
      message,
      timestamp: new Date().toISOString(),
    };
    
    // Add to state and save to localStorage
    setNotifications(prev => {
      const updated = [newNotification, ...prev];
      localStorage.setItem('adsNotifications', JSON.stringify(updated));
      return updated;
    });
  };

  // Clear a notification
  const clearNotification = (id) => {
    setNotifications(prev => {
      const updated = prev.filter(notification => notification.id !== id);
      localStorage.setItem('adsNotifications', JSON.stringify(updated));
      return updated;
    });
  };

  // Close notifications panel
  const closeNotifications = () => {
    setShowNotifications(false);
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) navigate('/');
    });
    
    // Fetch files from main container
    const fetchAllFiles = async () => {
      try {
        const folderRef = ref(storage, 'missingmatters_videos/');
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
              console.error("Error fetching file:", error);
            }
          })
        );
  
        setUploadedFiles(files);
        
        // Initialize file box assignments
        const assignments = {};
        for (const file of files) {
          assignments[file.name] = [];
        }
        setFileBoxAssignments(assignments);
      } catch (error) {
        console.error("Error fetching files:", error);
      }
    };
    
    fetchAllFiles();
    return () => unsubscribe();
  }, [auth, navigate]);

  useEffect(() => {
    // Fetch files for the current box
    const fetchBoxFiles = async () => {
      try {
        const boxFolderRef = ref(storage, `missingmatters_videos/${currentBox}/`);
        const result = await listAll(boxFolderRef);

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
              console.error("Error fetching box file:", error);
            }
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
          
          // Add notification with specific ad name
          addNotification(`New ad "${fileName}" has been uploaded`);
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
  
      // Update UI state
      setUploadedFiles(prev => prev.filter(file => file.name !== fileName));
      
      // Remove from box files
      setBoxFiles(prev => {
        const newBoxFiles = { ...prev };
        Object.keys(newBoxFiles).forEach(box => {
          newBoxFiles[box] = newBoxFiles[box].filter(file => file.name !== fileName);
        });
        return newBoxFiles;
      });
      
      // Remove from file box assignments
      setFileBoxAssignments(prev => {
        const newAssignments = { ...prev };
        delete newAssignments[fileName];
        return newAssignments;
      });
      
      // Add notification
      addNotification(`Ad "${fileName}" has been deleted`);
  
    } catch (error) {
      console.error("Error deleting file:", error);
      alert("Failed to delete file. Please try again.");
    }
  };

  const handleRemoveFileFromBox = async (fileName) => {
    try {
      const fileRef = ref(storage, `missingmatters_videos/${currentBox}/${fileName}`);
      await deleteObject(fileRef);

      // Update box files
      setBoxFiles(prev => ({
        ...prev,
        [currentBox]: prev[currentBox].filter(file => file.name !== fileName)
      }));

      // Update file box assignments
      setFileBoxAssignments(prev => {
        const newAssignments = { ...prev };
        if (newAssignments[fileName]) {
          newAssignments[fileName] = newAssignments[fileName].filter(box => box !== currentBox);
        }
        return newAssignments;
      });
      
      // Add notification
      addNotification(`Ad "${fileName}" has been removed from box ${currentBox}`);
    } catch (error) {
      console.error("Error removing file:", error);
      alert("Failed to remove file. Please try again.");
    }
  };

  const updateFileBoxes = async (fileName, boxes) => {
    try {
      // Get current assignments
      const currentBoxes = Object.keys(boxFiles).filter(box => 
        boxFiles[box]?.some(file => file.name === fileName)
      );
      
      // Boxes to add to
      const boxesToAdd = boxes.filter(box => !currentBoxes.includes(box));
      
      // Boxes to remove from
      const boxesToRemove = currentBoxes.filter(box => !boxes.includes(box));
      
      // Store pending changes
      if (boxesToAdd.length > 0) {
        setPendingUploadTasks(prev => [
          ...prev,
          ...boxesToAdd.map(box => ({ fileName, box }))
        ]);
        
        // Add notification
        if (boxesToAdd.length === 1) {
          addNotification(`Ad "${fileName}" will be uploaded to box ${boxesToAdd[0]}`);
        } else {
          addNotification(`Ad "${fileName}" will be uploaded to ${boxesToAdd.length} boxes`);
        }
      }
      
      if (boxesToRemove.length > 0) {
        setPendingRemovalTasks(prev => [
          ...prev,
          ...boxesToRemove.map(box => ({ fileName, box }))
        ]);
      }
      
      // Update UI state without sending to Firebase
      setFileBoxAssignments(prev => ({
        ...prev,
        [fileName]: boxes
      }));
      
      // Mark that we have pending changes
      setPendingChanges(true);
      
      // Show notification only when adding
      if (boxesToAdd.length > 0) {
        alert(`Ad will be uploaded to box ${boxesToAdd.join(', ')}. Please click "Update" to reflect the changes.`);
      }
    } catch (error) {
      console.error("Error updating box assignments:", error);
      alert(`Failed to update box assignments: ${error.message}`);
    }
  };

  // Handle the "Update" button click
  const handleUpdateChanges = async () => {
    if (!pendingChanges) {
      alert("No changes to update");
      return;
    }
    
    try {
      // Process pending uploads
      for (const task of pendingUploadTasks) {
        const { fileName, box } = task;
        const file = uploadedFiles.find(f => f.name === fileName);
        if (!file) continue;
        
        const boxFolderPath = `missingmatters_videos/${box}/`;
        const boxFileRef = ref(storage, `${boxFolderPath}${fileName}`);
        const response = await fetch(file.url);
        const blob = await response.blob();
        await uploadBytes(boxFileRef, blob);
        
        // Add notification
        addNotification(`Ad "${fileName}" has been uploaded to box ${box}`);
      }
      
      // Process pending removals
      for (const task of pendingRemovalTasks) {
        const { fileName, box } = task;
        const fileRef = ref(storage, `missingmatters_videos/${box}/${fileName}`);
        await deleteObject(fileRef);
        
        // Add notification
        addNotification(`Ad "${fileName}" has been removed from box ${box}`);
      }
      
      // Refresh all box contents
      const affectedBoxes = new Set([
        ...pendingUploadTasks.map(task => task.box), 
        ...pendingRemovalTasks.map(task => task.box)
      ]);
      
      const updatedBoxFiles = { ...boxFiles };
      
      for (const box of affectedBoxes) {
        const boxRef = ref(storage, `missingmatters_videos/${box}/`);
        const boxContents = await listAll(boxRef);
        
        const files = await Promise.all(
          boxContents.items.map(async (itemRef) => {
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
        
        updatedBoxFiles[box] = files;
      }
      
      setBoxFiles(updatedBoxFiles);
      
      // Clear pending tasks
      setPendingUploadTasks([]);
      setPendingRemovalTasks([]);
      setPendingChanges(false);
      
      alert("Changes updated successfully!");
    } catch (error) {
      console.error("Error updating changes:", error);
      alert(`Failed to update changes: ${error.message}`);
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
    signOut(auth).then(() => navigate("/")).catch(console.error);
  };

  // Get what boxes a file is in
  const getFileBoxes = (fileName) => {
    const assignedBoxes = [];
    Object.keys(boxFiles).forEach(box => {
      if (boxFiles[box]?.some(file => file.name === fileName)) {
        assignedBoxes.push(box);
      }
    });
    return assignedBoxes;
  };
  
  // Initialize box assignments from box files
  useEffect(() => {
    const newFileBoxAssignments = { ...fileBoxAssignments };
    
    uploadedFiles.forEach(file => {
      if (!newFileBoxAssignments[file.name]) {
        newFileBoxAssignments[file.name] = [];
      }
      
      Object.keys(boxFiles).forEach(box => {
        if (boxFiles[box]?.some(boxFile => boxFile.name === file.name)) {
          if (!newFileBoxAssignments[file.name].includes(box)) {
            newFileBoxAssignments[file.name].push(box);
          }
        }
      });
    });
    
    setFileBoxAssignments(newFileBoxAssignments);
  }, [boxFiles, uploadedFiles]);

  return (
    <div className="h-screen overflow-hidden flex">
      {/* Side Navigation */}
      <div className="w-20 flex flex-col justify-center items-center py-6 space-y-6 bg-white">
        <NavButton 
          icon={dashboard} 
          label="Dashboard" 
          active={false} 
          onClick={() => navigate("/dashboard")} 
        />
        <NavButton 
          icon={dataCenter} 
          label="Monitoring" 
          active={false} 
          onClick={() => navigate("/monitoring")} 
        />
        <NavButton 
          icon={futures} 
          label="Ads Console" 
          active={true} 
          onClick={() => navigate("/ads")} 
        />
        <NavButton 
          icon={logout} 
          label="Logout" 
          active={false} 
          onClick={handleLogout} 
        />
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Header Bar - Completely Rewritten */}
        <div className="px-6 py-3 flex justify-between items-center bg-white border-b border-gray-100">
          {/* Logo - Fixed size to match sidebar icons exactly */}
          <div style={{ display: 'flex', alignItems: 'center', height: '40px' }}>
            <div style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img 
                src={mmlogo} 
                alt="Missing Matters" 
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '100%',
                  objectFit: 'contain'
                }} 
              />
            </div>
            <h1 className="text-lg font-medium text-[#2A9D8F] ml-2">Missing Matters</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <HeaderDropdown 
              label="Location" 
              options={availableLocations}
              selected={selectedLocations}
              onChange={setSelectedLocations}
            />
            <HeaderDropdown 
              label="Smart Box" 
              options={availableBoxes}
              selected={selectedBoxes}
              onChange={setSelectedBoxes}
            />
            <div className="w-56">
              <SearchBar />
            </div>
            <div className="relative">
              <div 
                className="w-8 h-8 flex items-center justify-center cursor-pointer relative"
                onClick={() => setShowNotifications(!showNotifications)}
              >
                {/* Notification icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {notifications.length > 0 && (
                  <span className="absolute top-0 right-0 inline-flex items-center justify-center w-4 h-4 text-xs font-bold text-white bg-red-500 rounded-full">
                    {notifications.length}
                  </span>
                )}
              </div>
              {showNotifications && (
                <NotificationPanel 
                  notifications={notifications} 
                  clearNotification={clearNotification}
                  onClose={closeNotifications} 
                />
              )}
            </div>
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#2A9D8F] bg-[#2A9D8F] flex items-center justify-center text-white font-medium">
              MM
            </div>
          </div>
        </div>
        
        {/* Main Content Area */}
        <div className="flex-1 flex overflow-auto">
          {/* Left Panel - Ads Information */}
          <div className="w-[65%] p-6">
            {/* Stats Cards */}
            <div className="flex gap-3 mb-6">
              <StatCard title="Total Ads" value={uploadedFiles.length.toLocaleString()} />
              <StatCard title="Uploaded this week" value={Math.min(uploadedFiles.length, 24)} />
              <StatCard title="Uploaded today" value={0 < 10 ? "00" : 0} />
            </div>
            
            {/* Upload Section */}
            <div className="mb-6">
              <h2 className="text-lg font-normal text-gray-700 mb-3">Upload a new ad</h2>
              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-start">
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e.target.files[0])}
                    accept=".jpg,.png,.mp4,.mpv"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <img src={uploadIcon} alt="Upload" className="w-14 h-14 mr-3" />
                  </label>
                  <div>
                    <h3 className="text-gray-700 font-medium mb-1">Upload your ad</h3>
                    <p className="text-gray-400 text-xs">This ad will be added to the database and can be used to upload to multiple boxes.</p>
                    <p className="text-gray-400 text-xs mt-1">Click the upload icon to add a new ad from your local system</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Files Table */}
            <div style={{ marginBottom: '80px' }}>
              <h2 className="text-lg font-normal text-gray-700 mb-3">Manage your ads</h2>
              <div className="border border-gray-200 rounded-[25px] overflow-hidden" style={{ height: '290px' }}>
                <div className="overflow-y-auto" style={{ height: '290px' }}>
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 bg-[#2A9D8F] text-white z-10">
                      <tr>
                        <th className="py-3 px-4 text-left font-medium border-r border-r-white whitespace-nowrap" style={{ width: '80px' }}>S. No</th>
                        <th className="py-3 px-4 text-left font-medium border-r border-r-white" style={{ width: '35%' }}>Ads & Details</th>
                        <th className="py-3 px-4 text-left font-medium border-r border-r-white" style={{ width: '35%' }}>Assigned Boxes</th>
                        <th className="py-3 px-4 text-left font-medium" style={{ width: '15%' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadedFiles.map((file, index) => {
                        const currentAssignedBoxes = fileBoxAssignments[file.name] || getFileBoxes(file.name);
                        return (
                          <tr key={index} className="border-b">
                            <td className="py-3 px-4 text-gray-500 border-r">
                              {index + 1}
                            </td>
                            <td className="py-3 px-4 text-gray-700 border-r">
                              <div className="flex items-center">
                                <FilePreviewThumbnail file={file} />
                                <div className="ml-3">
                                  <p className="font-medium">{file.name}</p>
                                  <p className="text-xs text-gray-400">Uploaded: {new Date().toLocaleDateString()}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-gray-500 border-r">
                              <div className="relative inline-block text-left">
                                <button 
                                  className="inline-flex justify-between items-center w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none"
                                  onClick={() => setActiveMenu(index === activeMenu ? null : index)}
                                >
                                  <span>Assign to boxes</span>
                                  <svg className="ml-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                </button>
                                {activeMenu === index && (
                                  <div className="z-50 origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5">
                                    <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                                      {availableBoxes.map((box, i) => (
                                        <div key={i} className="px-4 py-2 text-sm flex items-center">
                                          <input
                                            type="checkbox"
                                            id={`box-${index}-${i}`}
                                            checked={currentAssignedBoxes.includes(box)}
                                            onChange={() => {
                                              const newBoxes = currentAssignedBoxes.includes(box)
                                                ? currentAssignedBoxes.filter(b => b !== box)
                                                : [...currentAssignedBoxes, box];
                                              updateFileBoxes(file.name, newBoxes);
                                            }}
                                            className="mr-2"
                                          />
                                          <label htmlFor={`box-${index}-${i}`}>{box}</label>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              {/* Display assigned boxes */}
                              {currentAssignedBoxes.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {currentAssignedBoxes.map((box, i) => (
                                    <span key={i} className="bg-gray-100 px-2 py-1 rounded text-xs">
                                      {box}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <button 
                                onClick={() => handleDeleteFile(file.name)} 
                                className="bg-red-100 text-red-600 px-4 py-2 rounded text-sm"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {uploadedFiles.length === 0 && (
                        <tr>
                          <td colSpan="4" className="py-6 text-center text-gray-500">
                            No ads uploaded yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          
          {/* Right Panel - Box Content */}
          <div className="w-[35%] bg-white p-6 flex flex-col">
            {/* Box Header with closer navigation icons */}
            <div className="flex items-center justify-center mb-4">
              <button
                className="text-gray-500 hover:text-gray-700 mx-2"
                onClick={() => handleBoxNavigation("prev")}
              >
                &lt;
              </button>
              <h2 className="text-xl font-normal text-gray-700">
                {currentBox}
              </h2>
              <button
                className="text-gray-500 hover:text-gray-700 mx-2"
                onClick={() => handleBoxNavigation("next")}
              >
                &gt;
              </button>
            </div>
            
            {/* Box Content - Show smartbox preview image */}
            <div className="mb-6 bg-white rounded-lg p-3 shadow-sm h-72">
              <div className="h-full flex justify-center items-center">
                <img 
                  src={smartboxPreview} 
                  alt="Smart Box Preview" 
                  className="max-h-full max-w-full object-contain" 
                />
              </div>
            </div>
            
            {/* Box Files List */}
            <div className="flex-1 overflow-y-auto">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Box Content</h3>
              {boxFiles[currentBox]?.map((file, index) => (
                <AdItem 
                  key={index}
                  number={index + 1}
                  name={file.name}
                  onDelete={() => handleRemoveFileFromBox(file.name)}
                />
              ))}
              
              {boxFiles[currentBox]?.length === 0 && (
                <p className="text-sm text-gray-500">No files in this box</p>
              )}
            </div>
            
            {/* Update Button */}
            <div className="flex justify-center mt-4">
              <button 
                className="bg-[#2A9D8F] text-white py-1.5 px-6 rounded-md flex items-center text-sm"
                onClick={handleUpdateChanges}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Update
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdsScreen;