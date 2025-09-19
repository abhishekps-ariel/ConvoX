import React, { useState, useRef } from 'react';
import { createGroup } from '../../services/api';
import type { User } from '../../types/chatTypes';
import { useImageCrop } from '../../hooks/useImageCrop';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated: () => void;
  users: User[];
  token: string;
}

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose,
  onGroupCreated,
  users,
  token
}) => {
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [groupIcon, setGroupIcon] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const {
    crop,
    setCrop,
    setCompletedCrop,
    imgSrc,
    showCropModal,
    setCroppedImage,
    imgRef,
    onImageLoad,
    handleImageSelect,
    handleCropComplete,
    handleCropCancel
  } = useImageCrop();

  const handleMemberToggle = (userId: string) => {
    setSelectedMembers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!groupName.trim()) {
      setError('Group name is required');
      return;
    }

    if (selectedMembers.length === 0) {
      setError('Please select at least one member');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await createGroup(token, groupName.trim(), description.trim(), selectedMembers, groupIcon);
      setGroupName('');
      setDescription('');
      setSelectedMembers([]);
      setGroupIcon('');
      setCroppedImage('');
      onGroupCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create group');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-transparent backdrop-blur-md flex items-center justify-center z-50 ">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">Create New Group</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Group Name *
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter group name"
              maxLength={50}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter group description"
              rows={3}
              maxLength={200}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Group Icon (Optional)
            </label>
            <div className="flex items-center space-x-4">
              <div className="relative">
                {groupIcon ? (
                  <div className="relative">
                    <img
                      src={groupIcon}
                      alt="Group Icon"
                      className="w-16 h-16 rounded-full object-cover border-2 border-gray-300"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setGroupIcon('');
                        setCroppedImage('');
                      }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-gray-400"
                  >
                    <span className="text-gray-400 text-2xl">+</span>
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
              <div>
                <p className="text-sm text-gray-600">
                  {groupIcon ? 'Click the × to remove' : 'Click to add group icon'}
                </p>
                <p className="text-xs text-gray-500">Recommended: 200x200px</p>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Members *
            </label>
            <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-md">
              {users.map(user => (
                <label key={user.id} className="flex items-center p-2 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(user.id)}
                    onChange={() => handleMemberToggle(user.id)}
                    className="mr-3"
                  />
                  <span className="text-sm">{user.username}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {selectedMembers.length} member(s) selected
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
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
              )}
            </div>
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
                onClick={() => handleCropComplete(setGroupIcon)}
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

export default CreateGroupModal;
