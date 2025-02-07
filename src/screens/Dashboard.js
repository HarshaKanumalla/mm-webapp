import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, useLoadScript, MarkerF } from '@react-google-maps/api';
import { getDatabase, ref, onValue, push } from 'firebase/database';
import { getAuth, signOut } from 'firebase/auth';
import { getStorage, ref as storageRef, listAll } from 'firebase/storage';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

import dashboard from "./dashboard.png";
import dataCenter from "./data-center.png";
import futures from "./futures.png";
import notification from "./notification.png";
import logout from "./logout.png";
import tasks from "./tasks.png";
import mmlogo from "./mmlogo.png";
import slide from "./slide.png";
import rectangle from "./rectangle.png";
import button from "./button.png";

const containerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '12px'
};

const predefinedLocations = [
  {
    id: 'kbr',
    boxId: 'HN 1507',
    name: 'KBR Park',
    address: 'Road No. 2, Banjara Hills, Hyderabad',
    position: { lat: 17.4163, lng: 78.4265 },
    isActive: false
  },
  {
    id: 'charminar',
    boxId: 'HN 1508',
    name: 'Charminar',
    address: 'Charminar Road, Ghansi Bazaar, Hyderabad',
    position: { lat: 17.3616, lng: 78.4747 },
    isActive: false
  },
  {
    id: 'secretariat',
    boxId: 'HN 1509',
    name: 'Secretariat Bus Stop',
    address: 'Tank Bund Road, Secretariat, Hyderabad',
    position: { lat: 17.4094, lng: 78.4742 },
    isActive: false
  },
  {
    id: 'tankbund',
    boxId: 'HN 1510',
    name: 'Tank Bund',
    address: 'Tank Bund Road, Lower Tank Bund, Hyderabad',
    position: { lat: 17.4239, lng: 78.4738 },
    isActive: false
  }
];

const NavButton = ({ icon, onClick }) => (
  <button 
    onClick={onClick}
    className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 transition-colors duration-200"
  >
    <img src={icon} alt="" className="w-6 h-6" />
  </button>
);

