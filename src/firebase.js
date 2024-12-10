// Import required Firebase modules
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";
import { useEffect, useState, doc, onSnapshot, getDownloadURL, ref } from "firebase/firestore";


// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDTuoNvqSAR2aSJoMOffC0fPEY1E1t6t9g",
  authDomain: "missingmatters-web-app.firebaseapp.com",
  projectId: "missingmatters-web-app",
  storageBucket: "missingmatters-web-app.appspot.com",
  messagingSenderId: "719561053420",
  appId: "1:719561053420:web:9db47634bf19074fbc41c9",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app); // For authentication
export const storage = getStorage(app); // For file storage
export const firestore = getFirestore(app); // For Firestore database

// Default export (optional if needed elsewhere)
export default app;
