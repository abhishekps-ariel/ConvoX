import React, { useRef, useState } from "react";
import EmojiPicker from "emoji-picker-react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFaceSmile, faImage, faVideo } from '@fortawesome/free-solid-svg-icons';

interface InputMessageProps {
  newMessage: string;
  onMessageChange: (message: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVideoSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedImage: string | null;
  selectedVideo: string | null;
  isUploading: boolean;
  onSendImage: () => void;
  onSendVideo: () => void;
  onRemoveSelectedImage: () => void;
  onRemoveSelectedVideo: () => void;
  disabled?: boolean;
}

const InputMessage: React.FC<InputMessageProps> = ({
  newMessage,
  onMessageChange,
  onSendMessage,
  onImageSelect,
  onVideoSelect,
  selectedImage,
  selectedVideo,
  isUploading,
  onSendImage,
  onSendVideo,
  onRemoveSelectedImage,
  onRemoveSelectedVideo,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  return (
    <>
      {/* Image Preview */}
      {selectedImage && (
        <div className="px-6 py-2 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <img
                src={selectedImage}
                alt="Preview"
                className="w-16 h-16 object-cover rounded-lg"
              />
              <button
                onClick={onRemoveSelectedImage}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
              >
                ×
              </button>
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-600">Image selected</p>
              <p className="text-xs text-gray-500">Click send to share</p>
            </div>
            <button
              onClick={onSendImage}
              disabled={isUploading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isUploading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {/* Video Preview */}
      {selectedVideo && (
        <div className="px-6 py-2 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <video
                src={selectedVideo}
                className="w-16 h-16 object-cover rounded-lg"
                muted
              />
              <button
                onClick={onRemoveSelectedVideo}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
              >
                ×
              </button>
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-600">Video selected</p>
              <p className="text-xs text-gray-500">Click send to share</p>
            </div>
            <button
              onClick={onSendVideo}
              disabled={isUploading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isUploading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={onSendMessage}
        className="px-6 py-4 bg-white border-t border-gray-200 flex items-center space-x-3"
      >
        {/* Emoji Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            disabled={disabled}
            className="text-gray-600 text-2xl hover:text-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FontAwesomeIcon icon={faFaceSmile} />
          </button>
          {showEmojiPicker && (
            <div className="absolute bottom-12 left-0 z-50">
              <EmojiPicker
                onEmojiClick={(emojiData) =>
                  onMessageChange(newMessage + emojiData.emoji)
                }
              />
            </div>
          )}
        </div>
        <div className="flex-1 relative">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder={disabled ? "You left this group" : "Type a message..."}
            disabled={disabled}
            className="block w-full px-4 py-3 border border-gray-300 rounded-full leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100"
          />
        </div>
        <label className={`cursor-pointer ${disabled ? 'pointer-events-none' : ''}`}>
          <input 
            ref={fileInputRef}
            type="file" 
            accept="image/*" 
            hidden 
            onChange={onImageSelect}
            disabled={disabled}
          />
          <FontAwesomeIcon icon={faImage} className={`text-gray-600 text-2xl hover:text-indigo-600 transition-colors ${disabled ? 'opacity-50' : ''}`} />
        </label>
        <label className={`cursor-pointer ${disabled ? 'pointer-events-none' : ''}`}>
          <input 
            ref={videoInputRef}
            type="file" 
            accept="video/*" 
            hidden 
            onChange={onVideoSelect}
            disabled={disabled}
          />
          <FontAwesomeIcon icon={faVideo} className={`text-gray-600 text-2xl hover:text-indigo-600 transition-colors ${disabled ? 'opacity-50' : ''}`} />
        </label>
        <button
          type="submit"
          disabled={!newMessage.trim() || disabled}
          className="inline-flex items-center justify-center w-10 h-10 bg-indigo-600 text-white rounded-full hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
        >
          <svg
            className={`w-5 h-5 transition-transform duration-300 ease-in-out ${
              newMessage.trim() ? "rotate-90" : "rotate-0"
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </form>
    </>
  );
};

export default InputMessage;