const NotificationBox = () => {
  const [notifications, setNotifications] = useState([]);
  const database = getDatabase();

  const formatDate = (timestamp) => {
    // Create a date object from the timestamp
    const date = new Date(timestamp);
    
    // Subtract 5 hours and 30 minutes (in milliseconds)
    const adjustedDate = new Date(date.getTime() - (5.5 * 60 * 60 * 1000));
    
    return adjustedDate.toLocaleString('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const addNotification = (notification) => {
    setNotifications(prev => {
      const exists = prev.some(n => n.id === notification.id);
      if (!exists) {
        return [...prev, notification].sort((a, b) => 
          new Date(b.timestamp) - new Date(a.timestamp)
        );
      }
      return prev;
    });
  };

  useEffect(() => {
    let processedItems = new Set();
    
    const fetchAndProcessNotifications = async () => {
      // Door Status Notifications
      const doorStatusRef = ref(database, 'devices');
      const doorStatusUnsubscribe = onValue(doorStatusRef, (snapshot) => {
        if (snapshot.exists()) {
          const devices = snapshot.val();
          Object.entries(devices).forEach(([boxId, boxData]) => {
            if (boxData.door_status) {
              Object.entries(boxData.door_status).forEach(([key, statusData]) => {
                if (statusData && statusData.timestamp) {
                  const formattedTime = formatDate(statusData.timestamp);
                  const notification = {
                    id: `door_${key}`,
                    type: 'door_status',
                    message: `Door ${statusData.door_status === 'door_open' ? 'opened' : 'closed'} - Box ${statusData.device_name} at ${formattedTime}`,
                    timestamp: statusData.timestamp,
                    boxId: boxId
                  };
                  addNotification(notification);
                }
              });
            }
          });
        }
      });

      // Item Placement Notifications
      const completeDataRef = ref(database, 'Complete_data');
      const itemPlacementUnsubscribe = onValue(completeDataRef, (snapshot) => {
        if (snapshot.exists()) {
          const completeData = snapshot.val();
          Object.entries(completeData).forEach(([boxId, boxItems]) => {
            if (typeof boxItems === 'object') {
              Object.entries(boxItems).forEach(([itemId, itemData]) => {
                const itemKey = `${boxId}_${itemId}`;
                if (itemData && 
                    typeof itemData === 'object' && 
                    Object.values(itemData).every(value => value && value !== '-') &&
                    !processedItems.has(itemKey)) {
                  processedItems.add(itemKey);
                  const timestamp = itemData.timestamp || Date.now();
                  const notification = {
                    id: `item_placement_${itemKey}`,
                    type: 'item_placement',
                    message: `Item placed in Box ${boxId} at ${formatDate(timestamp)}`,
                    timestamp: timestamp,
                    boxId: boxId
                  };
                  addNotification(notification);
                }
              });
            }
          });
        }
      });

      // Lost Reports Notifications
      const lostReportsRef = ref(database, 'lost_reports');
      const lostReportsUnsubscribe = onValue(lostReportsRef, (snapshot) => {
        if (snapshot.exists()) {
          const reports = snapshot.val();
          Object.entries(reports).forEach(([key, report]) => {
            if (report && report.timestamp) {
              const formattedTime = formatDate(report.timestamp);
              const notification = {
                id: `lost_${key}`,
                type: 'lost_report',
                message: `Lost item report received at ${formattedTime}`,
                timestamp: report.timestamp
              };
              addNotification(notification);
            }
          });
        }
      });

      // QR Scan Responses
      const responsesRef = ref(database, 'responses');
      const responsesUnsubscribe = onValue(responsesRef, (snapshot) => {
        if (snapshot.exists()) {
          const responses = snapshot.val();
          Object.entries(responses).forEach(([key, response]) => {
            if (response && response.timestamp) {
              const formattedTime = formatDate(response.timestamp);
              const boxId = response.boxId || 'Unknown';
              const notification = {
                id: `qr_${key}`,
                type: 'qr_scan',
                message: `QR code scanned at Box ${boxId} - ${formattedTime}`,
                timestamp: response.timestamp,
                boxId: boxId
              };
              addNotification(notification);
            }
          });
        }
      });

      return () => {
        doorStatusUnsubscribe();
        itemPlacementUnsubscribe();
        lostReportsUnsubscribe();
        responsesUnsubscribe();
      };
    };

    fetchAndProcessNotifications();

    return () => {
      processedItems.clear();
    };
  }, [database]);

  // Group notifications by date
  const groupedNotifications = notifications.reduce((acc, notification) => {
    const date = new Date(notification.timestamp).toLocaleDateString('en-GB');
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(notification);
    return acc;
  }, {});

  // Get today's date in en-GB format for the header count
  const today = new Date().toLocaleDateString('en-GB');

  return (
    <div className="bg-white rounded-xl p-6 shadow-lg w-full h-full">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <h2 className="font-['Montserrat'] text-[#2A9D8F] text-lg font-medium">
            NOTIFICATIONS
          </h2>
          <div className="w-6 h-6 rounded-full bg-[#2A9D8F] flex items-center justify-center">
            <span className="text-white text-sm">
              {groupedNotifications[today]?.length || 0}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-6 overflow-y-auto max-h-[calc(100%-4rem)]">
        {Object.entries(groupedNotifications).map(([date, dateNotifications]) => (
          <div key={date}>
            <div className="text-base text-gray-500 mb-4">{date}</div>
            <div className="space-y-4">
              {dateNotifications.map((notification) => (
                <div key={notification.id} className="flex items-start gap-3">
                  <div className="w-3 h-3 rounded-full bg-[#2A9D8F] mt-2"></div>
                  <div>
                    <p className="text-base text-gray-600">
                      {notification.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


const BoxDetailsCard = ({ boxData, onMoreDetails }) => {
  const [boxStats, setBoxStats] = useState({
    doorStatus: 'OFF',
    adsCount: 0,
    itemsRemaining: 0
  });

  useEffect(() => {
    const database = getDatabase();
    const storage = getStorage();

    const fetchData = async () => {
      // Door Status
      const doorStatusRef = ref(database, `devices/${boxData.boxId}/door_status`);
      const doorStatusUnsubscribe = onValue(doorStatusRef, (snapshot) => {
        if (snapshot.exists()) {
          const statusEntries = Object.values(snapshot.val());
          const latestStatus = statusEntries.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
          )[0];
          setBoxStats(prev => ({
            ...prev,
            doorStatus: latestStatus.door_status === 'door_open' ? 'ON' : 'OFF'
          }));
        }
      });

      // Items Remaining - Check Complete_data with box number only
      const boxNumber = boxData.boxId.replace('HN ', '').replace('HN', '');
      const itemsRef = ref(database, `Complete_data/${boxNumber}`);
      const itemsUnsubscribe = onValue(itemsRef, (snapshot) => {
        if (snapshot.exists()) {
          const itemsData = snapshot.val();
          const unclaimedCount = Object.values(itemsData).filter(
            item => item && item.status === 'UNCLAIMED'
          ).length;
          setBoxStats(prev => ({
            ...prev,
            itemsRemaining: unclaimedCount
          }));
        } else {
          setBoxStats(prev => ({
            ...prev,
            itemsRemaining: 0
          }));
        }
      });

      // Ads Count from Storage
      try {
        // Add space after "HN" if it's not already there
        const storageBoxId = boxData.boxId.startsWith('HN') && !boxData.boxId.includes(' ') 
          ? boxData.boxId.replace('HN', 'HN ') 
          : boxData.boxId;
        
        console.log('Attempting to fetch ads for box:', storageBoxId);
        
        const adsRef = storageRef(storage, 'missingmatters_videos/' + storageBoxId);
        console.log('Storage path:', adsRef.fullPath);
        
        const folderContents = await listAll(adsRef);
        console.log('Folder contents:', folderContents);
        
        const filesCount = folderContents.items.length;
        console.log('Files found:', filesCount);
        
        setBoxStats(prev => ({
          ...prev,
          adsCount: filesCount
        }));
      } catch (error) {
        console.error('Storage error details:', {
          boxId: boxData.boxId,
          error: error.message,
          code: error.code
        });
        setBoxStats(prev => ({
          ...prev,
          adsCount: 0
        }));
      }

      return () => {
        doorStatusUnsubscribe();
        itemsUnsubscribe();
      };
    };

    if (boxData.boxId) {
      fetchData();
    }
  }, [boxData.boxId]);

  return (
    <div className="h-full flex items-center justify-center">
      <div className="w-[400px] h-[300px] bg-white rounded-xl relative">
        <div className="flex h-full p-8">
          <div className="flex items-center justify-center w-1/3">
            <div className="w-32">
              <img 
                src={rectangle} 
                alt="Status Indicator" 
                className="w-full h-auto"
              />
            </div>
          </div>

          <div className="w-2/3 pt-12 pl-4">
            <div className="mb-4">
              <h2 className="font-['Montserrat'] text-[24px] text-[#858080] font-normal leading-none mb-1">
                {boxData.boxId}
              </h2>
              <div className="flex items-start">
                <svg className="w-3 h-3 mt-0.5 mr-1 text-[#858080]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                <div className="flex flex-col">
                  {boxData.address ? (
                    <>
                      <span className="font-['Montserrat'] text-[10px] text-[#858080]">
                        {boxData.address.split(',')[0]},
                      </span>
                      <span className="font-['Montserrat'] text-[10px] text-[#858080]">
                        {boxData.address.split(',').slice(1).join(',').trim()}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-['Montserrat'] text-[12px] text-[#858080]">Road No 12,</span>
                      <span className="font-['Montserrat'] text-[12px] text-[#858080]">Hitech City</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-b border-gray-200 py-2">
              <div className="grid grid-cols-3">
                <div className="text-center border-r border-gray-200">
                  <p className="font-['Montserrat'] text-[14px] text-[#858080] mb-1">
                    {boxStats.doorStatus}
                  </p>
                  <p className="font-['Montserrat'] text-[10px] text-[#858080] uppercase">Door</p>
                </div>
                <div className="text-center border-r border-gray-200">
                  <p className="font-['Montserrat'] text-[14px] text-[#858080] mb-1">
                    {boxStats.itemsRemaining}
                  </p>
                  <p className="font-['Montserrat'] text-[10px] text-[#858080] uppercase">Items Left</p>
                </div>
                <div className="text-center">
                  <p className="font-['Montserrat'] text-[14px] text-[#858080] mb-1">
                    {boxStats.adsCount}
                  </p>
                  <p className="font-['Montserrat'] text-[10px] text-[#858080] uppercase">ADS</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <button 
            onClick={() => {
              const boxNumber = boxData.boxId.replace('HN ', '').replace('HN', '');
              console.log('Clicked More Details for:', {
                originalId: boxData.boxId,
                boxNumber: boxNumber
              });
              onMoreDetails(boxNumber);
            }}
            className="flex items-center bg-white rounded-lg shadow-md px-4 py-2"
          >
            <div className="w-6 h-6 rounded-full bg-[#2A9D8F] flex items-center justify-center mr-2">
              <img src={slide} alt="slide" className="w-4 h-4" />
            </div>
            <span className="font-['Montserrat'] text-[12px] text-[#2A9D8F] font-light">
              MORE DETAILS
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

const DoorStatus = () => {
  const [doorStatus, setDoorStatus] = useState('door_closed');
  const [buttonPressed, setButtonPressed] = useState(false);
  const database = getDatabase();

  useEffect(() => {
    const deviceRef = ref(database, 'devices/HN 1506/door_status');
    
    const unsubscribe = onValue(deviceRef, (snapshot) => {
      if (snapshot.exists()) {
        const statusEntries = Object.values(snapshot.val());
        const latestStatus = statusEntries.sort((a, b) => 
          new Date(b.timestamp) - new Date(a.timestamp)
        )[0];
        
        setDoorStatus(latestStatus.door_status);
        setButtonPressed(latestStatus.door_status === 'door_open');
      }
    });

    return () => unsubscribe();
  }, [database]);

  const handleDoorControl = async () => {
    try {
      setButtonPressed(true);
      
      const doorCommandsRef = ref(database, 'box_door_commands/HN1506');
      
      const command = {
        device_id: 'HN1506',
        command_type: 'OPEN',
        timestamp: new Date().toISOString(),
        status: 'pending',
        request_source: 'dashboard'
      };
      
      await push(doorCommandsRef, command);
      
      // Extended timeout to 20 seconds
      setTimeout(() => {
        setButtonPressed(prevState => {
          if (prevState) {
            return false;
          }
          return prevState;
        });
      }, 20000);
      
    } catch (error) {
      console.error('Error sending door command:', error);
      setButtonPressed(false);
    }
  };

  const isActive = buttonPressed || doorStatus === 'door_open';

  return (
    <button 
      onClick={handleDoorControl}
      className="w-full h-full rounded-xl transition-all duration-300 relative overflow-hidden cursor-pointer hover:opacity-90"
      style={{
        background: 'linear-gradient(to bottom, rgba(21, 20, 26, 0.9), rgba(46, 45, 51, 1))'
      }}
    >
      <div className="absolute top-6 left-6">
        <h2 className="font-['Montserrat'] text-gray-300 text-base">
          DOOR STATUS
        </h2>
        <span 
          className="text-4xl font-light block mt-4 text-gray-300 transition-colors duration-300"
        >
          {isActive ? 'ON' : 'OFF'}
        </span>
      </div>
      
      <div className="h-full w-full flex items-center justify-end px-8">
        <div className="w-1/3 flex justify-end">
          <div
            className="w-4/5 transition-all duration-300"
            style={{
              position: 'relative',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}
          >
            <img 
              src={button} 
              alt="Door Status" 
              className="w-full h-full transition-all duration-300"
              style={{
                filter: `brightness(0) saturate(100%) ${isActive ? 
                  'invert(77%) sepia(32%) saturate(481%) hue-rotate(334deg) brightness(101%) contrast(93%)' : 
                  'invert(60%) sepia(11%) saturate(1107%) hue-rotate(118deg) brightness(93%) contrast(91%)'}`
              }}
            />
          </div>
        </div>
      </div>
    </button>
  );
};

const AdsMetricsBox = ({ title }) => {
  const [adsData, setAdsData] = useState([]);
  const [totalAds, setTotalAds] = useState(0);
  
  useEffect(() => {
    const fetchTotalAds = async () => {
      const auth = getAuth();
      const storage = getStorage();
      const user = auth.currentUser;
      if (!user) return;

      try {
        const mainRef = storageRef(storage, 'missingmatters_videos');
        const mainResult = await listAll(mainRef);
        
        const fetchPromises = mainResult.prefixes.map(async (folderRef) => {
          try {
            const folderContents = await listAll(folderRef);
            return folderContents.items.length;
          } catch (error) {
            console.error(`Error accessing folder ${folderRef.fullPath}:`, error);
            return 0;
          }
        });

        const folderCounts = await Promise.all(fetchPromises);
        const totalCount = folderCounts.reduce((sum, count) => sum + count, 0);
        setTotalAds(totalCount);
        
        // Generate trend data based on actual total
        const newData = Array.from({ length: 7 }, (_, i) => ({
          name: String(i + 1),
          value: Math.floor(totalCount * (0.8 + Math.random() * 0.4))
        }));
        setAdsData(newData);
      } catch (error) {
        console.error("Error fetching total ads:", error);
      }
    };

    fetchTotalAds();
    const interval = setInterval(fetchTotalAds, 300000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full rounded-xl p-6 text-[#2A9D8F]"
      style={{
        background: '#F3F4F4',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-['Montserrat'] text-base font-medium">
          {title}
        </h2>
        <span className="text-4xl font-semibold text-gray-800">
          {totalAds}
        </span>
      </div>
      
      <div className="h-[60%]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart 
            data={adsData}
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="colorFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2A9D8F" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#E7C5C4" stopOpacity={0.23} />
              </linearGradient>
            </defs>
            <Area 
              type="monotone"
              dataKey="value"
              stroke="none"
              fillOpacity={1}
              fill="url(#colorFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const MetricsBox = ({ title }) => {
  // Sample data for AD INTERACTIONS
  const sampleData = [800, 600, 1506, 1200];
  const total = 1506;

  return (
    <div 
      className="w-full h-full rounded-xl relative overflow-hidden"
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

const ClaimedMetricsBox = () => {
  const [claimedStats, setClaimedStats] = useState({
    claimed: 0,
    total: 0
  });

  useEffect(() => {
    const database = getDatabase();
    const completeDataRef = ref(database, '/Complete_data');
    
    const processStatusData = (snapshot) => {
      if (!snapshot.exists()) return;

      const completeData = snapshot.val();
      let claimedCount = 0;
      let unclaimedCount = 0;

      Object.values(completeData).forEach(boxData => {
        if (typeof boxData === 'object') {
          Object.values(boxData).forEach(entry => {
            if (entry?.status) {
              const status = entry.status.toUpperCase();
              if (status === "CLAIMED") {
                claimedCount++;
              } else if (status === "UNCLAIMED") {
                unclaimedCount++;
              }
            }
          });
        }
      });

      setClaimedStats({
        claimed: claimedCount,
        total: claimedCount + unclaimedCount
      });
    };

    const unsubscribe = onValue(completeDataRef, processStatusData, (error) => {
      console.error("Error fetching status data:", error);
    });

    return () => unsubscribe();
  }, []);

  const percentage = claimedStats.total > 0 ? (claimedStats.claimed / claimedStats.total) * 100 : 0;
  
  return (
    <div className="h-full w-full bg-[#F3F4F4] rounded-xl p-6 shadow-lg">
      <div className="flex flex-col h-full">
        <div className="flex justify-between items-start">
          <div className="flex flex-col">
            <span className="text-5xl font-light text-gray-800">
              {claimedStats.claimed}
            </span>
            <span className="text-xs uppercase mt-2 tracking-wide text-gray-500">
              CLAIMED/REMAINING
            </span>
          </div>
          <span className="text-sm text-gray-400">/{claimedStats.total}</span>
        </div>
        
        <div className="mt-auto">
          <div className="relative">
            <div className="h-px bg-gray-200 absolute w-full"></div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ width: `${percentage}%` }}>
              <div 
                className="h-full w-full"
                style={{
                  background: `linear-gradient(to right, 
                    #FFFFFF 0%, 
                    #2A9D8F 35%, 
                    #2A9D8F 100%
                  )`
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Map = React.memo(({ onLocationSelect, selectedLocation }) => {
  const center = useMemo(() => ({ lat: 17.3850, lng: 78.4867 }), []);
  const [boxStatuses, setBoxStatuses] = useState({});

  useEffect(() => {
    const database = getDatabase();
    const boxesRef = ref(database, '/boxes');
    
    const unsubscribe = onValue(boxesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setBoxStatuses(data);
      }
    });

    return () => unsubscribe();
  }, []);

  const mapOptions = useMemo(() => ({
    streetViewControl: false,
    mapTypeControl: false,
    disableDefaultUI: true,
    styles: [
      { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
      { featureType: "transit", stylers: [{ visibility: "off" }] },
      { featureType: "poi", stylers: [{ visibility: "off" }] }
    ]
  }), []);

  const handleMarkerClick = useCallback((location) => {
    onLocationSelect(location);
  }, [onLocationSelect]);

  const markerIcon = useCallback((boxId) => ({
    url: `data:image/svg+xml,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
        <path fill="${boxStatuses[boxId]?.doorStatus === 'ON' ? '#339265' : '#A14342'}" 
              stroke="${boxStatuses[boxId]?.doorStatus === 'ON' ? '#339265' : '#A14342'}" 
              stroke-width="1.2"
          d="M12 0C7.6 0 4 3.6 4 8c0 4.4 8 16 8 16s8-11.6 8-16c0-4.4-3.6-8-8-8zm0 11.5c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4z"/>
      </svg>
    `)}`,
    scaledSize: new window.google.maps.Size(32, 32),
    anchor: new window.google.maps.Point(16, 32)
  }), [boxStatuses]);

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={12}
      options={mapOptions}
    >
      {predefinedLocations.map((location, index) => (
        <MarkerF
          key={index}
          position={location.position}
          onClick={() => handleMarkerClick(location)}
          options={{
            icon: markerIcon(location.boxId)
          }}
        />
      ))}
    </GoogleMap>
  );
});

export const Dashboard = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  const [selectedLocation, setSelectedLocation] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) navigate('/');
    });
    return () => unsubscribe();
  }, [auth, navigate]);

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
    libraries: ['marker']
  });

  const handleLocationSelect = useCallback((location) => {
    if (location) {
      const formattedLocation = {
        ...location,
        address: location.address.includes(',') 
          ? location.address 
          : `${location.address}, ${location.name}`
      };
      setSelectedLocation(formattedLocation);
    } else {
      setSelectedLocation(null);
    }
  }, []);

  const handleLogout = useCallback(() => {
    signOut(auth).then(() => navigate("/")).catch(console.error);
  }, [auth, navigate]);

  const handleMoreDetails = useCallback((boxId) => {
    // Format the box ID to include 'HN' prefix if not present
    const formattedBoxId = boxId.startsWith('HN') ? boxId : `HN ${boxId}`;
    navigate(`/monitoring?box=${encodeURIComponent(formattedBoxId)}`);
  }, [navigate]);

  return (
    <div className="h-screen bg-[#F3F4F4] p-6 flex flex-col gap-4">
      {/* Upper Section - 45% height */}
      <div className="h-[45%] flex gap-4">
        {/* Sidebar */}
        <div className="h-full w-20 bg-[#F3F4F4] border border-[#D9D9D9] rounded-xl p-4 flex flex-col">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-8 overflow-hidden">
            <img src={mmlogo} alt="MM Logo" className="w-8 h-8 object-contain" />
          </div>
          
          <div className="flex flex-col items-center space-y-1">
            <NavButton icon={futures} onClick={() => navigate("/dashboard")} />
            <NavButton icon={dataCenter} onClick={() => navigate("/ads")} />
            <NavButton icon={dashboard} onClick={() => navigate("/monitoring")} />
            <NavButton icon={tasks} onClick={() => navigate("/chatbot")} />
            <NavButton icon={logout} onClick={handleLogout} />
          </div>
        </div>

        {/* Map Container */}
        <div className="h-full flex-1 bg-white rounded-xl overflow-hidden shadow-lg">
          {isLoaded && (
            <Map 
              onLocationSelect={handleLocationSelect} 
              selectedLocation={selectedLocation} 
            />
          )}
        </div>

        {/* Status Box */}
        <div className="h-full w-96">
          <BoxDetailsCard 
            boxData={selectedLocation || { boxId: 'HN 1506' }}
            onMoreDetails={handleMoreDetails}
          />
        </div>
      </div>

      {/* Lower Section - 55% height */}
      <div className="h-[55%] flex gap-4">
        {/* Notifications */}
        <div className="w-[40%] h-full">
          <NotificationBox />
        </div>

        {/* Middle Section */}
        <div className="flex-1 h-full flex flex-col gap-4">
          <div className="h-[calc(50%-0.5rem)]">
            <AdsMetricsBox title="ADS RUNNING" />
          </div>
          <div className="h-[calc(50%-0.5rem)]">
            <MetricsBox 
              title="AD INTERACTIONS"
            />
          </div>
        </div>

        {/* Right Section */}
        <div className="w-96 h-full flex flex-col gap-4">
          <div className="h-[calc(50%-0.5rem)]">
            <DoorStatus />
          </div>
          <div className="h-[calc(50%-0.5rem)]">
            <ClaimedMetricsBox />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;