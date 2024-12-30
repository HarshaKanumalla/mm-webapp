import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleMap, useLoadScript, MarkerF, OverlayView } from "@react-google-maps/api";
import { getDatabase, ref, onValue, get } from "firebase/database";
import { getAuth, signOut } from "firebase/auth";
import { getStorage, ref as storageRef, listAll } from "firebase/storage";

// Import all icons as a module
import dashboard from "./dashboard.png";
import dataCenter from "./data-center.png";
import futures from "./futures.png";
import notification from "./notification.png";
import logout from "./logout.png";
import tasks from "./tasks.png";

const containerStyle = {
  width: "100%",
  height: "100%",
  borderRadius: "25px",
};

  // Updated predefined locations with all locations and box IDs
  const predefinedLocations = [
    { 
      id: 'himayatnagar',
      boxId: 'HN1506',
      name: 'Himayath Nagar',
      address: 'Liberty Road, Himayatnagar, Hyderabad',
      position: { lat: 17.4026, lng: 78.4854 },
      isActive: false
    },
    {
      id: 'kbr',
      boxId: 'HN1507',
      name: 'KBR Park',
      address: 'Road No. 2, Banjara Hills, Hyderabad',
      position: { lat: 17.4163, lng: 78.4265 },
      isActive: false
    },
    {
      id: 'charminar',
      boxId: 'HN1508',
      name: 'Charminar',
      address: 'Charminar Road, Ghansi Bazaar, Hyderabad',
      position: { lat: 17.3616, lng: 78.4747 },
      isActive: false
    },
    {
      id: 'secretariat',
      boxId: 'HN1509',
      name: 'Secretariat Bus Stop',
      address: 'Tank Bund Road, Secretariat, Hyderabad',
      position: { lat: 17.4094, lng: 78.4742 },
      isActive: false
    },
    {
      id: 'tankbund',
      boxId: 'HN1510',
      name: 'Tank Bund',
      address: 'Tank Bund Road, Lower Tank Bund, Hyderabad',
      position: { lat: 17.4239, lng: 78.4738 },
      isActive: false
    },
    {
      id: 'parkHyatt',
      boxId: 'HN1511',
      name: 'Park Hyatt',
      address: 'Road No. 2, Banjara Hills, Hyderabad',
      position: { lat: 17.4225, lng: 78.4458 },
      isActive: false
    },
    {
      id: 'kachiguda',
      boxId: 'HN1512',
      name: 'Kachiguda Railway Station',
      address: 'Kachiguda Station Road, Kachiguda, Hyderabad',
      position: { lat: 17.4027, lng: 78.5123 },
      isActive: false
    },
    {
      id: 'koti',
      boxId: 'HN1513',
      name: 'Koti Bus Stop',
      address: 'Koti Main Road, Koti, Hyderabad',
      position: { lat: 17.3825, lng: 78.4775 },
      isActive: false
    },
    {
      id: 'mgbs',
      boxId: 'HN1514',
      name: 'MGBS Bus Station',
      address: 'MGBS Road, Gowliguda, Hyderabad',
      position: { lat: 17.3784, lng: 78.4815 },
      isActive: false
    },
    {
      id: 'jbs',
      boxId: 'HN1515',
      name: 'Jubilee Bus Station',
      address: 'JBS Road, Secunderabad, Hyderabad',
      position: { lat: 17.4547, lng: 78.4989 },
      isActive: false
    }
  ];

const StatisticCard = ({ title, value, isLoading, isDark }) => (
  <div className={`flex flex-col justify-between ${isDark ? 'bg-[#1e1e1e]' : 'bg-white'} p-4 rounded-[25px] h-[130px] transition-all duration-300`}>
    <span className={`${isDark ? 'text-[#858080]' : 'text-gray-600'} text-sm font-normal`}>{title}</span>
    <div className="flex justify-end">
      <span className={`text-5xl font-semibold ${isDark ? 'text-[#858080]' : 'text-gray-600'}`}>
        {isLoading ? (
          <div className={`animate-pulse w-16 h-12 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded`} />
        ) : (
          value
        )}
      </span>
    </div>
  </div>
);

