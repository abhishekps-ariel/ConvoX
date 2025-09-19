import React, { useState, useRef, useEffect } from 'react';
import type { Group, User } from '../../types/chatTypes';
import { useImageCrop } from '../../hooks/useImageCrop';
import { updateGroupIcon, removeGroupIcon, removeGroupMember } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface GroupInfoProps {
  group: Group;
  currentUser: User;
  onlineUsers: { userId: string; username: string }[];
  onClose: () => void;
  onLeaveGroup: (groupId: string) => void;
  onAddMembers: (groupId: string) => void;
}

const GroupInfo: React.FC<GroupInfoProps> = ({
  group,
  currentUser,
  onlineUsers,
  onClose,
  onLeaveGroup,
  onAddMembers
}) => {
  const [isLeaving, setIsLeaving] = useState(false);
  const [isUpdatingIcon, setIsUpdatingIcon] = useState(false);
  const [currentGroupIcon, setCurrentGroupIcon] = useState<string | undefined>(group.icon);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { token } = useAuth();
  
  const {
    crop,
    setCrop,
    setCompletedCrop,
    imgSrc,
    showCropModal,
    imgRef,
    onImageLoad,
    handleImageSelect,
    handleCropComplete,
    handleCropCancel
  } = useImageCrop();

  const isCurrentUserAdmin = group.createdBy._id === currentUser.id;
  const isCurrentUserActiveMember = group.members.some(member => member.user._id === currentUser.id);
  const canLeaveGroup = !isCurrentUserAdmin && isCurrentUserActiveMember;

  const handleLeaveGroup = async () => {
    if (canLeaveGroup) {
      setIsLeaving(true);
      try {
        await onLeaveGroup(group._id);
        onClose();
      } catch (error) {
        console.error('Error leaving group:', error);
      } finally {
        setIsLeaving(false);
      }
    }
  };

  const handleAddMembers = () => {
    onAddMembers(group._id);
    onClose();
  };

  const handleUpdateGroupIcon = async (newIcon: string) => {
    if (!token) return;
    
    // Update local state immediately for real-time feedback
    setCurrentGroupIcon(newIcon);
    
    setIsUpdatingIcon(true);
    try {
      await updateGroupIcon(token, group._id, newIcon);
      console.log('Group icon updated successfully');
    } catch (error) {
      console.error('Error updating group icon:', error);
      // Revert local state on error
      setCurrentGroupIcon(group.icon);
      alert('Failed to update group icon');
    } finally {
      setIsUpdatingIcon(false);
    }
  };

  const handleRemoveGroupIcon = async () => {
    if (!token) return;
    
    // Show confirmation dialog
    const confirmed = window.confirm('Are you sure you want to remove the group icon?');
    if (!confirmed) return;
    
    // Update local state immediately for real-time feedback
    setCurrentGroupIcon(undefined);
    
    setIsUpdatingIcon(true);
    try {
      await removeGroupIcon(token, group._id);
      console.log('Group icon removed successfully');
    } catch (error) {
      console.error('Error removing group icon:', error);
      // Revert local state on error
      setCurrentGroupIcon(group.icon);
      alert('Failed to remove group icon');
    } finally {
      setIsUpdatingIcon(false);
    }
  };

  const handleRemoveMember = async (memberId: string, memberUsername: string) => {
    if (!token) return;
    
    // Show confirmation dialog
    const confirmed = window.confirm(`Are you sure you want to remove ${memberUsername} from this group?`);
    if (!confirmed) return;
    
    setRemovingMemberId(memberId);
    try {
      await removeGroupMember(token, group._id, memberId);
      console.log('Member removed successfully');
      // Close the modal to refresh the group data
      onClose();
    } catch (error) {
      console.error('Error removing member:', error);
      alert('Failed to remove member');
    } finally {
      setRemovingMemberId(null);
    }
  };

  // Sync local state with group prop changes
  useEffect(() => {
    setCurrentGroupIcon(group.icon);
  }, [group.icon]);

  const isUserOnline = (userId: string) => {
    return onlineUsers.some(onlineUser => onlineUser.userId === userId);
  };

  return (
    <div className="fixed inset-0 bg-transparent bg-opacity-80 backdrop-blur-md flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Group Info</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Group Content */}
        <div className="p-6">
          {/* Group Picture and Basic Info */}
          <div className="text-center mb-6">
            <div className="relative inline-block group">
              {currentGroupIcon ? (
                <img
                  src={currentGroupIcon}
                  alt={group.name}
                  className="w-24 h-24 rounded-full object-cover border-4 border-gray-200 mx-auto mb-4"
                />
              ) : (
                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-semibold text-2xl mx-auto mb-4">
                  {group.name.charAt(0).toUpperCase()}
                </div>
              )}
              
              {/* Admin controls for group icon - only show on hover */}
              {isCurrentUserAdmin && (
                <div className="absolute -bottom-2 -right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm hover:bg-blue-600 transition-colors"
                    title="Change group icon"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  {currentGroupIcon && (
                    <button
                      onClick={handleRemoveGroupIcon}
                      disabled={isUpdatingIcon}
                      className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
                      title="Remove group icon"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleImageSelect(e)}
                className="hidden"
              />
            </div>
            
            <h3 className="text-2xl font-semibold text-gray-900 mb-1">
              {group.name}
            </h3>
            
            {group.description && (
              <p className="text-gray-600 mb-2 text-sm max-w-xs mx-auto">
                {group.description}
              </p>
            )}
            
            <p className="text-gray-500 mb-2">
              {group.members.length} member{group.members.length !== 1 ? 's' : ''}
            </p>

            <p className="text-gray-500 text-sm">
              Created by {group.createdBy.username}
            </p>
          </div>

          {/* Members List */}
          <div className="mb-6">
            <h4 className="text-lg font-medium text-gray-900 mb-3">Members</h4>
            {!isCurrentUserActiveMember ? (
              <div className="text-center py-8">
                <div className="text-gray-500 mb-2">
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <p className="text-gray-500 text-sm">You were removed from this group</p>
                <p className="text-gray-400 text-xs mt-1">You can still view the chat history</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
              {group.members.map((member) => {
                const isOnline = isUserOnline(member.user._id);
                const isAdmin = member.role === 'admin';
                const isCurrentUser = member.user._id === currentUser.id;
                
                return (
                  <div
                    key={member.user._id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-sm font-medium text-gray-600 overflow-hidden">
                          {member.user.profilePicture ? (
                            <img
                              src={member.user.profilePicture}
                              alt={member.user.username}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            member.user.username.charAt(0).toUpperCase()
                          )}
                        </div>
                        {isOnline && (
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-sm font-medium ${
                            isCurrentUser ? 'text-blue-600' : 'text-gray-900'
                          }`}>
                            {member.user.username}
                            {isCurrentUser && ' (You)'}
                          </span>
                          {isAdmin && (
                            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                              Admin
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {isOnline ? 'Online' : 'Offline'}
                        </p>
                      </div>
                    </div>
                    
                    {/* Remove member button - only show for admins, not for current user, and only on hover */}
                    {isCurrentUserAdmin && !isCurrentUser && (
                      <button
                        onClick={() => handleRemoveMember(member.user._id, member.user.username)}
                        disabled={removingMemberId === member.user._id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center text-sm hover:bg-red-600 disabled:opacity-50"
                        title={`Remove ${member.user.username} from group`}
                      >
                        {removingMemberId === member.user._id ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {isCurrentUserActiveMember && (
            <div className="space-y-3">
              {isCurrentUserAdmin && (
              <button
                onClick={handleAddMembers}
                className="w-full px-4 py-3 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Members
              </button>
            )}
            
            {canLeaveGroup && (
              <button
                onClick={handleLeaveGroup}
                disabled={isLeaving}
                className="w-full px-4 py-3 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors flex items-center justify-center disabled:opacity-50"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                {isLeaving ? 'Leaving...' : 'Leave Group'}
              </button>
            )}
            
            {!canLeaveGroup && (
              <p className="text-xs text-gray-500 text-center">
                Group admin cannot leave the group
              </p>
            )}
            </div>
          )}
        </div>
      </div>

      {/* Image Crop Modal */}
      {showCropModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Crop Group Icon</h3>
            <div className="mb-4">
              {imgSrc && (
                <ReactCrop
                  crop={crop}
                  onChange={(_, percentCrop) => setCrop(percentCrop)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={1}
                >
                  <img
                    ref={imgRef}
                    alt="Crop me"
                    src={imgSrc}
                    onLoad={onImageLoad}
                    className="max-w-full max-h-64"
                  />
                </ReactCrop>
              )}            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={handleCropCancel}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleCropComplete(handleUpdateGroupIcon)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Apply Crop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupInfo;
