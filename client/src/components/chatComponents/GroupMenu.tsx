import React, { useState } from 'react';
import GroupInfo from './GroupInfo';
import type { Group, User } from '../../types/chatTypes';

interface GroupMenuProps {
  group: Group;
  currentUser: User;
  onlineUsers: { userId: string; username: string }[];
  onLeaveGroup: (groupId: string) => void;
  onAddMembers: (groupId: string) => void;
}

const GroupMenu: React.FC<GroupMenuProps> = ({
  group,
  currentUser,
  onlineUsers,
  onLeaveGroup,
  onAddMembers
}) => {
  const [showGroupInfo, setShowGroupInfo] = useState(false);

  return (
    <>
      {/* Group Info Button */}
      <button
        onClick={() => setShowGroupInfo(true)}
        className="p-2 rounded-full hover:bg-gray-100 transition-colors"
        title="Group info"
      >
        <svg
          className="w-5 h-5 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>

      {/* Group Info Modal */}
      {showGroupInfo && (
        <GroupInfo
          group={group}
          currentUser={currentUser}
          onlineUsers={onlineUsers}
          onClose={() => setShowGroupInfo(false)}
          onLeaveGroup={onLeaveGroup}
          onAddMembers={onAddMembers}
        />
      )}
    </>
  );
};

export default GroupMenu;