const SidebarItem = ({ icon, label, onClick, isDark }) => (
  <div
    className={`flex items-center gap-4 px-4 py-2 rounded-[25px] w-full ${
      isDark ? 'hover:bg-[#3a3939]' : 'hover:bg-gray-100'
    } cursor-pointer transition-colors duration-200`}
    onClick={onClick}
  >
    <img src={icon} alt={label} className="w-6 h-6" />
    <span className={isDark ? 'text-[#858080]' : 'text-gray-600'}>{label}</span>
  </div>
);

// Map component defined outside of Dashboard
const Map = React.memo(({ onLocationSelect, selectedLocation, isDark }) => {
  const center = useMemo(() => ({ lat: 17.3850, lng: 78.4867 }), []);

  const mapOptions = useMemo(() => ({
    streetViewControl: false,
    mapTypeControl: false,
    disableDefaultUI: true,
    styles: isDark ? [
      { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
      { featureType: "transit", elementType: "geometry", stylers: [{ visibility: "off" }] },
      { featureType: "poi", stylers: [{ visibility: "off" }] }
    ] : [
      { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
      { featureType: "transit", elementType: "geometry", stylers: [{ visibility: "off" }] },
      { featureType: "poi", stylers: [{ visibility: "off" }] }
    ]
  }), [isDark]);

  const handleMarkerClick = useCallback((location) => {
    onLocationSelect(location);
  }, [onLocationSelect]);

  const markerIcon = useCallback((isActive) => ({
    url: `data:image/svg+xml,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
        <path fill="${isActive ? '#339265' : '#A14342'}" stroke="${isActive ? '#339265' : '#A14342'}" stroke-width="1.2"
          d="M12 0C7.6 0 4 3.6 4 8c0 4.4 8 16 8 16s8-11.6 8-16c0-4.4-3.6-8-8-8zm0 11.5c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4z"/>
          <circle cx="12" cy="7.5" r="4" fill="none"/>
      </svg>
    `)}`,
    scaledSize: new window.google.maps.Size(32, 32),
    anchor: new window.google.maps.Point(16, 32)
  }), []);

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={12}
      options={mapOptions}
    >
      {predefinedLocations.map((location, index) => (
        <React.Fragment key={index}>
          <MarkerF
            position={location.position}
            onClick={() => handleMarkerClick(location)}
            options={{
              icon: markerIcon(location.isActive)
            }}
          />
{selectedLocation?.boxId === location.boxId && (
  <OverlayView
    position={location.position}
    mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    getPixelPositionOffset={(width, height) => ({
      x: 32, // Offset from marker horizontally
      y: -height / 2 // Center vertically
    })}
  >
    <div
      style={{
        backgroundColor: isDark ? '#ffffff' : '#2c2c2c',
        padding: '12px',
        borderRadius: '8px',
        boxShadow: '0 2px 7px 1px rgba(0, 0, 0, 0.3)',
        minWidth: '210px',
        maxWidth: '210px',
        fontFamily: 'Montserrat, sans-serif'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onLocationSelect(null);
          }}
          className={`absolute -top-1 right-0 w-6 h-6 flex items-center justify-center rounded-full font-medium
            ${isDark ? 'text-gray-600 hover:text-gray-800' : 'text-gray-400 hover:text-gray-200'}`}
        >
          ×
        </button>
        <div className="space-y-2">
          <h3 className={`text-base font-medium ${isDark ? 'text-gray-900' : 'text-white'}`}>
            {location.boxId}
          </h3>
          <p className={`text-sm ${isDark ? 'text-gray-700' : 'text-gray-300'}`}>
            {location.name}
          </p>
          <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
            {location.address}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <div className={`w-2 h-2 rounded-full ${location.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className={`text-xs ${location.isActive ? 'text-green-500' : 'text-red-500'}`}>
              {location.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>
    </div>
  </OverlayView>
          )}
        </React.Fragment>
      ))}
    </GoogleMap>
  );
});


