import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ref, listAll, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../firebase";
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
import { ref as databaseRef, set, get, child, onValue } from "firebase/database";
import { database } from '../firebase';


export const AdsScreen = () => {
  const navigate = useNavigate();
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [activeMenu, setActiveMenu] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedBoxes, setSelectedBoxes] = useState([]);
  const [boxFiles, setBoxFiles] = useState({});
  const [currentBox, setCurrentBox] = useState("HN 1506");
  const [selectedForBox, setSelectedForBox] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [selectedFileType, setSelectedFileType] = useState(null);
  const [selectedPlaylistName, setSelectedPlaylistName] = useState(null);
  const [filteredPlaylistFiles, setFilteredPlaylistFiles] = useState([]);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [playlists, setPlaylists] = useState({
    "Playlist-I": { id: "Playlist-I", name: "Playlist-I", files: [] },
    "Playlist-II": { id: "Playlist-II", name: "Playlist-II", files: [] },
    "Playlist-III": { id: "Playlist-III", name: "Playlist-III", files: [] }
  });
  
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [selectedFileForPlaylist, setSelectedFileForPlaylist] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [selectedBoxNumbers, setSelectedBoxNumbers] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [currentPlaylistFiles, setCurrentPlaylistFiles] = useState([]);
  const [databaseInitialized, setDatabaseInitialized] = useState(false);
  const [playlistUploadMode, setPlaylistUploadMode] = useState(false);




  // Constants
  const boxes = ["All Boxes", "HN 1506", "HN 1507", "HN 1508", "HN 1509"];
  const fileTypes = [".jpg", ".png", ".mpv", ".mp4"];

// Update the getFilteredFiles function
const getFilteredFiles = () => {
  let files = selectedPlaylistName ? filteredPlaylistFiles : uploadedFiles;
  
  if (selectedFileType) {
    files = files.filter(file => {
      const extension = file.name.split('.').pop().toLowerCase();
      return `.${extension}` === selectedFileType;
    });
  }
  
  return files;
};

