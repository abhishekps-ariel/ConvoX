import React from 'react';
import type { Group, Message } from '../../types/chatTypes';
import { formatLastMessageTime } from '../../utils/dateUtils';

interface GroupWithUnread extends Group {
  unreadCount: number;
  lastMessage: Message | null;
  hasLeft?: boolean;
  hasBeenRemoved?: boolean;
}

interface GroupListProps {
  groups: GroupWithUnread[];
  selectedGroup: Group | null;
  onGroupSelect: (group: Group) => void;
  currentUserId: string;
}

const GroupList: React.FC<GroupListProps> = ({
  groups,
  selectedGroup,
  onGroupSelect,
  currentUserId
}) => {
  if (groups.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p className="text-sm">No groups yet</p>
        <p className="text-xs mt-1">Create a group to start chatting with multiple people</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {groups.map(group => (
        <div
          key={group._id}
          onClick={() => onGroupSelect(group)}
          className={`flex items-center pl-4 pr-3 py-4 cursor-pointer transition duration-200 border-gray-100 last:border-b-0 relative ${
            selectedGroup?._id === group._id
              ? "bg-green-50"
              : group.unreadCount > 0
              ? "bg-green-50 hover:bg-green-100"
              : "hover:bg-gray-50"
          }`}
        >
          {/* Left border indicator */}
          <div className={`absolute left-0 top-0 bottom-0 w-1 ${
            selectedGroup?._id === group._id
              ? "bg-green-500"
              : group.unreadCount > 0
              ? "bg-transparent"
              : "bg-transparent"
          }`}></div>
          
          <div className="relative flex-shrink-0">
            {group.icon ? (
              <img
                src={group.icon}
                alt={group.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-gray-200"
              />
            ) : (
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-semibold">
                {group.name.charAt(0).toUpperCase()}
              </div>
            )}
            {/* Group indicator - could add member count or other indicators here */}
          </div>
          <div className="ml-4 flex-1 overflow-hidden min-w-0">
            <div className="flex justify-between items-start">
              <h3
                className={`font-medium truncate min-w-0 ${
                  group.unreadCount > 0
                    ? "text-gray-900 font-semibold"
                    : "text-gray-900"
                }`}
              >
                {group.name}
              </h3>
              <div className="flex items-center space-x-2 ml-2 flex-shrink-0">
                {group.lastMessage && (
                  <span
                    className={`text-xs whitespace-nowrap ${
                      group.unreadCount > 0
                        ? "text-gray-600 font-medium"
                        : "text-gray-500"
                    }`}
                  >
                    {formatLastMessageTime(group.lastMessage.createdAt)}
                  </span>
                )}
                <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                  {group.unreadCount > 0 && (
                    <span className="bg-green-600 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center font-medium">
                      {group.unreadCount > 99 ? "99+" : group.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {group.hasBeenRemoved ? (
              <p className="text-sm truncate mt-1 text-gray-500 italic">
                You were removed from this group
              </p>
            ) : group.hasLeft ? (
              <p className="text-sm truncate mt-1 text-gray-500 italic">
                You left the group
              </p>
            ) : group.lastMessage ? (
              <p
                className={`text-sm truncate mt-1 ${
                  group.unreadCount > 0
                    ? "text-gray-800 font-medium"
                    : "text-gray-600"
                }`}
              >
                {group.lastMessage.deletedForEveryone ? (
                  <span className="text-gray-400 italic">This message was deleted</span>
                ) : group.lastMessage.messageType === 'system' ? (
                  <span className="text-gray-500 italic">{group.lastMessage.text}</span>
                ) : group.lastMessage.sender._id === currentUserId ? (
                  `You: ${group.lastMessage.messageType === 'image' ? '📷 Image' : group.lastMessage.messageType === 'video' ? '🎥 Video' : group.lastMessage.text}`
                ) : (
                  `${group.lastMessage.sender.username}: ${group.lastMessage.messageType === 'image' ? '📷 Image' : group.lastMessage.messageType === 'video' ? '🎥 Video' : group.lastMessage.text}`
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

export default GroupList;
