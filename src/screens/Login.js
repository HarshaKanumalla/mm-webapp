import React, { useState, useCallback } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import mmlogo from '../screens/mmlogo.png';
import rightArrow from './right-arrow.png';

const ADMIN_EMAIL = 'missingsmartbox@gmail.com';

const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
        'default': 'Login failed. Please try again later.'
      };
      setError(errorMessages[err.code] || errorMessages.default);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] grid place-items-center px-4 py-8 font-montserrat">
      <div className="w-full max-w-[1000px]"> {/* Increased max-width by 25% from 1000px */}
        <form 
          onSubmit={handleLogin}
          className="bg-white rounded-3xl p-4 md:p-8 flex flex-col md:flex-row items-center 
                     justify-center gap-8 mx-auto relative w-full
                     min-h-[375px] md:min-h-[500px]" /* Decreased height by 25% from 500px/600px */
        >
          {/* Logo Section */}
          <div className="w-full md:w-1/3 flex flex-col items-center justify-center">
            <div className="w-full max-w-[235px]">
              <img
                src={mmlogo}
                alt="MM Logo"
                className="w-full h-auto"
                loading="eager"
              />
            </div>
          </div>

          {/* Divider - Updated color */}
          <div className="hidden md:block w-px self-stretch bg-[#D9D9D9]" />

          {/* Form Section */}
          <div className="w-full md:w-1/3 max-w-[235px] flex flex-col justify-center space-y-6">
            <div className="space-y-4">
              <input
                type="email"
                name="email"
                placeholder="Username or Email ID"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full h-10 px-4 rounded-full border border-[#1e1e1e] text-[#858080] text-center 
                          placeholder:font-montserrat focus:outline-none focus:ring-2 focus:ring-[#1e1e1e] 
                          transition-all duration-200"
                required
              />
              <input
                type="password"
                name="password"
                placeholder="Enter Password"
                value={formData.password}
                onChange={handleInputChange}
                className="w-full h-10 px-4 rounded-full border border-[#1e1e1e] text-[#858080] text-center 
                          placeholder:font-montserrat focus:outline-none focus:ring-2 focus:ring-[#1e1e1e] 
                          transition-all duration-200"
                required
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm text-center" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 bg-[#1e1e1e] rounded-full text-[#d9d9d9] flex items-center 
                       justify-center gap-2 transition-all duration-200 hover:bg-[#2e2e2e] 
                       disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{isLoading ? 'LOGGING IN...' : 'LOGIN'}</span>
              {!isLoading && (
                <img
                  src={rightArrow}
                  alt="Right arrow"
                  className="w-6 h-6"
                  loading="lazy"
                />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;