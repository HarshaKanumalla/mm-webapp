import React, { useState, useCallback, useEffect, useRef } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

const ADMIN_EMAIL = 'missingsmartbox@gmail.com';

// Wallet icon
const WalletIcon = () => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="15" width="90" height="70" rx="15" fill="#1E3B2E" />
    <rect x="15" y="30" width="25" height="45" rx="2" fill="#1E3B2E" stroke="#A9BE7B" strokeWidth="4" />
    <circle cx="27" cy="55" r="8" fill="#A9BE7B" />
  </svg>
);

// Key icon
const KeyIcon = () => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M35,60 L70,40 L80,50 L70,60 L70,75 L60,75 L60,65 L50,65 L50,75 L40,75 L40,60 Z" fill="#F0D777" />
    <circle cx="35" cy="60" r="20" fill="#F0D777" />
    <circle cx="35" cy="60" r="10" fill="#5E8549" />
  </svg>
);

// Bottle icon
const BottleIcon = () => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M40,25 L60,25 L60,40 C70,45 75,55 75,70 L75,85 C75,90 70,95 65,95 L35,95 C30,95 25,90 25,85 L25,70 C25,55 30,45 40,40 L40,25 Z" fill="#78BDB3" />
    <path d="M40,25 L60,25 L60,40 C70,45 75,55 75,70 L75,75 C55,75 45,75 25,75 L25,70 C25,55 30,45 40,40 L40,25 Z" fill="#A3D2CA" />
    <rect x="40" y="15" width="20" height="10" rx="2" fill="#1E3B2E" />
  </svg>
);

// Glasses icon
const GlassesIcon = () => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M15,45 C15,35 25,35 35,35 L65,35 C75,35 85,35 85,45 L80,55 C80,65 70,65 60,65 C50,65 50,55 50,55 C50,55 50,55 50,55 C50,55 50,55 50,55 C50,55 40,65 30,65 C20,65 20,55 20,55 L15,45 Z" stroke="#1E3B2E" strokeWidth="6" fill="none" />
  </svg>
);

// Notebook icon
const NotebookIcon = () => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="30" y="20" width="40" height="60" rx="3" fill="#1E3B2E" />
    <line x1="35" y1="35" x2="65" y2="35" stroke="#A9BE7B" strokeWidth="3" />
    <line x1="35" y1="45" x2="65" y2="45" stroke="#A9BE7B" strokeWidth="3" />
    <line x1="35" y1="55" x2="65" y2="55" stroke="#A9BE7B" strokeWidth="3" />
    <line x1="35" y1="65" x2="65" y2="65" stroke="#A9BE7B" strokeWidth="3" />
  </svg>
);

// Striped helmet icon
const HelmetIcon = () => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M25,65 C25,40 40,35 50,35 C60,35 75,40 75,65 C75,75 70,80 65,80 L35,80 C30,80 25,75 25,65 Z" fill="#1E3B2E" />
    <line x1="30" y1="40" x2="30" y2="75" stroke="#A9BE7B" strokeWidth="5" />
    <line x1="40" y1="37" x2="40" y2="77" stroke="#A9BE7B" strokeWidth="5" />
    <line x1="50" y1="35" x2="50" y2="80" stroke="#A9BE7B" strokeWidth="5" />
    <line x1="60" y1="37" x2="60" y2="77" stroke="#A9BE7B" strokeWidth="5" />
    <line x1="70" y1="40" x2="70" y2="75" stroke="#A9BE7B" strokeWidth="5" />
  </svg>
);

// Signpost icon
const SignpostIcon = () => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="45" y="20" width="10" height="70" fill="#1E3B2E" />
    <rect x="25" y="60" width="50" height="25" rx="2" fill="#1E3B2E" />
    <line x1="30" y1="65" x2="70" y2="65" stroke="#A9BE7B" strokeWidth="3" />
    <line x1="30" y1="72" x2="70" y2="72" stroke="#A9BE7B" strokeWidth="3" />
    <line x1="30" y1="79" x2="70" y2="79" stroke="#A9BE7B" strokeWidth="3" />
  </svg>
);

