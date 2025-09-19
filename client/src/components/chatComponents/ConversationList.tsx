import React from 'react';
import type { User, Conversation } from '../../types/chatTypes';
import { formatLastMessageTime } from '../../utils/dateUtils';

interface ConversationListProps {
  conversations: Conversation[];
  selectedUser: User | null;
  onUserSelect: (user: User) => void;
  currentUserId: string;
  isUserBlockedByMe: (userId: string) => boolean;
  isUserOnline: (userId: string) => boolean;
}

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedUser,
  onUserSelect,
  currentUserId,
  isUserBlockedByMe,
  isUserOnline
}) => {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 mt-24">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No conversations yet
        </h3>
        <p className="text-sm text-gray-500">
          Search for users to start chatting!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {conversations.map((conversation) => (
        <div
          key={conversation._id}
          onClick={() => onUserSelect({
            id: conversation._id,
            username: conversation.username,
            email: conversation.email,
            bio: conversation.bio,
            profilePicture: conversation.profilePicture
          })}
          className={`flex items-center pl-4 pr-3 py-4 cursor-pointer transition duration-200 border-gray-100 last:border-b-0 relative ${
            selectedUser?.id === conversation._id
              ? "bg-indigo-50"
              : conversation.unreadCount > 0
              ? "bg-blue-50 hover:bg-blue-100"
              : "hover:bg-gray-50"
          }`}
        >
          {/* Left border indicator */}
          <div className={`absolute left-0 top-0 bottom-0 w-1 ${
            selectedUser?.id === conversation._id
              ? "bg-indigo-500"
              : conversation.unreadCount > 0
              ? "bg-transparent"
              : "bg-transparent"
          }`}></div>
          
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold overflow-hidden">
              {conversation.profilePicture ? (
                <img
                  src={conversation.profilePicture}
                  alt={conversation.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                conversation.username.charAt(0).toUpperCase()
              )}
            </div>
            {isUserBlockedByMe(conversation._id) ? (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>
            ) : isUserOnline(conversation._id) && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></span>
            )}
          </div>
          <div className="ml-4 flex-1 overflow-hidden min-w-0">
            <div className="flex justify-between items-start">
              <h3
                className={`font-medium truncate min-w-0 ${
                  conversation.unreadCount > 0
                    ? "text-gray-900 font-semibold"
                    : "text-gray-900"
                }`}
              >
                {conversation.username}
              </h3>
              <div className="flex items-center space-x-2 ml-2 flex-shrink-0">
                {conversation.lastMessage && (
                <span
                  className={`text-xs whitespace-nowrap ${
                    conversation.unreadCount > 0
                      ? "text-gray-600 font-medium"
                      : "text-gray-500"
                  }`}
                >
                  {formatLastMessageTime(
                    conversation.lastMessage.createdAt
                  )}
                </span>
                )}
                <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                {conversation.unreadCount > 0 && (
                  <span className="bg-indigo-600 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center font-medium">
                    {conversation.unreadCount > 99
                      ? "99+"
                      : conversation.unreadCount}
                  </span>
                )}
                </div>
              </div>
            </div>
            {conversation.lastMessage ? (
            <p
              className={`text-sm truncate mt-1 ${
                conversation.unreadCount > 0
                  ? "text-gray-800 font-medium"
                  : "text-gray-600"
              }`}
            >
                {conversation.lastMessage.deletedForEveryone ? (
                  <span className="text-gray-400 italic">This message was deleted</span>
                ) : conversation.lastMessage.sender._id === currentUserId ? (
                  `You: ${conversation.lastMessage.messageType === 'image' ? '📷 Image' : conversation.lastMessage.messageType === 'video' ? '🎥 Video' : conversation.lastMessage.text}`
                ) : (
                  conversation.lastMessage.messageType === 'image' ? '📷 Image' : conversation.lastMessage.messageType === 'video' ? '🎥 Video' : conversation.lastMessage.text
                )}
              </p>
            ) : (
              <p className="text-sm truncate mt-1 text-gray-400 italic">
                No messages yet
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ConversationList;
