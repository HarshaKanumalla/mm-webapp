import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import Login from "./screens/Login";
import Dashboard from "./screens/Dashboard";
import AdsScreen from "./screens/AdsScreen";
import Monitoring from "./screens/Monitoring";
import Chatbot from "./screens/Chatbot";
import { auth } from "./firebase";

function ProtectedRoute({ children, isAuthenticated }) {
  const location = useLocation();
  
  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return children;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, 
      (user) => {
        setIsAuthenticated(!!user);
        setLoading(false);
      },
      (error) => {
        console.error("Auth error:", error);
        setError(error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#D9D9D9]">
        <div className="text-xl text-[#1E1E1E]">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#D9D9D9]">
        <div className="text-xl text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={!isAuthenticated ? <Login /> : <Navigate to="/dashboard" replace />} />
        
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/ads" 
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <AdsScreen />
            </ProtectedRoute>
          } 
        />

        <Route
          path="/monitoring"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <Monitoring />
            </ProtectedRoute>
            }
            />
        <Route
          path="/chatbot"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <Chatbot />
            </ProtectedRoute>
          }
        />


        
        <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/"} replace />} />
      </Routes>
    </Router>
  );
}

export default App;