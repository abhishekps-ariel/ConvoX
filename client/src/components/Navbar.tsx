import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import ProfileModal from "./ProfileModal";

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const [showProfileModal, setShowProfileModal] = useState(false);

  return (
    <nav className="w-full bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* User Profile Section */}
        <button
          onClick={() => setShowProfileModal(true)}
          className="flex items-center bg-gray-50 rounded-lg px-4 py-2 border border-gray-200 hover:bg-gray-100 transition-colors"
        >
          <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-semibold text-sm overflow-hidden">
            {user?.profilePicture ? (
              <img
                src={user.profilePicture}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              user?.username?.charAt(0).toUpperCase()
            )}
          </div>
          <div className="ml-3 text-left">
            <p className="text-sm font-medium text-gray-900">{user?.username}</p>
            <p className="text-xs text-gray-500">You</p>
          </div>
        </button>

        {/* Logo - Centered */}
        <div className="flex-1 flex justify-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Convo<span className="text-indigo-600 text-3xl">X</span>
          </h1>
        </div>

        {/* Logout Button */}
        <div className="flex items-center">
          <button
            onClick={() => {
              logout();
              localStorage.clear();
              window.location.reload();
            }}
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </div>

      {/* Profile Modal */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
    </nav>
  );
};

export default Navbar;
