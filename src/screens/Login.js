import React, { useState, useCallback, useEffect, useRef } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import mmlogo from '../screens/mmlogo.png';

// Import SVG icons - adjust paths as needed for your project
import { ReactComponent as TennisBallIcon } from '../screens/ball.svg';
import { ReactComponent as TeddyBearIcon } from '../screens/bear.svg';
import { ReactComponent as HelmetIcon } from '../screens/helmet.svg';
import { ReactComponent as FlashlightIcon } from '../screens/flashlight.svg';
import { ReactComponent as BatteryIcon } from '../screens/drum.svg';
import { ReactComponent as SuitcaseIcon } from '../screens/suitcase.svg';
import { ReactComponent as SpeakerIcon } from '../screens/speaker.svg';
import { ReactComponent as RacketIcon } from '../screens/racket.svg';
import { ReactComponent as HeadphonesIcon } from '../screens/headphones.svg';
import { ReactComponent as ControllerIcon } from '../screens/controller.svg';
import { ReactComponent as BottleIcon } from '../screens/bottle.svg';
import { ReactComponent as LaptopIcon } from '../screens/laptop.svg';
import { ReactComponent as WalletIcon } from '../screens/wallet.svg';
import { ReactComponent as KeyIcon } from '../screens/key.svg';
import { ReactComponent as CapIcon } from '../screens/cap.svg';
import { ReactComponent as PassportIcon } from '../screens/passport.svg';
import { ReactComponent as UmbrellaIcon } from '../screens/umbrella.svg';
import { ReactComponent as GlassesIcon } from '../screens/glasses.svg';
import { ReactComponent as DumbbellIcon } from '../screens/dumbbell.svg';
import { ReactComponent as MedkitIcon } from '../screens/medkit.svg';
import { ReactComponent as BabyBottleIcon } from '../screens/baby-bottle.svg';

const ADMIN_EMAIL = 'missingsmartbox@gmail.com';

// Available icons array for animation
const ICONS = [
  TennisBallIcon, TeddyBearIcon, HelmetIcon, FlashlightIcon, BatteryIcon,
  SuitcaseIcon, SpeakerIcon, RacketIcon, HeadphonesIcon, ControllerIcon,
  BottleIcon, LaptopIcon, WalletIcon, KeyIcon, CapIcon,
  PassportIcon, UmbrellaIcon, GlassesIcon, DumbbellIcon, MedkitIcon, BabyBottleIcon
];

/**
 * Form input component
 */
