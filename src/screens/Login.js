import React, { useState, useCallback, useEffect, useRef } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import background from '../screens/background.jpg';
import buttonImage from '../screens/buttons.png';

const ADMIN_EMAIL = 'missingsmartbox@gmail.com';

/**
 * Input field component with consistent styling and behavior
 */
const FormInput = React.memo(({ type, name, placeholder, value, onChange, inputRef }) => (
  <input
    ref={inputRef}
    type={type}
    name={name}
    placeholder={placeholder}
    value={value}
    onChange={onChange}
    className="w-full max-w-[320px] h-12 px-4 rounded-full border border-[#2A9D8E] text-[#858080] text-center 
              placeholder:font-montserrat placeholder:text-[#2A9D8E] focus:outline-none focus:ring-2 focus:ring-[#2A9D8E] 
              transition-all duration-200 bg-white"
    required
    aria-invalid={name === 'email' && value !== '' && value !== ADMIN_EMAIL}
  />
));

/**
 * Login button component
 */
const LoginButton = React.memo(({ isLoading, buttonImage }) => (
  <button
    type="submit"
    disabled={isLoading}
    className="mt-2 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#2A9D8E] rounded-full"
    aria-label="Login"
  >
    {isLoading ? (
      <div className="flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-t-2 border-[#2A9D8E] border-t-transparent rounded-full animate-spin"></div>
        <span className="ml-2 text-[#2A9D8E]">Logging in...</span>
      </div>
    ) : (
      <div className="w-12 h-12 bg-[#2A9D8E] rounded-full flex items-center justify-center hover:bg-[#27907f] transition-colors duration-200">
        <img
          src={buttonImage}
          alt=""
          className="w-6 h-6"
          loading="lazy"
        />
      </div>
    )}
  </button>
));

/**
 * Login component
 * Provides authentication functionality with responsive design
 */
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

  return (
    <div className="min-h-screen w-full font-montserrat relative overflow-hidden">
      {/* Background container with opacity */}
      <div 
        className="absolute inset-0 z-0"
        style={{ 
          backgroundImage: `url(${background})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.4,
          imageRendering: 'crisp-edges',
          WebkitImageRendering: 'pixelated'
        }}
        aria-hidden="true"
      />
      
      {/* Content container with proper positioning for different screen sizes */}
      <div className="absolute top-0 left-0 w-full h-full z-10 flex items-center justify-center">
        <div className="absolute sm:top-[78%] top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full px-4">
          <form 
            onSubmit={handleLogin}
            className="flex flex-col items-center w-full gap-4"
            noValidate
            aria-label="Login form"
          >
            <FormInput
              type="email"
              name="email"
              placeholder="EMAIL ADDRESS"
              value={formData.email}
              onChange={handleInputChange}
              inputRef={emailInputRef}
            />
            
            <FormInput
              type="password"
              name="password"
              placeholder="PASSWORD"
              value={formData.password}
              onChange={handleInputChange}
            />

            {error && (
              <div 
                className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm text-center max-w-[320px] w-full" 
                role="alert"
                aria-live="assertive"
              >
                {error}
              </div>
            )}

            <LoginButton isLoading={isLoading} buttonImage={buttonImage} />
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;