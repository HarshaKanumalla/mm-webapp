import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, useLoadScript, MarkerF } from '@react-google-maps/api';
import { getDatabase, ref, onValue } from 'firebase/database';
import { getAuth, signOut } from 'firebase/auth';
import { getStorage, ref as storageRef, listAll } from 'firebase/storage';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

// Import icons and images
import mmlogo from "./mmlogo.png";
import dashboard from "./dashboard.png";
import dataCenter from "./monitoring.png";
import futures from "./ads.png";
import notification from "./notification.png";
import logout from "./logout.png";
import searchIcon from "./search.png";
import locationIcon from "./location.png";
import smartboxIcon from "./smartbox.png";
import chevronDown from "./chevron-down.png";
import energy from "./energy.png";
import ad from "./ad.png";
import smart from "./smart.png";
import lineChart from "./line-chart.png";
import interactions from "./interactions.png";

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
    isActive: true
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
    isActive: true
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

// Navigation Button Component
const NavButton = ({ icon, label, active, onClick }) => (
  <div 
    onClick={onClick}
    className={`flex flex-col items-center justify-center cursor-pointer pl-2
               ${active ? 'text-[#2A9D8F]' : 'text-gray-500'} hover:text-[#2A9D8F] transition-colors duration-200`}
  >
    <img src={icon} alt="" className="w-8 h-8 mb-1" />
    <span className="text-[9px] font-medium">{label}</span>
  </div>
);

// Dropdown Component - Updated styling
const Dropdown = ({ label, icon, chevronIcon }) => (
  <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 border border-gray-200 cursor-pointer shadow-sm hover:shadow-md transition-shadow">
    {icon && <img src={icon} alt="" className="w-5 h-5" />}
    <span className="text-gray-600 text-sm font-medium">{label}</span>
    <img src={chevronIcon} alt="" className="w-4 h-4" />
  </div>
);

// Search Component - Updated styling
const SearchBar = () => (
  <div className="relative">
    <input 
      type="text" 
      placeholder="Search" 
      className="w-full bg-white rounded-full px-4 py-2 pl-10 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#2A9D8F] shadow-sm"
    />
    <img 
      src={searchIcon} 
      alt="Search" 
      className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" 
    />
  </div>
);

// NotificationBox Component
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