const FormInput = React.memo(({ type, name, placeholder, value, onChange, inputRef }) => (
  <input
    ref={inputRef}
    type={type}
    name={name}
    placeholder={placeholder.toUpperCase()}
    value={value}
    onChange={onChange}
    className="w-4/5 mx-auto h-10 px-4 rounded-full border border-gray-300 text-gray-600 text-center text-xs
              font-['Montserrat'] placeholder:font-['Montserrat'] placeholder:text-gray-400 placeholder:uppercase placeholder:text-xs
              focus:outline-none focus:ring-1 focus:ring-[#2A9D8E] 
              transition-all duration-200 bg-white shadow-inner"
    required
    aria-invalid={name === 'email' && value !== '' && value !== ADMIN_EMAIL}
  />
));

/**
 * Login button component
 */
const LoginButton = React.memo(({ isLoading }) => (
  <button
    type="submit"
    disabled={isLoading}
    className="w-2/4 mx-auto h-10 bg-[#2A9D8E] rounded-full text-white font-medium uppercase flex items-center justify-center text-xs
              disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#2A9D8E] shadow-md hover:shadow-lg transition-shadow duration-300"
    aria-label="Login"
  >
    {isLoading ? (
      <div className="flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-t-2 border-white border-t-transparent rounded-full animate-spin"></div>
        <span className="ml-2">Logging in...</span>
      </div>
    ) : (
      <div className="flex items-center justify-center">
        <span>LOGIN</span>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
        </svg>
      </div>
    )}
  </button>
));

/**
 * Stacking Icon component - modified to stop and stack at bottom
 */
const StackingIcon = ({ Icon, delay, duration, positionX, zIndex, size, isLargeIcon }) => {
  // Calculate a random starting position off-screen (above viewport)
  const startPosition = -100 - Math.random() * 500; // -100px to -600px
  
  // Create a unique animation name for this icon
  // This prevents icons from having the exact same animation timing
  const animationName = `fallAndStack_${Math.floor(Math.random() * 1000)}`;
  
  // Increase size by 25% for selected icons
  const actualSize = isLargeIcon ? size * 1.25 : size;
  
  // Calculate final position at the bottom of the screen
  // Use 95-98vh to ensure icons stop at the very bottom
  const bottomPosition = 95 + Math.random() * 3; // 95-98vh
  
  // Define the keyframes for this specific icon
  const keyframes = `
    @keyframes ${animationName} {
      0% {
        transform: translateY(0) rotate(0deg);
        opacity: 0.8;
      }
      70% {
        opacity: 0.8;
      }
      100% {
        transform: translateY(${bottomPosition}vh) rotate(${Math.random() > 0.5 ? '' : '-'}${Math.floor(Math.random() * 360)}deg);
        opacity: 0.8;
      }
    }
  `;
  
  return (
    <>
      <style>{keyframes}</style>
      <div
        className="absolute"
        style={{
          left: `${positionX}%`,
          top: `${startPosition}px`, // Start above the viewport
          zIndex,
          opacity: 0.8,
          animation: `${animationName} ${duration}s ease-in ${delay}s forwards`,
          transformOrigin: 'center',
          width: `${actualSize}px`,
          height: `${actualSize}px`
        }}
      >
        <Icon className="w-full h-full text-[#2A9D8E]" />
      </div>
    </>
  );
};

/**
 * Login component with stacking icons animation
 */
const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const emailInputRef = useRef(null);
  
  // Generate stacking icons with varied sizes covering the full screen width
  const stackingIcons = useRef(Array.from({ length: 70 }, (_, index) => {
    const IconComponent = ICONS[index % ICONS.length];
    
    // Create three distinct size categories for better variation
    let size;
    const sizeCategory = index % 3;
    if (sizeCategory === 0) {
      // Small icons
      size = 16 + Math.floor(Math.random() * 10); // 16-25px
    } else if (sizeCategory === 1) {
      // Medium icons
      size = 26 + Math.floor(Math.random() * 10); // 26-35px
    } else {
      // Large icons
      size = 36 + Math.floor(Math.random() * 15); // 36-50px
    }
    
    // Create a more staggered delay pattern for better distribution
    // Use a different formula to ensure icons don't all arrive at the same time
    const delay = (index * 0.3) % 6; // Staggered delays from 0-5.7s
    
    // Distribute icons across the full screen width (0-100%)
    const positionX = Math.random() * 100; 
    
    // Make approximately 25% of the icons larger (every 4th icon)
    const isLargeIcon = index % 4 === 0;
    
    return {
      Icon: IconComponent,
      positionX: positionX,
      delay: delay,
      // Vary duration more to create natural-looking stacking
      duration: 4 + Math.random() * 4, // 4-8s duration
      zIndex: 10 + (index % 20), // Different z-indices for stacking effect
      size: size, // Varied sizing based on category
      isLargeIcon: isLargeIcon // Flag to indicate icons that should be 25% larger
    };
  })).current;

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

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-[#222222]">
      {/* Stacking icons container */}
      <div className="absolute inset-0 z-10 overflow-hidden">
        <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
          {stackingIcons.map((config, index) => (
            <StackingIcon
              key={index}
              Icon={config.Icon}
              delay={config.delay}
              duration={config.duration}
              positionX={config.positionX}
              zIndex={config.zIndex}
              size={config.size}
              isLargeIcon={config.isLargeIcon}
            />
          ))}
        </div>
      </div>
      
      {/* Main login card */}
      <div className="absolute inset-0 flex items-center justify-center p-4 z-20">
        <div className="bg-white rounded-3xl shadow-xl w-[23%] max-w-sm mx-auto p-6 drop-shadow-2xl">
          <div className="flex flex-col items-center mb-6">
            <div className="w-20 h-20 rounded-full border-2 border-[#FFFFFF] flex items-center justify-center mb-2 shadow-lg">
              <img 
                src={mmlogo} 
                alt="Missing Matters Logo" 
                className="w-14 h-14 object-contain" 
              />
            </div>
          </div>
          
          <form 
            onSubmit={handleLogin}
            className="flex flex-col w-full mx-auto gap-4"
            noValidate
            aria-label="Login form"
          >
            <FormInput
              type="email"
              name="email"
              placeholder="Username or Email ID"
              value={formData.email}
              onChange={handleInputChange}
              inputRef={emailInputRef}
            />
            
            <FormInput
              type="password"
              name="password"
              placeholder="Enter Password"
              value={formData.password}
              onChange={handleInputChange}
            />

            {error && (
              <div 
                className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm w-3/4 mx-auto"
                role="alert"
                aria-live="assertive"
              >
                {error}
              </div>
            )}

            <div className="mt-4 w-full flex justify-center">
              <LoginButton isLoading={isLoading} />
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;