export const Dashboard = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  const storage = getStorage();
  const database = getDatabase();
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [isDark, setIsDark] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [boxLocations, setBoxLocations] = useState([]);
  const [mapCenter] = useState({ lat: 17.3850, lng: 78.4867 });
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [zoom] = useState(12);

  const [statistics, setStatistics] = useState({
    totalAdsRunning: 0,
    itemsClaimed: 0,
    itemsRemaining: 0
  });

  // Theme toggle handler
  const toggleTheme = useCallback(() => {
    setIsDark(prevTheme => !prevTheme);
  }, []);

  // Navigation items
  const navigationItems = useMemo(() => [
    { icon: futures, label: "Dashboard", path: "/dashboard" },
    { icon: dataCenter, label: "MM Ads", path: "/ads" },
    { icon: dashboard, label: "Monitoring", path: "/monitoring" },
    { icon: notification, label: "Notifications", path: "/notifications" },
    { icon: tasks, label: "Access", path: "/access" }
  ], []);

  // Verify authentication status
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate('/');
      }
    });

    return () => unsubscribe();
  }, [auth, navigate]);

  // Fetch total ads running
  useEffect(() => {
    const fetchTotalAds = async () => {
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
        
        setStatistics(prev => ({
          ...prev,
          totalAdsRunning: totalCount
        }));
      } catch (error) {
        console.error("Error fetching total ads:", error);
      }
    };

    fetchTotalAds();
  }, [storage, auth]);

  // Fetch claimed and unclaimed items
  useEffect(() => {
    const completeDataRef = ref(database, '/Complete_data');
    
    const processStatusData = (snapshot) => {
      if (!snapshot.exists()) {
        setIsLoading(false);
        return;
      }

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

      setStatistics(prev => ({
        ...prev,
        itemsClaimed: claimedCount,
        itemsRemaining: unclaimedCount
      }));
      setIsLoading(false);
    };

  const unsubscribe = onValue(completeDataRef, processStatusData, (error) => {
      console.error("Error fetching status data:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [database]);

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
    libraries: ['marker']
  });

  const handleLocationSelect = useCallback((location) => {
    setSelectedLocation(location);
  }, []);

  const handleLogout = useCallback(() => {
    signOut(auth).then(() => navigate("/")).catch(console.error);
  }, [auth, navigate]);

  return (
    <div className="flex h-screen bg-black p-4 gap-4">
      {/* Sidebar */}
      <div className={`w-[240px] h-full flex flex-col items-start ${isDark ? 'bg-[#1e1e1e]' : 'bg-white'} rounded-[25px] p-6`}>
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="bg-[#2a2929] w-[100px] h-[100px] flex items-center justify-center rounded-full mb-8 self-center hover:bg-[#3a3939] transition-colors duration-300 cursor-pointer"
        >
          <span className="text-4xl font-semibold text-[#858080]">MM</span>
        </button>

        <div className="flex flex-col gap-2 text-base font-normal w-full pl-6 mt-6">
          {navigationItems.map((item, index) => (
            <SidebarItem
              key={index}
              icon={item.icon}
              label={item.label}
              onClick={() => item.path && navigate(item.path)}
              isDark={isDark}
            />
          ))}
        </div>

        <div
          className="flex items-center gap-4 mt-auto w-full pl-6 hover:bg-[#3a3939] rounded-[25px] px-4 py-2 cursor-pointer"
          onClick={handleLogout}
        >
          <img src={logout} alt="Logout" className="w-6 h-6" />
          <span className="text-[#858080]">Log Out</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex-1 h-[82%] rounded-[25px] overflow-hidden">
          {!isLoaded ? (
            <div className="w-full h-full flex items-center justify-center bg-[#1e1e1e] rounded-[25px]">
              <span className="text-[#858080]">Loading map...</span>
            </div>
          ) : (
            <Map onLocationSelect={handleLocationSelect} selectedLocation={selectedLocation} isDark={isDark} />
          )}
          </div>


        {/* Statistics Section */}
        <div className="grid grid-cols-4 gap-4">
          <StatisticCard
            title="Total Boxes"
            value={predefinedLocations.length}
            isLoading={isLoading}
            isDark={isDark}
          />
          <StatisticCard
            title="Total Ads Running"
            value={statistics.totalAdsRunning}
            isLoading={isLoading}
            isDark={isDark}
          />
          <StatisticCard
            title="Items Claimed"
            value={statistics.itemsClaimed}
            isLoading={isLoading}
            isDark={isDark}
          />
          <StatisticCard
            title="Items Remaining"
            value={statistics.itemsRemaining}
            isLoading={isLoading}
            isDark={isDark}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;