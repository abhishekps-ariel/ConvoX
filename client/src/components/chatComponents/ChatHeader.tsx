import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { checkBlockStatus } from "../../services/api";
import ProfileInfo from "./ProfileInfo";
import type { User, OnlineUser } from "../../types/chatTypes";

interface ChatHeaderProps {
  selectedUser: User;
  onlineUsers: OnlineUser[];
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ selectedUser, onlineUsers }) => {
  const { user, token } = useAuth();
  const [showProfileInfo, setShowProfileInfo] = useState(false);
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [isBlockedByThem, setIsBlockedByThem] = useState(false);

  const isUserOnline = (userId: string) => {
    // Don't show online status for users who have blocked us
    if (isBlockedByThem) return false;
    return onlineUsers.some((u) => u.userId === userId);
  };

  // Check block status when selectedUser changes
  useEffect(() => {
    const checkStatus = async () => {
      if (token && selectedUser.id !== user?.id) {
        try {
          const result = await checkBlockStatus(token, selectedUser.id);
          setIsBlockedByMe(result?.isBlockedByMe || false);
          setIsBlockedByThem(result?.isBlockedByThem || false);
        } catch (error) {
          console.error('Error checking block status:', error);
        }
      }
    };
    checkStatus();
  }, [selectedUser.id, token, user?.id]);


  const handleProfileInfoToggle = () => {
    setShowProfileInfo(!showProfileInfo);
  };

  const handleBlockUser = () => {
    // This will be handled by the ProfileInfo component
    // We just need to refresh the block status
    setIsBlockedByMe(!isBlockedByMe);
  };

  return (
    <>
      <div className="px-6 py-4 bg-white border-b border-gray-200 sticky top-0 flex items-center justify-between z-20">
        <div className="flex items-center">
          <div className="relative">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold overflow-hidden">
              {selectedUser.profilePicture ? (
                <img
                  src={selectedUser.profilePicture}
                  alt={selectedUser.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                selectedUser.username.charAt(0).toUpperCase()
              )}
            </div>
            {isBlockedByMe ? (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>
            ) : isUserOnline(selectedUser.id) && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></span>
            )}
          </div>
          <div className="ml-4">
            <h2 className="font-semibold text-gray-900">
              {selectedUser.username}
            </h2>
            <p className="text-sm text-gray-500">
              {isBlockedByMe ? "Blocked by you" : 
               isBlockedByThem ? "Offline" :
                isUserOnline(selectedUser.id) ? "Online" : "Offline"}
            </p>
          </div>
        </div>

        {/* Profile Info Button */}
        {selectedUser.id !== user?.id && (
          <button
            onClick={handleProfileInfoToggle}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="View profile"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
        )}
      </div>

      {/* Profile Info Modal */}
      {showProfileInfo && (
        <ProfileInfo
          user={selectedUser}
          onlineUsers={onlineUsers}
          onClose={() => setShowProfileInfo(false)}
          onBlockUser={handleBlockUser}
        />
      )}
    </>
  );
};

export default ChatHeader;
