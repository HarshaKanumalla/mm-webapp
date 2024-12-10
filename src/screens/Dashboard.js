import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleMap, useLoadScript, Marker, InfoWindow } from "@react-google-maps/api";
import { getDatabase, ref, onValue, get } from "firebase/database";
import { getAuth, signOut } from "firebase/auth";
import { getStorage, ref as storageRef, listAll } from "firebase/storage";

// Import all icons as a module to prevent loading issues
import dashboard from "./dashboard.png";
import dataCenter from "./data-center.png";
import futures from "./futures.png";
import lineChart from "./line-chart.png";
import logout from "./logout.png";
import tasks from "./tasks.png";

// Separate components for better organization
const StatisticCard = ({ title, value, isLoading }) => (
  <div className="flex flex-col justify-between bg-[#1e1e1e] p-4 rounded-[25px] h-[130px] transition-all duration-300">
    <span className="text-[#858080] text-sm font-normal">{title}</span>
    <div className="flex justify-end">
      <span className="text-5xl font-semibold text-[#858080]">
        {isLoading ? (
          <div className="animate-pulse w-16 h-12 bg-gray-700 rounded" />
        ) : (
          value
        )}
      </span>
    </div>
  </div>
);

const SidebarItem = ({ icon, label, onClick }) => (
  <div
    className="flex items-center gap-4 px-4 py-2 rounded-[25px] w-full hover:bg-[#3a3939] cursor-pointer transition-colors duration-200"
    onClick={onClick}
  >
    <img src={icon} alt={label} className="w-6 h-6" />
    <span>{label}</span>
  </div>
);

