import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Login from '../pages/Login';
import Register from '../pages/Register';
import ChatInterface from '../pages/ChatInterface';
import Navbar from '../components/Navbar';

export const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [isLoginMode, setIsLoginMode] = useState(true);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <div className="text-gray-600 text-lg font-medium">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return isLoginMode ? (
      <Login onToggleMode={() => setIsLoginMode(false)} />
    ) : (
      <Register onToggleMode={() => setIsLoginMode(true)} />
    );
  }

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden">
      <Navbar />
      <div className="flex-1 overflow-hidden">
        <ChatInterface />
      </div>
    </div>
  );
};