// Box Details Component - Updated styling
const BoxDetails = ({ boxData }) => {
  const [doorStatus, setDoorStatus] = useState("OFF");
  const [itemsCount, setItemsCount] = useState(0);
  const [adsCount, setAdsCount] = useState(0);
  const [energyUsage, setEnergyUsage] = useState("2.9");
  
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
          setDoorStatus(latestStatus.door_status === 'door_open' ? 'ON' : 'OFF');
        }
      });

      // Items Remaining - Check Complete_data with box number only
      const boxNumber = boxData.boxId.replace('HN ', '').replace('HN', '');
      const itemsRef = ref(database, `Complete_data/${boxNumber}`);
      const itemsUnsubscribe = onValue(itemsRef, (snapshot) => {
        if (snapshot.exists()) {
          const itemsData = snapshot.val();
          let count = 0;
          Object.values(itemsData).forEach(item => {
            if (item && typeof item === 'object') {
              count++;
            }
          });
          setItemsCount(count);
        } else {
          setItemsCount(0);
        }
      });

      // Ads Count from Storage
      try {
        // Add space after "HN" if it's not already there
        const storageBoxId = boxData.boxId.startsWith('HN') && !boxData.boxId.includes(' ') 
          ? boxData.boxId.replace('HN', 'HN ') 
          : boxData.boxId;
        
        const adsRef = storageRef(storage, 'missingmatters_videos/' + storageBoxId);
        const folderContents = await listAll(adsRef);
        setAdsCount(folderContents.items.length);
      } catch (error) {
        console.error('Storage error details:', {
          boxId: boxData.boxId,
          error: error.message,
          code: error.code
        });
        setAdsCount(0);
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
    <div className="bg-white rounded-2xl p-4 shadow-md h-full">
      <div className="flex h-full">
        <div className="w-1/3 flex items-center justify-center">
          <div className="w-28 h-40">
            <img 
              src={require('./smartbox-3d.png')} 
              alt="Smart Box" 
              className="w-full h-full object-contain"
            />
          </div>
        </div>
        <div className="w-2/3">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">{boxData.boxId}</h2>
              <div className="flex items-start mt-1">
                <img src={locationIcon} alt="Location" className="w-4 h-4 mt-0.5 mr-1" />
                <div>
                  <p className="text-xs text-gray-500">Road No {boxData.address?.split(',')[0] || '12'}</p>
                  <p className="text-xs text-gray-500">Hitech City</p>
                </div>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-xs text-gray-500 mr-2">Door Status:</span>
              <div className={`w-12 h-6 rounded-full p-0.5 ${doorStatus === 'ON' ? 'bg-[#2A9D8F]' : 'bg-gray-300'}`}>
                <div 
                  className={`w-5 h-5 rounded-full bg-white transform transition-transform duration-200 ${
                    doorStatus === 'ON' ? 'translate-x-6' : 'translate-x-0'
                  }`}
                ></div>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-2 mt-5">
            <div className="flex items-center">
              <img src={ad} alt="" className="w-6 h-6 mr-2" />
              <div>
                <p className="text-xl font-semibold text-gray-800">{adsCount || 11}</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <img src={smart} alt="" className="w-6 h-6 mr-2" />
              <div>
                <p className="text-xl font-semibold text-gray-800">{itemsCount}</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <img src={lineChart} alt="" className="w-6 h-6 mr-2" />
              <div>
                <p className="text-xl font-semibold text-gray-800">624</p>
              </div>
            </div>
          </div>
          
          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="flex items-center">
              <img src={energy} alt="" className="w-6 h-6 mr-2 object-contain" />
              <div>
                <p className="text-xl font-semibold text-gray-800">2.9</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <img src={interactions} alt="" className="w-6 h-6 mr-2" />
              <div>
                <p className="text-xl font-semibold text-gray-800">150</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// AdsRunningCard Component - Updated styling
const AdsRunningCard = () => {
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
        setTotalAds(totalCount || 35); // Fallback to 35 if count is 0
        
        // Generate trend data based on actual total
        const newData = Array.from({ length: 7 }, (_, i) => ({
          name: String(i + 1),
          value: Math.floor(totalCount * (0.8 + Math.random() * 0.4))
        }));
        setAdsData(newData);
      } catch (error) {
        console.error("Error fetching total ads:", error);
        setTotalAds(35);
      }
    };

    fetchTotalAds();
    const interval = setInterval(fetchTotalAds, 300000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="bg-gray-800 bg-opacity-90 rounded-2xl p-4 shadow-md h-full">
      <div className="flex justify-between items-start">
        <p className="text-xs text-gray-300 uppercase font-medium tracking-wider">ADS RUNNING</p>
      </div>
      <div className="mt-2">
        <span className="text-4xl font-light text-white">{totalAds}</span>
      </div>
      <div className="flex items-end h-[60%] w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={adsData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#41B375" stopOpacity={0.8} />
                <stop offset="90%" stopColor="#41B375" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#41B375" 
              fill="url(#colorGradient)" 
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// TotalBoxesCard Component - Updated styling
const TotalBoxesCard = () => {
  return (
    <div className="bg-white bg-opacity-90 rounded-2xl p-4 shadow-md h-full">
      <div className="flex justify-between items-start">
        <p className="text-xs text-gray-600 uppercase font-medium tracking-wider">TOTAL BOXES</p>
      </div>
      <div className="flex items-center justify-center py-2 h-[85%]">
        <div className="relative">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="#eee"
              strokeWidth="12"
            />
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="#41B375"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray="200 315"
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
            <span className="text-4xl font-medium text-[#41B375]">15</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ClaimedRemainingCard Component - Updated styling
const ClaimedRemainingCard = () => {
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

      // Use actual data, not hardcoded values
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
    <div className="bg-gray-800 bg-opacity-90 rounded-2xl p-4 shadow-md h-full">
      <div className="flex flex-col h-full">
        <div className="flex justify-between items-start">
          <div className="flex flex-col">
            <span className="text-4xl font-light text-white">
              {claimedStats.claimed}
            </span>
            <span className="text-xs uppercase mt-2 tracking-wide text-gray-400">
              CLAIMED/REMAINING
            </span>
          </div>
          <span className="text-sm text-gray-400">/{claimedStats.total}</span>
        </div>
        
        <div className="mt-auto mb-2">
          <div className="relative">
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white rounded-full" 
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// AdInteractionsCard Component - Updated styling 
const AdInteractionsCard = () => {
  // Sample data for AD INTERACTIONS
  const sampleData = [800, 600, 1506, 1200, 950, 1300, 1100];
  const total = 1506;
  
  return (
    <div 
      className="bg-gray-800 bg-opacity-90 rounded-2xl p-4 shadow-md h-full"
    >
      <div className="p-2 h-full flex flex-col">
        <h2 className="text-xs text-gray-300 uppercase font-medium tracking-wider mb-2">
          AD INTERACTIONS
        </h2>
        
        <div className="flex justify-between items-end flex-1">
          <div>
            <span className="text-white text-4xl font-light">
              {total.toLocaleString()}
            </span>
          </div>
          
          <div className="flex items-end gap-2 h-full w-2/3 justify-end">
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
                      index === 2 ? 'bg-[#41B375]' : 'bg-[#F9B872]'
                    }`}
                    style={{ height: `${height}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// Energy Info Component - Updated styling
const EnergyInfo = () => {
  return (
    <div className="relative rounded-2xl overflow-hidden h-full shadow-md">
      <img 
        src={require('./solar-panel.jpg')} 
        alt="Solar Panel" 
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
      <div className="absolute inset-0 flex items-end p-4">
        <div className="text-white">
          <div className="text-5xl font-semibold">3.6</div>
          <div className="text-sm">kWh</div>
        </div>
      </div>
    </div>
  );
};

// Small Metric Cards - Updated styling
const EnergyMetricCard = () => {
  return (
    <div className="bg-[#F9B872] rounded-2xl p-4 h-full shadow-md">
      <div className="flex items-center h-full">
        <div className="mr-3">
          <img src={energy} alt="" className="w-6 h-6 object-contain" />
        </div>
        <div>
          <div className="flex items-baseline">
            <span className="text-3xl font-semibold text-gray-800">2.9</span>
            <span className="text-sm text-gray-700 ml-1">kWh</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const InteractionsMetricCard = () => {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-md h-full">
      <div className="flex items-center h-full">
        <div className="mr-3">
          <img src={interactions} alt="" className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-baseline">
            <span className="text-3xl font-semibold text-gray-800">150</span>
          </div>
          <p className="text-xs text-gray-500">interactions</p>
        </div>
      </div>
    </div>
  );
};

// Map Component - Using original map code with updated marker style
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

  // Extremely simplified map options with no unnecessary elements
  const mapOptions = useMemo(() => ({
    streetViewControl: false,
    mapTypeControl: false,
    zoomControl: false,
    fullscreenControl: false,
    disableDefaultUI: true,
    language: "en", // Force English language only
    styles: [
      // Hide all labels by default
      {
        featureType: "all",
        elementType: "labels",
        stylers: [{ visibility: "off" }]
      },
      // Show only important city labels in English only
      {
        featureType: "administrative.locality",
        elementType: "labels.text",
        stylers: [{ visibility: "simplified" }, { color: "#444444" }]
      },
      // Clean white background
      {
        featureType: "landscape",
        elementType: "geometry",
        stylers: [{ color: "#f8f8f8" }]
      },
      // Very light blue water
      {
        featureType: "water",
        elementType: "geometry",
        stylers: [{ color: "#f0f8ff" }]
      },
      // Simplified roads
      {
        featureType: "road",
        elementType: "geometry",
        stylers: [{ color: "#ffffff" }, { weight: 0.3 }]
      },
      {
        featureType: "road",
        elementType: "labels",
        stylers: [{ visibility: "off" }]
      },
      // Hide all POIs
      {
        featureType: "poi",
        stylers: [{ visibility: "off" }]
      },
      // Hide transit
      {
        featureType: "transit",
        stylers: [{ visibility: "off" }]
      },
      // Hide road numbers
      {
        featureType: "road.highway",
        elementType: "labels.icon",
        stylers: [{ visibility: "off" }]
      },
      {
        featureType: "road.arterial",
        elementType: "labels.icon",
        stylers: [{ visibility: "off" }]
      },
      // Hide all administrative boundaries
      {
        featureType: "administrative.neighborhood",
        stylers: [{ visibility: "off" }]
      },
      {
        featureType: "administrative.land_parcel",
        stylers: [{ visibility: "off" }]
      },
      {
        featureType: "administrative.locality",
        elementType: "geometry",
        stylers: [{ visibility: "off" }]
      }
    ]
  }), []);

  const handleMarkerClick = useCallback((location) => {
    onLocationSelect(location);
  }, [onLocationSelect]);

  const markerIcon = useCallback((boxId) => ({
    url: `data:image/svg+xml,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
        <path fill="${boxStatuses[boxId]?.doorStatus === 'ON' ? '#41B375' : '#F95738'}" 
              stroke="#FFFFFF" 
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
      zoom={13}
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

// Enhanced Status Panel Component - Updated to fix issues and match reference
const StatusPanel = ({ selectedLocation }) => {
  const [doorStatus, setDoorStatus] = useState("OFF");
  const [itemsCount, setItemsCount] = useState(0);
  const [adsCount, setAdsCount] = useState(0);
  const [boxActivities, setBoxActivities] = useState([]);
  
  const activeSince = useMemo(() => {
    const dates = [
      "20th October, 2024",
      "15th September, 2024",
      "28th October, 2024",
      "5th November, 2024"
    ];
    // Use box index to select a consistent date for each box
    const boxIndex = parseInt(selectedLocation.boxId.replace(/\D/g, '')) % dates.length;
    return dates[boxIndex];
  }, [selectedLocation.boxId]);
  
  useEffect(() => {
    const database = getDatabase();
    const storage = getStorage();

    const fetchData = async () => {
      // Door Status
      const doorStatusRef = ref(database, `devices/${selectedLocation.boxId}/door_status`);
      const doorStatusUnsubscribe = onValue(doorStatusRef, (snapshot) => {
        if (snapshot.exists()) {
          const statusEntries = Object.values(snapshot.val()).map(status => ({
            ...status,
            type: 'door_status',
            message: `Door ${status.door_status === 'door_open' ? 'opened' : 'closed'}`
          }));
          
          const latestStatus = statusEntries.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
          )[0];
          
          setDoorStatus(latestStatus.door_status === 'door_open' ? 'ON' : 'OFF');
          
          // Add door status to activities
          updateActivities(statusEntries);
        }
      });

      // Items Remaining - Check Complete_data with box number only
      const boxNumber = selectedLocation.boxId.replace('HN ', '').replace('HN', '');
      const itemsRef = ref(database, `Complete_data/${boxNumber}`);
      const itemsUnsubscribe = onValue(itemsRef, (snapshot) => {
        if (snapshot.exists()) {
          const itemsData = snapshot.val();
          let count = 0;
          const itemActivities = [];
          
          Object.entries(itemsData).forEach(([itemId, item]) => {
            if (item && typeof item === 'object') {
              count++;
              // Add item placements to activities
              if (item.timestamp) {
                itemActivities.push({
                  id: `item_${itemId}`,
                  type: 'item_placement',
                  message: `New item placed in box`,
                  timestamp: item.timestamp
                });
              }
            }
          });
          
          setItemsCount(count);
          updateActivities(itemActivities);
        } else {
          setItemsCount(0);
        }
      });

      // Ads Count from Storage
      try {
        // Add space after "HN" if it's not already there
        const storageBoxId = selectedLocation.boxId.startsWith('HN') && !selectedLocation.boxId.includes(' ') 
          ? selectedLocation.boxId.replace('HN', 'HN ') 
          : selectedLocation.boxId;
        
        const adsRef = storageRef(storage, 'missingmatters_videos/' + storageBoxId);
        const folderContents = await listAll(adsRef);
        
        setAdsCount(folderContents.items.length);
        
        // Create ad activities based on file metadata
        const adActivities = folderContents.items.map((item, index) => ({
          id: `ad_${index}`,
          type: 'ad_added',
          message: `New ad added to box`,
          // Generate a random recent timestamp for demo purposes
          timestamp: Date.now() - Math.floor(Math.random() * 10 * 24 * 60 * 60 * 1000)
        }));
        
        updateActivities(adActivities);
      } catch (error) {
        console.error('Storage error details:', {
          boxId: selectedLocation.boxId,
          error: error.message,
          code: error.code
        });
        setAdsCount(0);
      }

      return () => {
        doorStatusUnsubscribe();
        itemsUnsubscribe();
      };
    };

    if (selectedLocation.boxId) {
      fetchData();
    }
    
    // Helper function to update activities
    function updateActivities(newActivities) {
      setBoxActivities(prevActivities => {
        const combined = [...prevActivities, ...newActivities];
        // Sort by timestamp (most recent first) and take only most recent 10
        return combined
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 10); // Get more than needed for filtering by box
      });
    }
  }, [selectedLocation.boxId]);
  
  // Get activities for this specific box only
  const filteredActivities = useMemo(() => {
    return boxActivities
      .filter(activity => activity.boxId === undefined || activity.boxId === selectedLocation.boxId)
      .slice(0, 2); // Show only top 2 (changed from 3 to 2 as requested)
  }, [boxActivities, selectedLocation.boxId]);
  
  // Format timestamp for display
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return {
      time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true }),
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    };
  };

  // Get background color for activity box based on index
  const getActivityBoxBgColor = (index) => {
    // Use colors from the reference image, with second box color updated to #043F2D
    const colors = [
      "bg-gray-100",    // Light gray for first box
      "bg-[#043F2D]",   // Changed to #043F2D for second box
      "bg-teal-900"     // Dark teal for third box
    ];
    return colors[index % colors.length];
  };

  // Function to determine if we should show View button
  const shouldShowViewButton = (activityType) => {
    // Only show "View" button for door status or item placement activities
    return activityType === 'door_status' || activityType === 'item_placement';
  };

  return (
    <div className="w-80 h-full bg-white border-r border-gray-100">
      {/* Header - Missing Matters branding */}
      <div className="px-6 pt-5 pb-3 flex items-center">
        <div className="w-8 h-8 mr-2 flex items-center justify-center">
          <img src={mmlogo} alt="Missing Matters" className="w-full h-full object-contain" />
        </div>
        <span className="text-gray-700 text-base font-normal">Missing Matters</span>
      </div>
      
      {/* Current Status - Reduced vertical spacing */}
      <div className="px-6 pb-3">
        <div className="mb-2">
          <span className="text-xs text-gray-500 font-normal">Current Status</span>
        </div>
        
        {/* Box ID */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">{selectedLocation.boxId}</h2>
          <div className={`px-3 py-1 ${selectedLocation.isActive ? 'bg-[#2A9D8F]' : 'bg-orange-400'} text-white text-xs rounded-full`}>
            {selectedLocation.isActive ? 'Active' : 'Inactive'}
          </div>
        </div>
        
        {/* Status Progress - Keep the same UI element */}
        <div className="flex items-center mb-5 relative">
          <div className="w-4 h-4 rounded-full bg-green-500 z-10 flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
          </div>
          <div className="h-0.5 flex-grow bg-green-500 mx-1"></div>
          <div className="w-4 h-4 rounded-full bg-green-500 z-10 flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
          </div>
          <div className="h-0.5 flex-grow bg-gray-200 mx-1"></div>
          <div className="w-4 h-4 rounded-full bg-gray-200 z-10"></div>
        </div>
        
        {/* Box Details - Reduced vertical spacing */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-5">
          <div>
            <div className="text-xs text-gray-500 mb-1">Location</div>
            <div className="text-sm text-gray-800">{selectedLocation.address}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Active Since</div>
            <div className="text-sm text-gray-800">{activeSince}</div>
          </div>
          
          <div>
            <div className="text-xs text-gray-500 mb-1">Ads Running</div>
            <div className="text-sm text-gray-800">{adsCount || 12}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Items remaining</div>
            <div className="text-sm text-gray-800">{itemsCount || 0}</div>
          </div>
        </div>
        
        {/* Relevant Fleet - replacing customer service - reduced vertical spacing */}
        <div className="flex items-center justify-between mt-10">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-full overflow-hidden mr-3">
              <img src="https://randomuser.me/api/portraits/men/42.jpg" alt="Fleet Manager" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-800">Relevant Fleet</div>
              <div className="text-xs text-gray-500">Fleet Manager</div>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center cursor-pointer border border-gray-200 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
          </div>
        </div>
      </div>
      
      {/* Recent Activity - Moved down with increased margin-top */}
      <div className="px-4 mt-6">
        <div className="mb-3">
          <span className="text-xs text-gray-500">Recent Activity</span>
        </div>
        
        {/* Recent activity items - Updated with color change for second box */}
        {filteredActivities.length > 0 ? (
          filteredActivities.map((activity, index) => {
            const formattedTime = formatTimestamp(activity.timestamp);
            return (
              <div key={`${activity.id}-${index}`} className="mb-3">
                <div className={`${getActivityBoxBgColor(index)} rounded-3xl ${index === 1 ? 'text-white' : ''}`}>
                  <div className="px-4 py-3">
                    <div className="flex justify-between items-center mb-1">
                      <div className={`text-sm font-medium ${index === 1 ? 'text-white' : 'text-gray-800'}`}>
                        {selectedLocation.boxId}
                      </div>
                      {shouldShowViewButton(activity.type) && (
                        <button className="px-3 py-1 bg-[#2A9D8F] text-white text-xs rounded-full">
                          View
                        </button>
                      )}
                    </div>
                    <div>
                      <div className={`text-sm ${index === 1 ? 'text-white' : 'text-gray-700'}`}>{activity.message}</div>
                      <div className={`text-xs ${index === 1 ? 'text-gray-200' : 'text-gray-500'} mt-1`}>
                        {formattedTime.time}, {formattedTime.date}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center text-gray-500 text-sm py-4">
            No recent activity
          </div>
        )}
      </div>
    </div>
  );
};

// Enhanced Professional Notification Panel with Refinements
const NotificationPanel = () => {
  // Add notification state and functionality
  const [notifications, setNotifications] = useState([]);
  const [minimized, setMinimized] = useState(false);
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
  const notificationCount = groupedNotifications[today]?.length || 0;

  // Icon styles
  const getIconForNotificationType = (type) => {
    switch(type) {
      case 'door_status':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"></path>
            <path d="M2 20h20"></path>
            <path d="M14 12v.01"></path>
          </svg>
        );
      case 'item_placement':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          </svg>
        );
      case 'lost_report':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        );
      case 'qr_scan':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <rect x="7" y="7" width="3" height="3"></rect>
            <rect x="14" y="7" width="3" height="3"></rect>
            <rect x="7" y="14" width="3" height="3"></rect>
            <line x1="14" y1="14" x2="17" y2="14"></line>
            <line x1="14" y1="17" x2="17" y2="17"></line>
          </svg>
        );
      default:
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        );
    }
  };

  // Custom scrollbar styles
  const scrollbarStyles = `
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
    }
    
    .custom-scrollbar::-webkit-scrollbar-track {
      background: rgba(20, 20, 20, 0.8);
      border-radius: 3px;
    }
    
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(42, 157, 143, 0.5);
      border-radius: 3px;
    }
    
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: rgba(42, 157, 143, 0.7);
    }
  `;

  return (
    <>
      <style>{scrollbarStyles}</style>
      <div 
        className={`absolute bottom-6 right-6 w-80 rounded-xl shadow-xl overflow-hidden transition-all duration-300 ease-in-out
        ${minimized ? 'h-14' : 'h-auto max-h-[50vh]'}`}
        style={{
          background: 'linear-gradient(to bottom, rgba(22, 22, 22, 0.95), rgba(30, 30, 30, 0.95))',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)'
        }}
      >
        {/* Notification header */}
        <div 
          className="p-3 flex items-center justify-between border-b border-gray-700/50"
          style={{ background: 'rgba(25, 25, 25, 0.9)' }}
        >
          <div className="flex items-center">
            <div 
              className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center"
              style={{ 
                background: 'linear-gradient(135deg, #2A9D8F, #2A9D8F90)'
              }}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="white" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="animate-pulse"
                style={{ 
                  animationDuration: '3s',
                  opacity: notificationCount > 0 ? '1' : '0.7'
                }}
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
            </div>
            <div className="ml-3">
              <div className="text-sm font-medium text-white tracking-wide">Notifications</div>
              <div className="text-xs text-gray-300 font-light">
                {notificationCount > 0 
                  ? `${notificationCount} ${notificationCount === 1 ? 'update' : 'updates'} today` 
                  : 'No new notifications'
                }
              </div>
            </div>
          </div>
          <div className="flex items-center">
            {!minimized ? (
              <button 
                className="w-7 h-7 rounded-full bg-gray-700/50 flex items-center justify-center cursor-pointer transition-all hover:bg-gray-600/50"
                onClick={() => setMinimized(true)}
                title="Minimize"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            ) : (
              <button 
                className="w-7 h-7 rounded-full bg-gray-700/50 flex items-center justify-center cursor-pointer transition-all hover:bg-gray-600/50"
                onClick={() => setMinimized(false)}
                title="Expand"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            )}
          </div>
        </div>
        
        {/* Notifications display with scroll - only visible when not minimized */}
        {!minimized && (
          <div className="max-h-[calc(50vh-3.5rem-3rem)] overflow-y-auto custom-scrollbar" style={{ background: 'rgba(22, 22, 22, 0.95)' }}>
            {Object.entries(groupedNotifications).length > 0 ? (
              Object.entries(groupedNotifications).map(([date, dateNotifications]) => (
                <div key={date} className="mb-1">
                  <div 
                    className="text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-2 sticky top-0 z-10"
                    style={{ 
                      background: 'linear-gradient(to bottom, rgba(25, 25, 25, 0.95), rgba(25, 25, 25, 0.9))',
                      backdropFilter: 'blur(8px)',
                      borderBottom: '1px solid rgba(75, 75, 75, 0.2)'
                    }}
                  >
                    {date}
                  </div>
                  <div className="px-4 py-3 space-y-4">
                    {dateNotifications.map((notification) => (
                      <div 
                        key={notification.id} 
                        className="flex items-start gap-3 rounded-lg transition-all duration-200 bg-[rgba(22,22,22,0.95)]"
                        style={{ 
                          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2)',
                          padding: '10px 12px',
                          borderLeft: '3px solid rgba(42, 157, 143, 0.8)'
                        }}
                      >
                        <div 
                          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: 'rgba(42, 157, 143, 0.15)' }}
                        >
                          <span className="text-[#2A9D8F]">
                            {getIconForNotificationType(notification.type)}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-white leading-snug">
                            {notification.message}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {new Date(notification.timestamp).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: 'numeric',
                              hour12: true
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div 
                className="flex flex-col items-center justify-center py-10 px-4 text-center"
                style={{ minHeight: '12rem' }}
              >
                <div 
                  className="w-16 h-16 mb-4 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(42, 157, 143, 0.1)' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(42, 157, 143, 0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                  </svg>
                </div>
                <p className="text-gray-400 text-sm font-light">
                  No notifications yet
                </p>
                <p className="text-gray-500 text-xs mt-1 font-light">
                  New notifications will appear here
                </p>
              </div>
            )}
          </div>
        )}
        
        {/* Footer with controls - only visible when not minimized */}
        {!minimized && (
          <div 
            className="px-4 py-3 flex items-center justify-between border-t border-gray-700/50"
            style={{ background: 'rgba(25, 25, 25, 0.8)' }}
          >
            <div className="flex space-x-2">
              <button 
                className="flex items-center justify-center text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-700/30"
                title="View all notifications"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <line x1="3" y1="6" x2="3.01" y2="6"></line>
                  <line x1="3" y1="12" x2="3.01" y2="12"></line>
                  <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
                <span className="text-xs">All</span>
              </button>
              
              <button 
                className="flex items-center justify-center text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-700/30"
                title="Mark all as read"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span className="text-xs">Clear</span>
              </button>
            </div>
            
            <button 
              className="text-gray-400 hover:text-white transition-colors"
              title="Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export const Dashboard = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  const [selectedLocation, setSelectedLocation] = useState({
    boxId: 'HN 1507',
    name: 'KBR Park',
    address: 'Road No. 2, Banjara Hills, Hyderabad',
    position: { lat: 17.4163, lng: 78.4265 },
    isActive: true
  });
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef(null);
  
  // State for tracking statistics
  const [activeBoxes, setActiveBoxes] = useState(2);
  const [totalAds, setTotalAds] = useState(40);
  const [totalItems, setTotalItems] = useState(39);
  const [claimedItems, setClaimedItems] = useState(0);
  const [remainingItems, setRemainingItems] = useState(39);
  const [hoveredBoxIndex, setHoveredBoxIndex] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) navigate('/');
    });
    
    // Close notifications dropdown when clicking outside
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    
    // Fetch statistics for the top boxes
    const fetchStatistics = async () => {
      const database = getDatabase();
      const storage = getStorage();
      
      // Count active boxes
      const activeBoxCount = predefinedLocations.filter(loc => loc.isActive).length;
      setActiveBoxes(activeBoxCount);
      
      // Get total ads from storage
      try {
        const mainRef = storageRef(storage, 'missingmatters_videos');
        const mainResult = await listAll(mainRef);
        
        const fetchPromises = mainResult.prefixes.map(async (folderRef) => {
          try {
            const folderContents = await listAll(folderRef);
            return folderContents.items.length;
          } catch (error) {
            return 0;
          }
        });

        const folderCounts = await Promise.all(fetchPromises);
        const adsCount = folderCounts.reduce((sum, count) => sum + count, 0);
        setTotalAds(adsCount || 40); // Fallback to 40 if count is 0
      } catch (error) {
        setTotalAds(40);
      }
      
      // Get items data
      const completeDataRef = ref(database, '/Complete_data');
      onValue(completeDataRef, (snapshot) => {
        if (snapshot.exists()) {
          const completeData = snapshot.val();
          let totalItemsCount = 0;
          let claimedCount = 0;
          let unclaimedCount = 0;

          Object.values(completeData).forEach(boxData => {
            if (typeof boxData === 'object') {
              Object.values(boxData).forEach(entry => {
                if (entry && typeof entry === 'object') {
                  totalItemsCount++;
                  
                  if (entry?.status) {
                    const status = entry.status.toUpperCase();
                    if (status === "CLAIMED") {
                      claimedCount++;
                    } else if (status === "UNCLAIMED") {
                      unclaimedCount++;
                    }
                  }
                }
              });
            }
          });

          setTotalItems(totalItemsCount || 39);
          setClaimedItems(claimedCount || 0);
          setRemainingItems(unclaimedCount || 39);
        }
      });
    };
    
    fetchStatistics();
    
    return () => {
      unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
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
    }
  }, []);

  const handleLogout = useCallback(() => {
    signOut(auth).then(() => navigate("/")).catch(console.error);
  }, [auth, navigate]);

  const handleNavigation = useCallback((path) => {
    navigate(path);
  }, [navigate]);

  return (
    <div className="h-screen bg-white overflow-hidden flex">
      {/* Side Navigation */}
      <div className="w-20 flex flex-col justify-center items-center py-6 space-y-6 bg-white shadow-md">
        <NavButton 
          icon={dashboard} 
          label="Dashboard" 
          active={true} 
          onClick={() => handleNavigation("/dashboard")} 
        />
        <NavButton 
          icon={dataCenter} 
          label="Monitoring" 
          active={false} 
          onClick={() => handleNavigation("/monitoring")} 
        />
        <NavButton 
          icon={futures} 
          label="Ads Console" 
          active={false} 
          onClick={() => handleNavigation("/ads")} 
        />
        <NavButton 
          icon={logout} 
          label="Logout" 
          active={false} 
          onClick={handleLogout} 
        />
      </div>
      
      {/* Status Panel - Replaced Tracking Panel */}
      <StatusPanel selectedLocation={selectedLocation} />
      
      {/* Main Content - Map with top info boxes */}
      <div className="flex-1 relative">
{/* Top info boxes - Styled to match the new reference image */}
<div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-10">
  <div className="bg-white rounded-xl shadow-lg py-3 px-2 flex items-center">
    {/* Box 1 - Active Boxes */}
    <div 
      className={`px-4 py-2 mx-1 transition-colors duration-150 ${hoveredBoxIndex === 0 ? 'bg-gray-50' : ''}`}
      onMouseEnter={() => setHoveredBoxIndex(0)}
      onMouseLeave={() => setHoveredBoxIndex(null)}
    >
      <div className="text-xs text-gray-500">Active Boxes</div>
      <div className="text-base font-medium">{activeBoxes}</div>
    </div>
    
    {/* Box 2 - Total Ads */}
    <div 
      className={`px-4 py-2 mx-1 transition-colors duration-150 ${hoveredBoxIndex === 1 ? 'bg-gray-50' : ''}`}
      onMouseEnter={() => setHoveredBoxIndex(1)}
      onMouseLeave={() => setHoveredBoxIndex(null)}
    >
      <div className="text-xs text-gray-500">Total Ads</div>
      <div className="text-base font-medium">{totalAds}</div>
    </div>
    
    {/* Box 3 - Total Items */}
    <div 
      className={`px-4 py-2 mx-1 transition-colors duration-150 ${hoveredBoxIndex === 2 ? 'bg-gray-50' : ''}`}
      onMouseEnter={() => setHoveredBoxIndex(2)}
      onMouseLeave={() => setHoveredBoxIndex(null)}
    >
      <div className="text-xs text-gray-500">Total Items</div>
      <div className="text-base font-medium">{totalItems}</div>
    </div>
    
    {/* Box 4 - Claimed Items */}
    <div 
      className={`px-4 py-2 mx-1 transition-colors duration-150 ${hoveredBoxIndex === 3 ? 'bg-gray-50' : ''}`}
      onMouseEnter={() => setHoveredBoxIndex(3)}
      onMouseLeave={() => setHoveredBoxIndex(null)}
    >
      <div className="text-xs text-gray-500">Claimed Items</div>
      <div className="text-base font-medium">{claimedItems}</div>
    </div>
    
    {/* Box 5 - Remaining Items */}
    <div 
      className={`px-4 py-2 mx-1 transition-colors duration-150 ${hoveredBoxIndex === 4 ? 'bg-gray-50' : ''}`}
      onMouseEnter={() => setHoveredBoxIndex(4)}
      onMouseLeave={() => setHoveredBoxIndex(null)}
    >
      <div className="text-xs text-gray-500">Remaining Items</div>
      <div className="text-base font-medium">{remainingItems}</div>
    </div>
    
    {/* Box 6 - Power Consumption */}
    <div 
      className={`px-4 py-2 mx-1 transition-colors duration-150 ${hoveredBoxIndex === 5 ? 'bg-gray-50' : ''}`}
      onMouseEnter={() => setHoveredBoxIndex(5)}
      onMouseLeave={() => setHoveredBoxIndex(null)}
    >
      <div className="text-xs text-gray-500">Power Consumption</div>
      <div className="text-base font-medium">1.5 kWh</div>
    </div>
    
    {/* Box 7 - Solar Power */}
    <div 
      className={`px-4 py-2 mx-1 transition-colors duration-150 ${hoveredBoxIndex === 6 ? 'bg-gray-50' : ''}`}
      onMouseEnter={() => setHoveredBoxIndex(6)}
      onMouseLeave={() => setHoveredBoxIndex(null)}
    >
      <div className="text-xs text-gray-500">Solar Power</div>
      <div className="text-base font-medium">6.24 kWh</div>
    </div>
  </div>
</div>
        
        {/* Map */}
        <div className="h-full w-full bg-white">
          {isLoaded && (
            <Map 
              onLocationSelect={handleLocationSelect}
              selectedLocation={selectedLocation}
            />
          )}
        </div>
        
        {/* Enhanced Professional Notification Panel with all refinements */}
        <NotificationPanel />
      </div>
    </div>
  );
};

export default Dashboard;