import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { AUTH_ENDPOINTS } from '../constants/apiEndpoints';

interface User {
  id: string;
  username: string;
  email: string;
  bio?: string;
  profilePicture?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (updatedUser: User) => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Helper function to clear all auth data
  const clearAuthData = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  // Helper function to save auth data
  const saveAuthData = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  // Helper function to validate token
  const isTokenValid = (token: string): boolean => {
    try {
      const tokenData = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Date.now() / 1000;
      return tokenData.exp && tokenData.exp > currentTime;
    } catch {
      return false;
    }
  };

  // Helper function to make auth API calls
  const makeAuthRequest = async (endpoint: string, body: any) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Authentication failed');
    }

    return data;
  };

  useEffect(() => {
    // Check for stored token on app load
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (storedToken && storedUser) {
      if (isTokenValid(storedToken)) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } else {
        // Token expired or invalid, clear it
        clearAuthData();
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    try {
      // Clear any existing tokens first
      clearAuthData();
      
      const data = await makeAuthRequest(AUTH_ENDPOINTS.LOGIN, { email, password });
      saveAuthData(data.token, data.user);
    } catch (error) {
      // Clear tokens on error
      clearAuthData();
      throw error;
    }
  };

  const register = async (username: string, email: string, password: string) => {
    try {
      // Clear any existing tokens first
      clearAuthData();
      
      const data = await makeAuthRequest(AUTH_ENDPOINTS.REGISTER, { username, email, password });
      saveAuthData(data.token, data.user);
    } catch (error) {
      // Clear tokens on error
      clearAuthData();
      throw error;
    }
  };

  const logout = () => {
    clearAuthData();
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const value = {
    user,
    token,
    login,
    register,
    logout,
    updateUser,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
