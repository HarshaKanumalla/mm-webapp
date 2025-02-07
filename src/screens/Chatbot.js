import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth, signOut } from 'firebase/auth';
import { ref, onValue, update } from 'firebase/database';
import { database } from '../firebase';
// Image imports
import mmlogo from './mmlogo.png';
import dashboard from "./dashboard.png";
import dataCenter from "./data-center.png";
import futures from "./futures.png";
import lineChart from "./line-chart.png";
import tasks from "./tasks.png";
import logout from "./logout.png";
import uploadCircle from "./upload-circle.png";
import bellIcon from "./bell-icon.png";
import boxImportant from "./box-important.png";

const generateClaimCode = () => {
  const timestamp = Date.now().toString();
  const random = Math.random().toString();
  const hash = crypto.SHA256(timestamp + random);
  return hash.toString().substring(0, 6).toUpperCase();
};

const ProgressIndicator = ({ report }) => {
  const stages = [
    { label: 'Chatbot response received', timestamp: report.timestamp }, // Using report.timestamp since that's when the response was received
    { label: 'Potential match found', timestamp: report.matchFoundTimestamp },
    { label: 'User notified & code generated', timestamp: report.codeGeneratedTimestamp },
    { label: 'Code matched & door opened', timestamp: report.doorOpenedTimestamp },
    { label: 'Item claimed successfully', timestamp: report.claimedTimestamp }
  ];

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
      day: 'numeric',
      month: 'short'
    }).format(new Date(timestamp));
  };

  const getCurrentStage = () => {
    if (report.status === 'CLAIMED') return 4;
    if (report.doorOpened) return 3;
    if (report.codeGenerated) return 2;
    if (report.matchFound) return 1;
    return 0; // First stage is always complete since row exists
  };

  const stage = getCurrentStage();

  return (
    <div className="flex justify-between items-center w-full px-8 py-4">
      {stages.map((stageInfo, index) => (
        <div key={index} className="flex flex-col items-center">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 
            ${index <= stage ? 'bg-teal-500 border-teal-500' : 'border-gray-300'}`}>
            {index <= stage && (
              <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <span className="text-xs text-gray-600 text-center mt-2">{stageInfo.label}</span>
          {index <= stage && stageInfo.timestamp && (
            <span className="text-xs text-gray-500 mt-1">{formatTimestamp(stageInfo.timestamp)}</span>
          )}
        </div>
      ))}
    </div>
  );
};

const TableRow = ({ report, isExpanded, onToggle, onImageClick }) => {
  const [potentialMatches, setPotentialMatches] = useState(0);
  const [responseData, setResponseData] = useState(null);
  
  useEffect(() => {
    // Listen to WhatsApp responses for this report
    const responseRef = ref(database, `responses/${report.referenceNumber}`);
    
    const unsubscribe = onValue(responseRef, (snapshot) => {
      if (snapshot.exists()) {
        const response = snapshot.val();
        setResponseData(response);
        
        // Update the report in Firebase with response status if not already updated
        const reportRef = ref(database, `lost_reports/${report.id}`);
        
        // If there's a response and it has a code, update multiple fields
        if (response.code) {
          update(reportRef, {
            response: true,
            responseTimestamp: response.timestamp || Date.now(),
            matchFound: true,
            matchFoundTimestamp: Date.now(),
            codeGenerated: true,
            codeGeneratedTimestamp: Date.now(),
            claimCode: response.code
          });
          setPotentialMatches(1);
        } else {
          // If there's just a response but no code yet
          update(reportRef, {
            response: true,
            responseTimestamp: response.timestamp || Date.now()
          });
          setPotentialMatches(0);
        }
      }
    });

    return () => unsubscribe();
  }, [report.id, report.referenceNumber]);

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
      day: 'numeric',
      month: 'short'
    }).format(date);
  };

  return (
    <div className="border-b border-gray-200">
      <div className="flex items-center px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={onToggle}>
        <div className="w-[12%] flex justify-center">{report.referenceNumber}</div>
        <div className="w-[15%] flex flex-col items-center">
          <div>{report.name}</div>
          <div className="text-sm text-gray-500">{report.phone}</div>
        </div>
        <div className="w-[30%] flex items-center pl-4">
          {report.image && report.image !== '-' ? (
            <>
              <img 
                src={report.image}
                alt="Item" 
                className="w-10 h-10 rounded-md object-cover cursor-pointer hover:opacity-80"
                onClick={(e) => {
                  e.stopPropagation();
                  onImageClick(report.image);
                }}
              />
              <div className="ml-3">
                <div className="text-sm text-gray-500">{formatTimestamp(report.timestamp)}</div>
                <div>{report.description}</div>
                <div className="text-sm text-gray-500">{report.location}</div>
              </div>
            </>
          ) : (
            <div className="ml-3">
              <div className="text-sm text-gray-500">{formatTimestamp(report.timestamp)}</div>
              <div>{report.description}</div>
              <div className="text-sm text-gray-500">{report.location}</div>
            </div>
          )}
        </div>
        <div className="w-[15%] flex items-center justify-center">
          {potentialMatches.length > 0 ? (
            <span className="text-teal-500">{potentialMatches.length} matches</span>
          ) : (
            <span>-</span>
          )}
        </div>
        <div className="w-[15%] flex justify-center">{report.claimCode || '-'}</div>
        <div className="w-[10%] flex justify-center">
          <span className={`px-4 py-2 rounded-full text-white text-xs 
            ${report.status === 'CLAIMED' ? 'bg-teal-500' : 'bg-[#A14342]'}`}>
            {report.status}
          </span>
        </div>
      </div>
      
      {isExpanded && (
        <div className="bg-gray-50 px-4 py-6 transition-all duration-300">
          <ProgressIndicator report={report} />
        </div>
      )}
    </div>
  );
};

export const Chatbot = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  const [selectedImage, setSelectedImage] = useState(null);
  const [lostReports, setLostReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState(null);

  useEffect(() => {
    const lostReportsRef = ref(database, 'lost_reports');
    
    const unsubscribe = onValue(lostReportsRef, (snapshot) => {
      if (!snapshot.exists()) {
        setLostReports([]);
        setIsLoading(false);
        return;
      }
      
      try {
        const data = snapshot.val();
        const processedReports = Object.entries(data).map(([key, report]) => ({
          id: key,
          referenceNumber: report.referenceNumber,
          name: report.name || '-',
          phone: report.phone || '-',
          description: report.description || '-',
          location: report.location || '-',
          image: report.image || '-',
          timestamp: report.timestamp,
          claimCode: report.claimCode || '-',
          status: report.status || 'UNCLAIMED',
          chatbotResponse: report.chatbotResponse || false,
          chatbotResponseTimestamp: report.chatbotResponseTimestamp,
          matchFound: report.matchFound || false,
          matchFoundTimestamp: report.matchFoundTimestamp,
          codeGenerated: report.codeGenerated || false,
          codeGeneratedTimestamp: report.codeGeneratedTimestamp,
          doorOpened: report.doorOpened || false,
          doorOpenedTimestamp: report.doorOpenedTimestamp,
          claimedTimestamp: report.claimedTimestamp
        })).sort((a, b) => b.timestamp - a.timestamp);

        setLostReports(processedReports);
      } catch (error) {
        console.error('Error processing reports:', error);
        setLostReports([]);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = () => {
    signOut(auth)
      .then(() => navigate("/"))
      .catch((error) => console.error("Error logging out:", error));
  };

  const handleImageClick = (imageUrl) => {
    if (!imageUrl || imageUrl === '-') return;
    setSelectedImage(imageUrl);
  };

  const handleRowToggle = (reportId) => {
    setExpandedRow(expandedRow === reportId ? null : reportId);
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
      day: 'numeric',
      month: 'short'
    }).format(date);
  };

  const graphData = Array(10).fill(0).map(() => ({
    height: Math.floor(Math.random() * 40) + 80
  }));

  return (
    <div className="flex h-screen bg-[#F3F4F4] overflow-hidden">
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
      <div className="flex-1 relative">
        {/* Table Container */}
        <div className="absolute top-6 left-6 right-6 bottom-[220px] bg-[#FFFFFF] rounded-[25px] shadow-md p-6">
          {/* Table Header */}
          <div className="flex items-center px-4 bg-[#FFFFFF] border border-[#3C3B3B] rounded-[25px] h-[50px] w-full mb-4">
            <div className="text-sm text-[#858080] font-semibold w-[12%] text-center">REF. ID</div>
            <div className="h-full w-[1px] bg-gray-600"></div>
            <div className="text-sm text-[#858080] font-semibold w-[15%] text-center">
              <div>NAME & CONTACT</div>
              <div>DETAILS</div>
            </div>
            <div className="h-full w-[1px] bg-gray-600"></div>
            <div className="text-sm text-[#858080] font-semibold w-[30%] text-center">IMAGE & ITEM DESCRIPTION</div>
            <div className="h-full w-[1px] bg-gray-600"></div>
            <div className="text-sm text-[#858080] font-semibold w-[15%] text-center">
              <div>POTENTIAL</div>
              <div>MATCHES</div>
            </div>
            <div className="h-full w-[1px] bg-gray-600"></div>
            <div className="text-sm text-[#858080] font-semibold w-[15%] text-center">CLAIM CODE</div>
            <div className="h-full w-[1px] bg-gray-600"></div>
            <div className="text-sm text-[#858080] font-semibold w-[10%] text-center">CLAIM DETAILS</div>
          </div>

          {/* Table Content */}
          <div className="overflow-y-auto h-[calc(100%-60px)]">
            {isLoading ? (
              <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : lostReports.length === 0 ? (
              <div className="text-center text-gray-500 py-4">No reports found</div>
            ) : (
              lostReports.map((report) => (
                <TableRow
                  key={report.id}
                  report={report}
                  isExpanded={expandedRow === report.id}
                  onToggle={() => handleRowToggle(report.id)}
                  onImageClick={handleImageClick}
                />
              ))
            )}
          </div>
        </div>

        {/* Bottom Containers */}
        <div className="absolute bottom-4 left-6 right-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Graph Container */}
            <div className="bg-[#FFFFFF] rounded-[25px] shadow-md p-6 h-44">
              <div className="flex items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">CHATBOT INTERACTIONS</h3>
                <img src={uploadCircle} alt="Upload" className="ml-2 h-6 w-6" />
              </div>    
              <div className="relative mt-8 h-20">
                <div className="absolute left-20 right-2 bottom-0 h-full">
                  <div className="flex items-end justify-between h-full">
                    {graphData.map((data, index) => (
                      <div
                        key={index}
                        style={{ height: `${Math.floor(data.height * 0.6)}px` }}
                        className={`w-6 ${index === 3 ? 'bg-[#E79D56]' : 'bg-[#339265]'} rounded`}
                      ></div>
                    ))}
                  </div>
                </div>
                <div className="absolute left-0 bottom-0 w-full">
                  <div className="border-t-2 border-gray-300"></div>
                  <div className="absolute -top-12 left-0">
                    <span className="text-4xl text-gray-700">150</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notifications Container */}
            <div className="bg-[#FFFFFF] rounded-[25px] shadow-md p-6 h-44">
              <div className="flex items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-800">NOTIFICATIONS</h3>
                <img src={bellIcon} alt="Notifications" className="ml-2 h-6 w-6" />
              </div>
              <div className="space-y-4">
                {lostReports.slice(0, 2).map((report) => (
                  <div key={report.id} className="flex items-center">
                    <img src={boxImportant} alt="Important" className="h-6 w-6 mr-3" />
                    <p className="text-gray-700">
                      A new item was reported at {formatTimestamp(report.timestamp)} in {report.location}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Image Popup Modal */}
        {selectedImage && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" 
            onClick={() => setSelectedImage(null)}
          >
            <div 
              className="relative bg-white p-2 rounded-lg" 
              onClick={e => e.stopPropagation()}
            >
              <img 
                src={selectedImage} 
                alt="Enlarged view" 
                className="max-h-[80vh] max-w-[80vw] object-contain" 
              />
              <button 
                className="absolute top-2 right-2 bg-white rounded-full p-1 hover:bg-gray-100"
                onClick={() => setSelectedImage(null)}
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-6 w-6" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M6 18L18 6M6 6l12 12" 
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chatbot;