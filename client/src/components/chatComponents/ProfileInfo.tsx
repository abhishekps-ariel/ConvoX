import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { blockUser, unblockUser, checkBlockStatus, fetchGroupsInCommon } from '../../services/api';
import type { User, OnlineUser, Group } from '../../types/chatTypes';

interface ProfileInfoProps {
  user: User;
  onlineUsers: OnlineUser[];
  onClose: () => void;
  onBlockUser: () => void;
}

const ProfileInfo: React.FC<ProfileInfoProps> = ({ user, onlineUsers, onClose, onBlockUser }) => {
  const { user: currentUser, token, logout } = useAuth();
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [isBlockedByThem, setIsBlockedByThem] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [commonGroups, setCommonGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  const isUserOnline = (userId: string) => {
    if (isBlockedByThem) return false;
    return onlineUsers.some((u) => u.userId === userId);
  };

  // Check block status and fetch groups in common when component mounts
  useEffect(() => {
    const checkStatus = async () => {
      if (token && user.id !== currentUser?.id) {
        try {
          const result = await checkBlockStatus(token, user.id);
          setIsBlockedByMe(result?.isBlockedByMe || false);
          setIsBlockedByThem(result?.isBlockedByThem || false);
        } catch (error) {
          console.error('Error checking block status:', error);
        }
      }
    };

    const fetchCommonGroups = async () => {
      if (token && user.id !== currentUser?.id) {
        setLoadingGroups(true);
        try {
          console.log('Fetching groups in common for user:', user.id);
          const groups = await fetchGroupsInCommon(token, user.id, logout);
          console.log('Groups in common received:', groups);
          setCommonGroups(groups);
        } catch (error) {
          console.error('Error fetching groups in common:', error);
        } finally {
          setLoadingGroups(false);
        }
      }
    };

    checkStatus();
    fetchCommonGroups();
  }, [user.id, token, currentUser?.id, logout]);

  const handleBlockUser = async () => {
    if (!token || isLoading) return;
    
    try {
      setIsLoading(true);
      if (isBlockedByMe) {
        await unblockUser(token, user.id);
        setIsBlockedByMe(false);
      } else {
        await blockUser(token, user.id);
        setIsBlockedByMe(true);
      }
      onBlockUser(); // Notify parent component
    } catch (error) {
      console.error('Error blocking/unblocking user:', error);
      alert(error instanceof Error ? error.message : 'Failed to update block status');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-transparent bg-opacity-80 backdrop-blur-md flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Profile</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Profile Content */}
        <div className="p-6">
          {/* Profile Picture and Basic Info */}
          <div className="text-center mb-6">
            <div className="relative inline-block">
              <div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold text-2xl overflow-hidden mx-auto mb-4">
                {user.profilePicture ? (
                  <img
                    src={user.profilePicture}
                    alt={user.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  user.username.charAt(0).toUpperCase()
                )}
              </div>
              {isBlockedByMe ? (
                <span className="absolute bottom-0 right-0 w-6 h-6 bg-red-500 rounded-full border-4 border-white flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                  </svg>
                </span>
              ) : isUserOnline(user.id) && (
                <span className="absolute bottom-0 right-0 w-6 h-6 bg-green-500 rounded-full border-4 border-white"></span>
              )}
            </div>
            
            <h3 className="text-2xl font-semibold text-gray-900 mb-1">
              {user.username}
            </h3>
            
            <p className="text-gray-600 text-sm mb-2">
              {user.email}
            </p>
            
            <p className="text-gray-500 mb-2">
              {isBlockedByMe ? "Blocked by you" : 
               isBlockedByThem ? "Offline" :
                isUserOnline(user.id) ? "Online" : "Offline"}
            </p>

            {user.bio && (
              <p className="text-gray-600 text-sm max-w-xs mx-auto">
                {user.bio}
              </p>
            )}
          </div>

          {/* Groups in Common Section */}
          <div className="mb-6">
            <h4 className="text-lg font-medium text-gray-900 mb-3">Groups in Common</h4>
            {loadingGroups ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                <span className="ml-2 text-gray-500 text-sm">Loading...</span>
              </div>
            ) : commonGroups.length > 0 ? (
              <div className="space-y-2">
                {commonGroups.map((group) => (
                  <div key={group._id} className="flex items-center p-3 bg-gray-50 rounded-lg">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-semibold mr-3">
                      {group.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{group.name}</p>
                      <p className="text-sm text-gray-500">{group.members.length} members</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No groups in common</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleBlockUser}
              disabled={isLoading}
              className={`w-full px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center ${
                isBlockedByMe 
                  ? 'bg-green-50 text-green-600 hover:bg-green-100' 
                  : 'bg-red-50 text-red-600 hover:bg-red-100'
              }`}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isBlockedByMe ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                )}
              </svg>
              {isLoading ? 'Loading...' : (isBlockedByMe ? 'Unblock User' : 'Block User')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileInfo;
