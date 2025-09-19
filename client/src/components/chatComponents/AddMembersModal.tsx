import React, { useState, useEffect } from 'react';
import type { User, Group } from '../../types/chatTypes';
import { fetchUsers, addMembersToGroup } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

interface AddMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: Group | null;
  currentUserId: string;
  onMembersAdded: () => void;
}

const AddMembersModal: React.FC<AddMembersModalProps> = ({
  isOpen,
  onClose,
  group,
  currentUserId,
  onMembersAdded
}) => {
  const { token, logout } = useAuth();
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && group) {
      loadAvailableUsers();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, group]);

  const loadAvailableUsers = async () => {
    if (!token || !group) return;
    
    setIsLoading(true);
    try {
      const users = await fetchUsers(token, logout);
      console.log('Fetched users:', users);
      // Filter out users who are already members of the group
      const existingMemberIds = group.members.map(member => 
        typeof member.user === 'string' ? member.user : member.user._id
      );
      console.log('Existing member IDs:', existingMemberIds);
      const available = users.filter(user => 
        user.id !== currentUserId &&
        !existingMemberIds.includes(user.id)
      );
      console.log('Available users:', available);
      setAvailableUsers(available);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserToggle = (userId: string) => {
    console.log('Toggling user:', userId, 'Current selected:', selectedUserIds);
    setSelectedUserIds(prev => {
      const newSelection = prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId];
      console.log('New selection:', newSelection);
      return newSelection;
    });
  };

  const handleSubmit = async () => {
    if (!group || selectedUserIds.length === 0 || !token) return;

    setIsSubmitting(true);
    try {
      await addMembersToGroup(token, group._id, selectedUserIds);
      onMembersAdded();
      onClose();
      setSelectedUserIds([]);
    } catch (error: any) {
      console.error('Error adding members:', error);
      const errorMessage = error?.message || 'Failed to add members to group';
      alert(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !group) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Add Members</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-200">
            <p className="text-sm text-gray-600">
              Add new members to <span className="font-medium">{group.name}</span>
            </p>
          </div>

          {/* User List */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : availableUsers.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                No available users to add
              </p>
            ) : (
              <div className="space-y-2">
                {availableUsers.map(user => (
                  <label
                    key={user.id}
                    className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      id={`user-${user.id}`}
                      checked={selectedUserIds.includes(user.id)}
                      onChange={() => handleUserToggle(user.id)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-medium text-gray-600 overflow-hidden">
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
                    <div>
                      <p className="text-sm font-medium text-gray-900">{user.username}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200">
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={selectedUserIds.length === 0 || isSubmitting}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Adding...' : `Add ${selectedUserIds.length} Member${selectedUserIds.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddMembersModal;