// Update the useEffect for playlists initialization
useEffect(() => {
  const initializePlaylists = async () => {
    try {
      const playlistsRef = databaseRef(database, 'playlists');
      
      // Check if playlists exist in database
      const snapshot = await get(playlistsRef);
      
      if (!snapshot.exists()) {
        // Initialize with default playlists if none exist
        const defaultPlaylists = {
          "Playlist-I": { id: "Playlist-I", name: "Playlist-I", files: [] },
          "Playlist-II": { id: "Playlist-II", name: "Playlist-II", files: [] },
          "Playlist-III": { id: "Playlist-III", name: "Playlist-III", files: [] }
        };
        await set(playlistsRef, defaultPlaylists);
        setPlaylists(defaultPlaylists);
      } else {
        setPlaylists(snapshot.val());
      }

      // Set up real-time listener
      onValue(playlistsRef, (snapshot) => {
        if (snapshot.exists()) {
          setPlaylists(snapshot.val());
        }
      });
    } catch (error) {
      console.error('Error initializing playlists:', error);
    }
  };

  initializePlaylists();
}, [database]);



  useEffect(() => {
    const fetchLargeContainerFiles = async () => {
      try {
        const folderRef = ref(storage, `missingmatters_videos/`);
        const result = await listAll(folderRef);

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

        setUploadedFiles(files);
      } catch (error) {
        console.error("Error fetching main files:", error);
      }
    };

    fetchLargeContainerFiles();
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

  const toggleDropdown = (menu) => {
    setActiveDropdown(prev => prev === menu ? null : menu);
  };

  const toggleMenu = (index) => {
    setActiveMenu(prev => prev === index ? null : index);
  };

// Update the box selection handler for automatic uploads
const handleBoxSelection = async (boxName) => {
  // If we're in selection mode from toggle-menu, handle automatic upload
  if (playlistUploadMode && selectedForBox.length > 0) {
    try {
      let boxesToUpload = [];
      if (boxName === "All Boxes") {
        boxesToUpload = boxes.filter(box => box !== "All Boxes");
      } else {
        boxesToUpload = [boxName];
      }

      let uploadedCount = 0;
      const totalUploads = boxesToUpload.length * selectedForBox.length;

      for (const box of boxesToUpload) {
        for (const file of selectedForBox) {
          try {
            const boxFolderPath = `missingmatters_videos/${box}/`;
            const boxFileRef = ref(storage, `${boxFolderPath}${file.name}`);
            
            const response = await fetch(file.url, { mode: 'no-cors' });
            const blob = await response.blob();
            await uploadBytes(boxFileRef, blob);
            
            setBoxFiles(prev => ({
              ...prev,
              [box]: [...(prev[box] || []), file]
            }));

            uploadedCount++;
          } catch (error) {
            console.error(`Error uploading ${file.name} to ${box}:`, error);
          }
        }
      }

      // Update selected boxes visual state
      setSelectedBoxNumbers(prev => {
        if (boxName === "All Boxes") {
          return boxes.filter(box => box !== "All Boxes");
        }
        return [...prev, boxName];
      });

      const filesText = selectedForBox.length === 1 ? 'file' : 'files';
      const boxesText = boxesToUpload.length === 1 ? 'box' : 'boxes';
      alert(`Successfully uploaded ${uploadedCount} out of ${totalUploads} ${filesText} to ${boxesToUpload.length} ${boxesText}`);

    } catch (error) {
      console.error("Upload error:", error);
      alert(`Upload failed: ${error.message}`);
    }
  } else if (selectedPlaylistName) {
    // Handle playlist upload as before
    try {
      const selectedPlaylist = Object.values(playlists).find(p => p.name === selectedPlaylistName);
      if (!selectedPlaylist?.files?.length) {
        alert('No files in the selected playlist');
        return;
      }

      let boxesToUpload = boxName === "All Boxes" 
        ? boxes.filter(box => box !== "All Boxes")
        : [boxName];

      const totalUploads = boxesToUpload.length * selectedPlaylist.files.length;
      let uploadedCount = 0;

      for (const box of boxesToUpload) {
        for (const file of selectedPlaylist.files) {
          try {
            const boxFolderPath = `missingmatters_videos/${box}/`;
            const boxFileRef = ref(storage, `${boxFolderPath}${file.name}`);
            
            const response = await fetch(file.url, { mode: 'no-cors' });
            const blob = await response.blob();
            await uploadBytes(boxFileRef, blob);
            
            setBoxFiles(prev => ({
              ...prev,
              [box]: [...(prev[box] || []), file]
            }));

            uploadedCount++;
          } catch (error) {
            console.error(`Error uploading ${file.name} to ${box}:`, error);
          }
        }
      }

      // Update selected boxes visual state
      setSelectedBoxNumbers(prev => {
        if (boxName === "All Boxes") {
          return boxes.filter(box => box !== "All Boxes");
        }
        return [...prev, boxName];
      });

      const filesText = selectedPlaylist.files.length === 1 ? 'file' : 'files';
      const boxesText = boxesToUpload.length === 1 ? 'box' : 'boxes';
      alert(`Successfully uploaded ${uploadedCount} out of ${totalUploads} ${filesText} to ${boxesToUpload.length} ${boxesText}`);

    } catch (error) {
      console.error("Upload error:", error);
      alert(`Upload failed: ${error.message}`);
    }
  } else {
    // Normal box selection without upload
    setSelectedBoxNumbers(prev => {
      const isSelected = prev.includes(boxName);
      if (boxName === "All Boxes") {
        return isSelected ? [] : ["All Boxes"];
      }
      return isSelected 
        ? prev.filter(box => box !== boxName)
        : [...prev.filter(box => box !== "All Boxes"), boxName];
    });
  }
};

  const handleFileTypeSelection = (fileType) => {
    setSelectedFileType(fileType === selectedFileType ? null : fileType);
  };

// Modify the handleSelectFileForBox function to enable box selection mode
const handleSelectFileForBox = (file) => {
  setSelectMode(true);
  setPlaylistUploadMode(true); // Enable upload mode
  
  setSelectedForBox(prev => {
    const alreadySelected = prev.some(selected => selected.name === file.name);
    return alreadySelected
      ? prev.filter(selected => selected.name !== file.name)
      : [...prev, file];
  });
  
  // Update the visual selection in the grid
  const index = uploadedFiles.findIndex(f => f.name === file.name);
  setSelectedBoxes(prev => {
    return prev.includes(index)
      ? prev.filter(i => i !== index)
      : [...prev, index];
  });

     
    // Immediately update the boxFiles state to show the file in the rectangular container
    setBoxFiles(prev => {
      const currentFiles = prev[currentBox] || [];
      const fileExists = currentFiles.some(existingFile => existingFile.name === file.name);
      
      if (fileExists) {
        // If file exists, remove it (toggle behavior)
        return {
          ...prev,
          [currentBox]: currentFiles.filter(existingFile => existingFile.name !== file.name)
        };
      } else {
        // If file doesn't exist, add it with isNew flag
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

  // Immediately update the boxFiles state
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

// Function to handle creating a new playlist
const handleCreatePlaylist = async () => {
  try {
    if (!newPlaylistName.trim()) {
      alert('Please enter a playlist name');
      return;
    }

    // Generate a unique ID for the new playlist
    const playlistId = `Playlist-${Object.keys(playlists).length + 1}`;
    const newPlaylist = {
      id: playlistId,
      name: newPlaylistName,
      files: selectedFileForPlaylist ? [selectedFileForPlaylist] : []
    };

    // Update Firebase
    const playlistRef = databaseRef(database, `playlists/${playlistId}`);
    await set(playlistRef, newPlaylist);

    // Update local state
    setPlaylists(prev => ({
      ...prev,
      [playlistId]: newPlaylist
    }));

    // Reset states
    setNewPlaylistName("");
    setShowCreatePlaylist(false);
    setShowPlaylistModal(false);
    setSelectedFileForPlaylist(null);

    alert('Playlist created successfully');
  } catch (error) {
    console.error('Error creating playlist:', error);
    alert('Failed to create playlist');
  }
};

// Update the handleAddToPlaylist function
const handleAddToPlaylist = async (playlistId) => {
  try {
    if (!selectedFileForPlaylist) {
      throw new Error('No file selected');
    }

    const playlistRef = databaseRef(database, `playlists/${playlistId}`);
    const playlistSnapshot = await get(playlistRef);
    
    if (!playlistSnapshot.exists()) {
      throw new Error('Playlist not found');
    }

    const playlist = playlistSnapshot.val();
    const files = playlist.files || [];

    // Check if file already exists in playlist
    if (files.some(file => file.name === selectedFileForPlaylist.name)) {
      alert('This file is already in the playlist');
      return;
    }

    // Add new file to playlist
    const updatedFiles = [...files, selectedFileForPlaylist];
    await set(playlistRef, {
      ...playlist,
      files: updatedFiles
    });

    setShowPlaylistModal(false);
    setSelectedFileForPlaylist(null);
    alert('File added to playlist successfully');
  } catch (error) {
    console.error('Error adding file to playlist:', error);
    alert(`Failed to add file to playlist: ${error.message}`);
  }
};


  const handleCreateNewPlaylist = () => {
    if (newPlaylistName.trim()) {
      setPlaylists(prev => ({
        ...prev,
        [newPlaylistName]: selectedFileForPlaylist ? [selectedFileForPlaylist] : []
      }));
      setNewPlaylistName("");
      setShowPlaylistModal(false);
      setSelectedFileForPlaylist(null);
    }
  };


// Update the handleRenamePlaylist function
const handleRenamePlaylist = async (oldPlaylistId) => {
  try {
    const newName = prompt("Enter new playlist name:", playlists[oldPlaylistId].name);
    
    if (!newName || newName === playlists[oldPlaylistId].name) {
      return;
    }

    const playlistRef = databaseRef(database, `playlists/${oldPlaylistId}`);

    // Get current playlist data
    const snapshot = await get(playlistRef);
    if (!snapshot.exists()) {
      throw new Error('Playlist not found');
    }

    const playlistData = snapshot.val();

    // Update playlist with new name while keeping the same ID
    await set(playlistRef, {
      ...playlistData,
      name: newName
    });

    // Update local state
    setPlaylists(prevPlaylists => ({
      ...prevPlaylists,
      [oldPlaylistId]: {
        ...prevPlaylists[oldPlaylistId],
        name: newName
      }
    }));

    // Update selected playlist name if this playlist was selected
    if (selectedPlaylistName === playlists[oldPlaylistId].name) {
      setSelectedPlaylistName(newName);
    }

    alert('Playlist renamed successfully');
  } catch (error) {
    console.error('Error renaming playlist:', error);
    alert(`Failed to rename playlist: ${error.message}`);
  }
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
      const maxSize = 100 * 1024 * 1024; // 100MB limit
      if (file.size > maxSize) {
        alert("File size exceeds 100MB limit");
        return;
      }
  
      // Use the original file name without adding timestamp
      const fileName = file.name;
      const fileRef = ref(storage, `missingmatters_videos/${fileName}`);
  
      // Check if file already exists
      try {
        await getDownloadURL(fileRef);
        alert("A file with this name already exists. Please rename the file or choose a different one.");
        return;
      } catch (error) {
        // File doesn't exist, proceed with upload
        if (error.code === 'storage/object-not-found') {
          await uploadBytes(fileRef, file, {
            contentType: file.type
          });
          
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

      setUploadedFiles(prev => prev.filter(file => file.name !== fileName));
      setSelectedForBox(prev => prev.filter(file => file.name !== fileName));
      setSelectedBoxes(prev => prev.filter(index => uploadedFiles[index]?.name !== fileName));
    } catch (error) {
      console.error("Error deleting file:", error);
    }
  };

// Keep the existing handleUploadToSelectedBoxes function for manual uploads
const handleUploadToSelectedBoxes = async () => {
  try {
    if (selectedForBox.length === 0) {
      alert("No files selected for upload.");
      return;
    }

    const boxesToUpload = [currentBox];
    
    for (const box of boxesToUpload) {
      for (const file of selectedForBox) {
        const boxFolderPath = `missingmatters_videos/${box}/`;
        const boxFileRef = ref(storage, `${boxFolderPath}${file.name}`);
        
        const response = await fetch(file.url, { mode: 'no-cors' });
        const blob = await response.blob();
        await uploadBytes(boxFileRef, blob);
        
        setBoxFiles(prev => ({
          ...prev,
          [box]: [...(prev[box] || []), file]
        }));
      }
    }
    
    setSelectMode(false);
    setSelectedForBox([]);
    setSelectedBoxes([]);
    
    alert(`Successfully uploaded files to ${currentBox}`);
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
    const availableBoxes = boxes.slice(1); // Exclude "All Boxes"
    const currentIndex = availableBoxes.indexOf(currentBox);
    const newIndex = direction === "prev"
      ? (currentIndex - 1 + availableBoxes.length) % availableBoxes.length
      : (currentIndex + 1) % availableBoxes.length;
    setCurrentBox(availableBoxes[newIndex]);
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

  
// Update the playlist selection handler
const handlePlaylistSelection = async (playlistName) => {
  try {
    // Toggle selection - if currently selected, deselect it
    if (selectedPlaylistName === playlistName) {
      setSelectedPlaylistName(null);
      setFilteredPlaylistFiles([]);
      return;
    }

    setSelectedPlaylistName(playlistName);
    
    // Find the playlist by name
    const playlistEntry = Object.entries(playlists).find(([_, playlist]) => playlist.name === playlistName);
    
    if (playlistEntry) {
      const [_, playlistData] = playlistEntry;
      const playlistFiles = playlistData.files || [];
      
      // Filter uploaded files to show only files in the selected playlist
      const filteredFiles = uploadedFiles.filter(file => 
        playlistFiles.some(playlistFile => playlistFile.name === file.name)
      );
      
      setFilteredPlaylistFiles(filteredFiles);
      
      // Show notification to select box
      alert("Playlist selected. Please select a box from MMBoxes dropdown to upload the playlist.");
    }
  } catch (error) {
    console.error('Error selecting playlist:', error);
    alert('Failed to load playlist files');
  }
};


  const handlePlaylistUploadToBoxes = async (selectedBoxes) => {
    try {
      const selectedPlaylist = Object.values(playlists).find(p => p.name === selectedPlaylistName);
      if (!selectedPlaylist || !selectedPlaylist.files || selectedPlaylist.files.length === 0) {
        alert('No files in the selected playlist');
        return;
      }
  
      // Handle "All Boxes" selection
      const boxesToUpload = selectedBoxes.includes("All Boxes") 
        ? boxes.filter(box => box !== "All Boxes")
        : selectedBoxes;
  
      let uploadedCount = 0;
      const totalUploads = boxesToUpload.length * selectedPlaylist.files.length;
  
      for (const boxName of boxesToUpload) {
        const boxFolderPath = `missingmatters_videos/${boxName}/`;
        
        for (const file of selectedPlaylist.files) {
          try {
            const boxFileRef = ref(storage, `${boxFolderPath}${file.name}`);
            const response = await fetch(file.url, { mode: 'no-cors' });
            const blob = await response.blob();
            await uploadBytes(boxFileRef, blob);
            
            setBoxFiles(prev => ({
              ...prev,
              [boxName]: [...(prev[boxName] || []), file]
            }));
  
            uploadedCount++;
          } catch (error) {
            console.error(`Error uploading ${file.name} to ${boxName}:`, error);
          }
        }
      }
  
      setPlaylistUploadMode(false);
      setSelectedBoxNumbers([]);
      
      const filesText = selectedPlaylist.files.length === 1 ? 'file' : 'files';
      const boxesText = boxesToUpload.length === 1 ? 'box' : 'boxes';
      alert(`Successfully uploaded ${uploadedCount} out of ${totalUploads} ${filesText} to ${boxesToUpload.length} ${boxesText}`);
      
    } catch (error) {
      console.error("Upload error:", error);
      alert(`Upload failed: ${error.message}`);
    }
  };

// Update the handlePlaylistFilesUpload function
const handlePlaylistFilesUpload = (playlist) => {
  setShowPlaylistModal(false);
  setPlaylistUploadMode(true);
  setSelectedPlaylistName(playlist.name);
  setSelectedForBox(playlist.files || []);
  alert("Select boxes from MMBoxes dropdown to upload playlist files. You can select multiple boxes or 'All Boxes'.");
};

const initiatePlaylistTransfer = (playlistData) => {
  // Store the playlist information
  const filesToUpload = playlistData.files || [];
  
  // Set up the upload mode
  setPlaylistUploadMode(true);
  setSelectedForBox(filesToUpload);
  setSelectedPlaylistName(playlistData.name);
  
  // Close the modal and show instructions
  setShowPlaylistModal(false);
  alert("Select a box from MMBoxes dropdown to upload playlist files");
};

// Add this function to handle checkbox changes in the MMBoxes dropdown
const handleBoxSelectionForPlaylist = (boxName) => {
  setSelectedBoxNumbers(prev => {
    const isSelected = prev.includes(boxName);
    if (boxName === "All Boxes") {
      return isSelected ? [] : ["All Boxes"];
    }
    
    const newSelection = isSelected
      ? prev.filter(box => box !== boxName)
      : [...prev.filter(box => box !== "All Boxes"), boxName];
    
    return newSelection;
  });
};


const PlaylistModal = ({ onPlaylistTransfer }) => {
  const [showFiles, setShowFiles] = useState(false);
  const [activePlaylist, setActivePlaylist] = useState(null);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [localPlaylistName, setLocalPlaylistName] = useState("");

  // Add custom scrollbar styles
  const scrollbarStyles = `
    .playlist-scroll::-webkit-scrollbar {
      width: 6px;
    }
    
    .playlist-scroll::-webkit-scrollbar-track {
      background: transparent;
    }
    
    .playlist-scroll::-webkit-scrollbar-thumb {
      background-color: #3C3B3B;
      border-radius: 3px;
    }
    
    .playlist-scroll {
      scrollbar-width: thin;
      scrollbar-color: #3C3B3B transparent;
    }
  `;

  const loadPlaylistFiles = async (playlistId) => {
    try {
      const playlistRef = databaseRef(database, `playlists/${playlistId}`);
      const snapshot = await get(playlistRef);
      
      if (snapshot.exists()) {
        const playlist = snapshot.val();
        setActivePlaylist(playlist);
        setCurrentPlaylistFiles(playlist.files || []);
        setShowFiles(true);
      }
    } catch (error) {
      console.error('Error loading playlist files:', error);
      alert('Failed to load playlist files');
    }
  };
  
  const handleDeletePlaylist = async (playlistId) => {
    try {
      if (window.confirm('Are you sure you want to delete this playlist?')) {
        const playlistRef = databaseRef(database, `playlists/${playlistId}`);
        await set(playlistRef, null);
        
        setPlaylists(prev => {
          const updated = { ...prev };
          delete updated[playlistId];
          return updated;
        });

        if (selectedPlaylistName === playlists[playlistId].name) {
          setSelectedPlaylistName(null);
          setFilteredPlaylistFiles([]);
        }
      }
    } catch (error) {
      console.error('Error deleting playlist:', error);
      alert('Failed to delete playlist');
    }
  };

  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (!localPlaylistName.trim()) {
        alert('Please enter a playlist name');
        return;
      }

      // Generate a unique ID based on timestamp
      const timestamp = Date.now();
      const playlistId = `Playlist-${timestamp}`;
      
      // Get current playlists snapshot
      const playlistsRef = databaseRef(database, 'playlists');
      const snapshot = await get(playlistsRef);
      const currentPlaylists = snapshot.exists() ? snapshot.val() : {};

      const newPlaylist = {
        id: playlistId,
        name: localPlaylistName,
        files: selectedFileForPlaylist ? [selectedFileForPlaylist] : []
      };

      // Update with all playlists
      await set(playlistsRef, {
        ...currentPlaylists,
        [playlistId]: newPlaylist
      });

      setPlaylists(prev => ({
        ...prev,
        [playlistId]: newPlaylist
      }));

      setLocalPlaylistName("");
      setShowCreatePlaylist(false);
      setShowPlaylistModal(false);
      setSelectedFileForPlaylist(null);

      alert('Playlist created successfully');
    } catch (error) {
      console.error('Error creating playlist:', error);
      alert('Failed to create playlist');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <style>{scrollbarStyles}</style>
      <div className="bg-[#1E1E1E] border border-[#3C3B3B] rounded-[25px] p-6 w-[480px] max-h-[80vh] overflow-hidden">
        {showCreatePlaylist ? (
          <div onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-white text-lg font-medium">Create New Playlist</h3>
              <button 
                className="text-[#858080] hover:text-white transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCreatePlaylist(false);
                  setLocalPlaylistName("");
                }}
              >
                Back
              </button>
            </div>
            <form onSubmit={handleCreatePlaylist} className="space-y-4">
              <input
                type="text"
                value={localPlaylistName}
                onChange={(e) => {
                  e.stopPropagation();
                  setLocalPlaylistName(e.target.value);
                }}
                placeholder="Enter playlist name"
                className="w-full bg-[#2A2929] border border-[#3C3B3B] rounded-[15px] p-4 text-white placeholder-[#858080]"
                autoFocus
              />
              <button
                type="submit"
                className="w-full bg-[#2A2929] hover:bg-[#3C3B3B] border border-[#3C3B3B] rounded-[15px] p-4 text-white transition-colors"
              >
                Create Playlist
              </button>
            </form>
          </div>
        ) : !showFiles ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-white text-lg font-medium">
                {selectedFileForPlaylist ? "Add to Playlist" : "Select Playlist"}
              </h3>
              <button 
                className="text-[#858080] hover:text-white transition-colors"
                onClick={() => setShowPlaylistModal(false)}
              >
                Close
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto playlist-scroll" style={{ maxHeight: "calc(80vh - 150px)" }}>
              {Object.values(playlists).map((playlist) => (
                <div 
                  key={playlist.id} 
                  className="bg-[#2A2929] border border-[#3C3B3B] rounded-[15px] p-4"
                >
                  <div className="flex items-center justify-between">
                    <button 
                      className="text-[#E8DCD0] hover:text-white text-left flex-1"
                      onClick={() => {
                        if (selectedFileForPlaylist) {
                          handleAddToPlaylist(playlist.id);
                        } else {
                          loadPlaylistFiles(playlist.id);
                        }
                      }}
                    >
                      <div className="font-medium">{playlist.name}</div>
                      <div className="text-sm text-[#858080]">
                        {(playlist.files || []).length} files
                      </div>
                    </button>
                    <div className="flex gap-2">
                      <button 
                        className="ml-4 text-[#858080] hover:text-white px-3 py-1 border border-[#3C3B3B] rounded-full text-sm"
                        onClick={() => handleRenamePlaylist(playlist.id)}
                      >
                        Rename
                      </button>
                      <button 
                        className="text-[#858080] hover:text-red-500 px-3 py-1 border border-[#3C3B3B] rounded-full text-sm"
                        onClick={() => handleDeletePlaylist(playlist.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowCreatePlaylist(true)}
              className="mt-4 w-full bg-[#2A2929] hover:bg-[#3C3B3B] border border-[#3C3B3B] rounded-[15px] p-4 text-[#E8DCD0] transition-colors"
            >
              Create New Playlist
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-white text-lg font-medium">
                  {activePlaylist?.name}
                </h3>
                <p className="text-sm text-[#858080]">
                  {activePlaylist?.files?.length || 0} files
                </p>
              </div>
              <button 
                className="text-[#858080] hover:text-white transition-colors"
                onClick={() => setShowFiles(false)}
              >
                Back
              </button>
            </div>

            {activePlaylist?.files?.length > 0 && (
              <div className="flex justify-center items-center mb-6">
                <div className="flex items-center justify-center bg-[#2A2929] border border-[#3C3B3B] rounded-[25px]"
                     style={{ width: "180px", height: "180px", position: "relative" }}>
                  <img
                    src={circledPlay}
                    alt="Play"
                    className="absolute w-12 h-12 cursor-pointer"
                    style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlaylistTransfer?.(activePlaylist);
                    }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-3 overflow-y-auto playlist-scroll" style={{ maxHeight: "calc(80vh - 350px)" }}>
              {activePlaylist?.files?.map((file, index) => (
                <div 
                  key={index}
                  className="bg-[#2A2929] border border-[#3C3B3B] rounded-[15px] p-4 flex items-center"
                >
                  <div className="w-12 h-12 bg-[#1E1E1E] rounded-[10px] flex items-center justify-center mr-4">
                    {file.isVideo ? (
                      <svg className="w-6 h-6 text-[#858080]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6 text-[#858080]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-[#E8DCD0] truncate">{file.name}</div>
                    <div className="text-sm text-[#858080]">
                      {file.isVideo ? 'Video' : 'Image'}
                    </div>
                  </div>
                </div>
              ))}
              {(!activePlaylist?.files || activePlaylist.files.length === 0) && (
                <div className="text-center text-[#858080] py-8">
                  No files in this playlist
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

  return (
    <div className="flex h-screen bg-[#000000] text-white">
      {/* Sidebar */}
{/* Continuing from the Sidebar section */}
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
        <div className="relative flex items-center bg-[#1E1E1E] border border-[#3C3B3B] rounded-[25px] px-4 h-20 mb-5 justify-between">
          <div className="flex items-center justify-center cursor-pointer">
            <span className="text-[#858080] text-[24px] font-montserrat">&lt;</span>
          </div>
          {Object.entries({
            MMBoxes: boxes,
            FileType: fileTypes,
            Playlists: Object.values(playlists).map(playlist => playlist.name), // Show playlist names instead of keys
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
              <div className="flex items-center justify-center w-full">
                <span className="text-[16px] font-montserrat text-center">{key}</span>
                <img src={expandArrow} alt="Expand" className="w-4 h-4 ml-2" />
              </div>
              {activeDropdown === key && (
  <div 
    className="absolute bg-[#1E1E1E] border border-[#3C3B3B] rounded-[25px] p-4 z-50 overflow-y-auto" 
    style={{ 
      width: "173.25px", 
      top: "60px",
      maxHeight: "300px",
      scrollbarWidth: "thin",
      scrollbarColor: "#3C3B3B transparent",
    }}
  >
    <style>
      {`
        /* WebKit (Chrome, Safari) scrollbar styles */
        .overflow-y-auto::-webkit-scrollbar {
          width: 6px;
        }
        
        .overflow-y-auto::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .overflow-y-auto::-webkit-scrollbar-thumb {
          background-color: #3C3B3B;
          border-radius: 3px;
        }
        
        /* Firefox scrollbar styles */
        .overflow-y-auto {
          scrollbar-width: thin;
          scrollbar-color: #3C3B3B transparent;
        }
      `}
    </style>
    {values.map((option, idx) => (
      <div 
        key={idx} 
        className={`flex items-center justify-between mb-2 p-2 rounded-[10px] ${
          key === "MMBoxes" && selectedBoxNumbers.includes(option)
            ? "bg-[#2A2929]"
            : ""
        }`}
      >
        <label className={`text-[14px] font-montserrat ${
          key === "MMBoxes" && selectedBoxNumbers.includes(option)
            ? "text-white"
            : "text-[#858080]"
        }`}>
          {option}
        </label>
        <input
          type="checkbox"
          checked={
            key === "MMBoxes" 
              ? selectedBoxNumbers.includes(option)
              : key === "FileType"
              ? selectedFileType === option
              : key === "Playlists"
              ? selectedPlaylistName === option
              : false
          }
          onChange={() => {
            if (key === "MMBoxes") {
              handleBoxSelection(option);
            } else if (key === "FileType") {
              handleFileTypeSelection(option);
            } else if (key === "Playlists") {
              handlePlaylistSelection(option);
            }
          }}
          className="appearance-none w-5 h-5 border-[#3C3B3B] border-2 bg-[#1E1E1E] checked:bg-[#858080] checked:border-[#858080] focus:outline-none rounded-[4px] transition-colors"
          onClick={(e) => e.stopPropagation()}
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
          <div className="bg-[#000000] border border-[#3C3B3B] rounded-[25px] overflow-y-auto" 
               style={{ height: "550px", width: "70%" }}>
            <div className="grid grid-cols-5 gap-6 p-6">
              {/* Upload Box */}
              <div className="flex items-center justify-center bg-[#2A2929] border border-[#3C3B3B] rounded-[25px]" 
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

              {/* Filtered Files */}
              {getFilteredFiles().map((file, index) => (
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
                  <label className="absolute cursor-pointer z-10" 
                         style={{ width: "50px", height: "50px", position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
                    <img src={circledPlay} alt="Play" className="w-12 h-12" />
                  </label>

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
      className="text-[#858080] hover:text-white cursor-pointer mb-2"
      onClick={() => {
        setSelectMode(true);
        handleSelectFileForBox(file);
        toggleMenu(null);
      }}
    >
      Select
    </div>
    <div
      className="text-[#858080] hover:text-white cursor-pointer mb-2"
      onClick={() => {
        setSelectedFileForPlaylist(file);
        setShowPlaylistModal(true);
        toggleMenu(null);
      }}
    >
      Add to Playlist
    </div>
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

          {/* Right Panel */}
          <div className="bg-[#1E1E1E] border border-[#3C3B3B] rounded-[25px] flex flex-col" 
               style={{ height: "550px", width: "30%", padding: "20px" }}>
            {/* Box Header */}
            <div className="flex justify-between items-center mb-4">
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
                    if (playlistUploadMode && selectedBoxNumbers.length > 0) {
                      handlePlaylistUploadToBoxes(selectedBoxNumbers);
                    } else if (selectedPlaylistName) {
                      const selectedPlaylist = Object.values(playlists).find(p => p.name === selectedPlaylistName);
                      if (selectedPlaylist && selectedPlaylist.files && selectedPlaylist.files.length > 0) {
                        setPlaylistUploadMode(true);
                        setSelectedForBox(selectedPlaylist.files);
                        alert("Select boxes from MMBoxes dropdown to upload playlist files. You can select multiple boxes or 'All Boxes'.");
                      } else {
                        alert("No files in the selected playlist");
                      }
                    } else {
                      setSelectMode(true);
                      alert("You can now select files from the database.");
                    }
                  }}
                />
              </div>
            </div>


            {/* File List */}
            <div className="flex flex-col gap-2 overflow-y-auto pr-2 flex-grow">
              {(boxFiles[currentBox] || []).map((file, index) => (
                <div key={index} className="flex items-center justify-between text-[#858080] text-[14px]">
                  <div className="flex items-center gap-6">
                    <span className="bg-[#464646] rounded-full flex items-center justify-center w-9 h-9 text-base">
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
              className="mt-4 flex items-center justify-center w-3/4 py-3 bg-[#1E1E1E] border border-[#3C3B3B] text-[#E8DCD0] rounded-full hover:bg-[#2A2929] active:bg-[#1E1E1E] transform active:scale-95 transition-all duration-200 mx-auto"
              style={{ fontSize: "14px", height: "45px" }}
              onClick={handleUploadToSelectedBoxes}
            >
              Upload to {selectedBoxNumbers.length ? 'Selected Boxes' : 'Box'}
              <img src={uploadArrow} alt="Arrow" className="ml-4 w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Playlist Modal */}
      {showPlaylistModal && <PlaylistModal />}
    </div>
  );
};

export default AdsScreen;