const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const emailInputRef = useRef(null);
  
  // Focus email input on component mount
  useEffect(() => {
    if (emailInputRef.current) {
      emailInputRef.current.focus();
    }
  }, []);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const { email, password } = formData;

    if (email !== ADMIN_EMAIL) {
      setError('Only admin access is allowed!');
      setIsLoading(false);
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      onLogin();
    } catch (err) {
      const errorMessages = {
        'auth/wrong-password': 'Invalid password. Please try again.',
        'auth/user-not-found': 'Admin account does not exist.',
        'auth/too-many-requests': 'Too many unsuccessful login attempts. Please try again later.',
        'auth/network-request-failed': 'Network error. Please check your connection.',
        'default': 'Login failed. Please try again later.'
      };
      setError(errorMessages[err.code] || errorMessages.default);
    } finally {
      setIsLoading(false);
    }
  };

  // Background color constant for reuse
  const bgColor = "#F8F7F0";

  return (
    <div className="h-screen w-full flex overflow-hidden">
      {/* Left side grid */}
      <div className="w-1/2 grid grid-cols-3 grid-rows-3 relative">
        {/* Row 1 */}
        <div className="bg-[#A9BE7B] flex items-center justify-center">
          <div className="w-3/4 h-3/4"><WalletIcon /></div>
        </div>
        <div className="bg-[#5E8549] flex items-center justify-center">
          <div className="w-3/4 h-3/4"><KeyIcon /></div>
        </div>
        <div className="bg-[#A9BE7B] relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="w-2/3 h-2/3"><BottleIcon /></div>
          </div>
          <div className="absolute top-0 right-0 w-full h-full">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M0,0 L100,0 L100,100 L0,0 Z" fill="#5E8549" />
            </svg>
          </div>
        </div>
        
        {/* Row 2 */}
        <div className="bg-[#5E8549] flex items-center justify-center">
          <div className="w-3/4 h-3/4"><GlassesIcon /></div>
        </div>
        <div className="bg-[#A9BE7B] flex items-center justify-center">
          <div className="w-3/4 h-3/4"><NotebookIcon /></div>
        </div>
        <div className="bg-[#5E8549] flex items-center justify-center">
          <div className="w-3/4 h-3/4"><HelmetIcon /></div>
        </div>
        
        {/* Row 3 */}
        <div className="bg-[#A9BE7B] flex items-center justify-center">
          <div className="w-3/4 h-3/4"><SignpostIcon /></div>
        </div>
        <div className="bg-[#5E8549] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M0,100 L100,100 L0,0 Z" fill="#A9BE7B" />
            </svg>
          </div>
        </div>
        
        {/* This cell will be visually removed and replaced with the curved mask */}
        <div className="bg-[#A9BE7B]"></div>
        
        {/* Curved corner overlay that matches the right side background */}
        <div 
          className="absolute bottom-0 right-0 w-1/3 h-1/3 overflow-hidden" 
          style={{ backgroundColor: bgColor }}
        >
          <div 
            className="absolute bottom-0 right-0 w-[200%] h-[200%] rounded-tl-[200px]" 
            style={{ backgroundColor: bgColor }}
          ></div>
        </div>
      </div>
      
      {/* Right side content */}
      <div className="w-1/2" style={{ backgroundColor: bgColor }}>
        <div className="h-full flex flex-col items-center justify-center">
          <div className="mb-8">
            <h1 className="text-5xl font-bold text-[#24503B]">Missing</h1>
            <h1 className="text-5xl font-bold text-[#24503B] mb-2">Matters</h1>
            <p className="text-2xl text-[#24503B]">Find what you've lost</p>
          </div>
          
          <form 
            onSubmit={handleLogin}
            className="flex flex-col items-center space-y-6 w-full"
            noValidate
          >
            <input
              ref={emailInputRef}
              type="email"
              name="email"
              placeholder="Email Address"
              value={formData.email}
              onChange={handleInputChange}
              className="w-2/5 h-12 px-4 rounded-lg border border-gray-300
                        text-gray-600 placeholder:text-gray-400 focus:outline-none
                        text-center bg-transparent"
              required
            />
            
            <input
              type="password"
              name="password"
              placeholder="Enter Password"
              value={formData.password}
              onChange={handleInputChange}
              className="w-2/5 h-12 px-4 rounded-lg border border-gray-300
                        text-gray-600 placeholder:text-gray-400 focus:outline-none
                        text-center bg-transparent"
              required
            />

            {error && (
              <div 
                className="w-2/5 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm"
                role="alert"
                aria-live="assertive"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-4 px-10 py-3 bg-[#2A5D3E] rounded-lg text-white font-medium
                        disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Login"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-t-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span className="ml-2">Logging in...</span>
                </div>
              ) : (
                "LOGIN"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;