export const Dashboard = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  const storage = getStorage();
  const database = getDatabase();

  const [isLoading, setIsLoading] = useState(true);
  const [boxLocations, setBoxLocations] = useState([]);
  const [mapCenter, setMapCenter] = useState({ lat: 17.4065, lng: 78.4772 });
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [statistics, setStatistics] = useState({
    totalAdsRunning: 0,
    itemsClaimed: 0,
    itemsRemaining: 0
  });

  // Optimized location data fetching
  useEffect(() => {
    const fetchLocations = async () => {
      const dbRef = ref(database);
      try {
        const snapshot = await get(dbRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          const locations = Object.entries(data)
            .filter(([key]) => key !== 'Complete_data') // Exclude Complete_data node
            .map(([id, deviceData]) => {
              if (deviceData.latitude && deviceData.longitude) {
                const latitude = parseFloat(deviceData.latitude);
                const longitude = parseFloat(deviceData.longitude);
                
                if (!isNaN(latitude) && !isNaN(longitude)) {
                  return {
                    id,
                    device_name: deviceData.device_name,
                    position: { lat: latitude, lng: longitude }
                  };
                }
              }
              return null;
            })
            .filter(Boolean);

          setBoxLocations(locations);
          if (locations.length > 0) {
            setMapCenter(locations[0].position);
          }
        }
      } catch (error) {
        console.error("Error fetching locations:", error);
      }
    };

    fetchLocations();
    return () => {};
  }, [database]);

  // Optimized ads count fetching with batch processing
  useEffect(() => {
    const fetchAdsCount = async () => {
      if (boxLocations.length === 0) return;
      
      try {
        const promises = boxLocations.map(box => {
          const adsRef = storageRef(storage, `missingmatters_videos/${box.device_name}`);
          return listAll(adsRef);
        });

        const results = await Promise.all(promises);
        const totalAds = results.reduce((sum, result) => sum + result.items.length, 0);
        
        setStatistics(prev => ({ ...prev, totalAdsRunning: totalAds }));
      } catch (error) {
        console.error("Error fetching ads count:", error);
      }
    };

    fetchAdsCount();
  }, [boxLocations, storage]);

  // Optimized status counting with real-time updates
  useEffect(() => {
    const completeDataRef = ref(database, 'Complete_data');
    
    const processCompleteData = (snapshot) => {
      if (!snapshot.exists()) return;

      const completeData = snapshot.val();
      let claimedCount = 0;
      let unclaimedCount = 0;

      Object.values(completeData).forEach(boxData => {
        Object.values(boxData).forEach(entry => {
          if (entry.status === "CLAIMED") claimedCount++;
          else if (entry.status === "UNCLAIMED") unclaimedCount++;
        });
      });

      setStatistics(prev => ({
        ...prev,
        itemsClaimed: claimedCount,
        itemsRemaining: unclaimedCount
      }));
      setIsLoading(false);
    };

    const unsubscribe = onValue(completeDataRef, processCompleteData, (error) => {
      console.error("Error fetching complete data:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [database]);

  // Memoized navigation items
  const navigationItems = useMemo(() => [
    { icon: futures, label: "Dashboard", path: "/dashboard" },
    { icon: dataCenter, label: "MM Ads", path: "/ads" },
    { icon: dashboard, label: "Monitoring", path: "/monitoring" },
    { icon: lineChart, label: "Analytics", path: "" },
    { icon: tasks, label: "Access", path: "" }
  ], []);

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY
  });

  const handleLogout = useCallback(() => {
    signOut(auth).then(() => navigate("/")).catch(console.error);
  }, [auth, navigate]);

  return (
    <div className="flex h-screen bg-black p-4 gap-4">
      {/* Sidebar */}
      <div className="w-[240px] h-full flex flex-col items-start bg-[#1e1e1e] rounded-[25px] p-6">
        <div className="bg-[#2a2929] w-[100px] h-[100px] flex items-center justify-center rounded-full mb-8 self-center">
          <span className="text-4xl font-semibold text-[#858080]">MM</span>
        </div>

        <div className="flex flex-col gap-2 text-[#858080] text-base font-normal w-full pl-6 mt-6">
          {navigationItems.map((item, index) => (
            <SidebarItem
              key={index}
              icon={item.icon}
              label={item.label}
              onClick={() => item.path && navigate(item.path)}
            />
          ))}
        </div>

        <div
          className="flex items-center gap-4 mt-auto text-[#858080] w-full pl-6 hover:bg-[#3a3939] rounded-[25px] px-4 py-2 cursor-pointer"
          onClick={handleLogout}
        >
          <img src={logout} alt="Logout" className="w-6 h-6" />
          <span>Log Out</span>
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
            <GoogleMap
              mapContainerStyle={{
                width: "100%",
                height: "100%",
                borderRadius: "25px",
              }}
              center={mapCenter}
              zoom={12}
              options={{
                styles: [
                  { featureType: "all", elementType: "labels", stylers: [{ visibility: "off" }] },
                  { featureType: "administrative.locality", elementType: "labels.text", stylers: [{ visibility: "on" }] },
                  { featureType: "administrative.neighborhood", elementType: "labels.text", stylers: [{ visibility: "on" }] },
                  { featureType: "road", elementType: "geometry", stylers: [{ visibility: "simplified" }] },
                  { featureType: "poi", stylers: [{ visibility: "off" }] },
                  { featureType: "transit", stylers: [{ visibility: "off" }] }
                ],
                disableDefaultUI: true,
                zoomControl: true
              }}
            >
              {boxLocations.map((box) => (
                <React.Fragment key={box.id}>
                  <Marker
                    position={box.position}
                    onClick={() => setSelectedMarker(box)}
                  />
                  {selectedMarker?.id === box.id && (
                    <InfoWindow
                      position={box.position}
                      onCloseClick={() => setSelectedMarker(null)}
                    >
                      <div className="bg-white bg-opacity-20 backdrop-blur-lg rounded-lg p-4 border border-white border-opacity-30 shadow-lg">
                        <div className="text-black space-y-2">
                          <p className="font-semibold">Box ID: {box.id}</p>
                          <p>Location: {box.position.lat.toFixed(6)}, {box.position.lng.toFixed(6)}</p>
                        </div>
                      </div>
                    </InfoWindow>
                  )}
                </React.Fragment>
              ))}
            </GoogleMap>
          )}
        </div>

        {/* Statistics Section */}
        <div className="grid grid-cols-4 gap-4">
          <StatisticCard
            title="Total Boxes"
            value={boxLocations.length}
            isLoading={isLoading}
          />
          <StatisticCard
            title="Total Ads Running"
            value={statistics.totalAdsRunning}
            isLoading={isLoading}
          />
          <StatisticCard
            title="Items Claimed"
            value={statistics.itemsClaimed}
            isLoading={isLoading}
          />
          <StatisticCard
            title="Items Remaining"
            value={statistics.itemsRemaining}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;