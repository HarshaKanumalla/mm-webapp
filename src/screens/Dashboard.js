import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, useLoadScript, MarkerF } from '@react-google-maps/api';
import { getDatabase, ref, onValue, push } from 'firebase/database';
import { getAuth, signOut } from 'firebase/auth';
import { getStorage, ref as storageRef, listAll } from 'firebase/storage';
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, LineChart, Line } from 'recharts';

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

// Dropdown Component
const Dropdown = ({ label, icon, chevronIcon }) => (
  <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 border border-gray-200 cursor-pointer">
    {icon && <img src={icon} alt="" className="w-5 h-5" />}
    <span className="text-gray-600 text-sm">{label}</span>
    <img src={chevronIcon} alt="" className="w-4 h-4" />
  </div>
);

// Search Component
const SearchBar = () => (
  <div className="relative">
    <input 
      type="text" 
      placeholder="Search" 
      className="w-full bg-white rounded-full px-4 py-2 pl-10 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#2A9D8F]"
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

// Box Details Component
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

// AdsRunningCard Component
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
    <div className="bg-gray-800 bg-opacity-80 rounded-2xl p-4 shadow-md h-full">
      <div className="flex justify-between items-start">
        <p className="text-xs text-gray-300 uppercase font-medium">ADS RUNNING</p>
      </div>
      <div className="mt-2">
        <span className="text-4xl font-light text-white">{totalAds}</span>
      </div>
      <div className="flex items-end h-[60%] w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={adsData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2A9D8F" stopOpacity={0.8} />
                <stop offset="90%" stopColor="#2A9D8F" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#2A9D8F" 
              fill="url(#colorGradient)" 
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// TotalBoxesCard Component
const TotalBoxesCard = () => {
  return (
    <div className="bg-white bg-opacity-90 rounded-2xl p-4 shadow-md h-full">
      <div className="flex justify-between items-start">
        <p className="text-xs text-gray-600 uppercase font-medium">TOTAL BOXES</p>
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
              stroke="#2A9D8F"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray="200 315"
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
            <span className="text-4xl font-medium text-[#2A9D8F]">15</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ClaimedRemainingCard Component - Using original functionality
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
    <div className="bg-gray-800 bg-opacity-80 rounded-2xl p-4 shadow-md h-full">
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

// AdInteractionsCard Component - Using the metrics box code from reference
const AdInteractionsCard = () => {
  // Sample data for AD INTERACTIONS
  const sampleData = [800, 600, 1506, 1200, 950, 1300, 1100];
  const total = 1506;
  
  return (
    <div 
      className="bg-gray-800 bg-opacity-80 rounded-2xl p-4 shadow-md h-full"
    >
      <div className="p-2 h-full flex flex-col">
        <h2 className="text-xs text-gray-300 uppercase font-medium mb-2">
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
                      index === 2 ? 'bg-[#2A9D8F]' : 'bg-[#F9B872]'
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

// Energy Info Component
const EnergyInfo = () => {
  return (
    <div className="relative rounded-2xl overflow-hidden h-full">
      <img 
        src={require('./solar-panel.jpg')} 
        alt="Solar Panel" 
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 flex items-end p-4">
        <div className="text-white">
          <div className="text-5xl font-semibold">3.6</div>
          <div className="text-sm">kWh</div>
        </div>
      </div>
    </div>
  );
};

// Small Metric Cards
const EnergyMetricCard = () => {
  return (
    <div className="bg-[#F9B872] rounded-2xl p-4 h-full">
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

// Map Component - Using original map code
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
  const [selectedLocation, setSelectedLocation] = useState({
    boxId: 'HN 1507',
    name: 'SmartBox HN 1507',
    address: 'Road No 2, Banjara Hills, Hyderabad',
    position: { lat: 17.4163, lng: 78.4265 }
  });
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef(null);

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
    <div className="h-screen bg-white overflow-hidden">
      {/* Top Navigation Bar */}
      <div className="px-6 py-3 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-2">
          <img src={mmlogo} alt="Missing Matters" className="w-10 h-10" />
          <h1 className="text-2xl font-semibold text-[#2A9D8F]">Missing Matters</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <Dropdown label="Location" icon={locationIcon} chevronIcon={chevronDown} />
          <Dropdown label="Smart Box" icon={smartboxIcon} chevronIcon={chevronDown} />
          <div className="w-64">
            <SearchBar />
          </div>
          <div className="relative" ref={notificationRef}>
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <img src={notification} alt="Notifications" className="w-5 h-5" />
            </div>
            
            {/* Notifications Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-lg z-50 max-h-[500px] overflow-y-auto">
                <NotificationBox />
              </div>
            )}
          </div>
          <div className="w-10 h-10 rounded-full overflow-hidden">
            <img 
              src="https://randomuser.me/api/portraits/men/32.jpg" 
              alt="User Profile" 
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>
      
      <div className="flex h-[calc(100vh-60px)]">
        {/* Side Navigation */}
        <div className="w-20 flex flex-col justify-center items-center py-6 space-y-6 bg-white">
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
        
        {/* Main Content */}
        <div className="flex-1 p-6">
          <div className="grid grid-cols-12 gap-4 h-full">
            {/* Map Section with overlapped metric cards */}
            <div className="col-span-8 relative mb-20">
              {/* Map */}
              <div className="rounded-2xl overflow-hidden shadow-md bg-white h-[480px]">
                {isLoaded && (
                  <Map 
                    onLocationSelect={handleLocationSelect}
                    selectedLocation={selectedLocation}
                  />
                )}
              </div>
              
              {/* Overlapped Metric Cards */}
              <div className="absolute bottom-0 left-0 right-0 grid grid-cols-3 gap-4 px-4 transform translate-y-1/3">
                <div className="h-36">
                  <AdsRunningCard />
                </div>
                <div className="h-36">
                  <TotalBoxesCard />
                </div>
                <div className="h-36">
                  <ClaimedRemainingCard />
                </div>
              </div>
            </div>
            
            {/* Right Column */}
            <div className="col-span-4 grid grid-rows-12 gap-4 h-[600px]">
              {/* Box Details - 4/12 of the height */}
              <div className="row-span-4">
                <BoxDetails boxData={selectedLocation} />
              </div>
              
              {/* Energy Info - 3/12 of the height */}
              <div className="row-span-3">
                <EnergyInfo />
              </div>
              
              {/* Small Metric Cards - 2/12 of the height */}
              <div className="row-span-2 grid grid-cols-2 gap-4">
                <EnergyMetricCard />
                <InteractionsMetricCard />
              </div>
              
              {/* Ad Interactions Card - 3/12 of the height */}
              <div className="row-span-3">
                <AdInteractionsCard />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;