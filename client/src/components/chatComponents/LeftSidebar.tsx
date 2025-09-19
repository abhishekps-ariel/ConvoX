/* eslint-disable react-hooks/exhaustive-deps */
 
import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback, useMemo } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { fetchUsers, fetchConversations, markMessagesAsRead, checkBlockStatus, fetchUserGroups } from "../../services/api";
import type { User, OnlineUser, Conversation, Group, Message } from "../../types/chatTypes";

// Extended Group type with unread count and last message
interface GroupWithUnread extends Group {
  unreadCount: number;
  lastMessage: Message | null;
  hasLeft?: boolean;
  hasBeenRemoved?: boolean;
}
import CreateGroupModal from "./CreateGroupModal";
import GroupList from "./GroupList";
import ConversationList from "./ConversationList";

interface LeftSidebarProps {
  selectedUser: User | null;
  selectedGroup: Group | null;
  conversations: Conversation[];
  allUsers: User[];
  onlineUsers: OnlineUser[];
  messages: Message[];
  onUserSelect: (user: User | null) => void;
  onGroupSelect: (group: Group | null) => void;
  onConversationsChange: (conversations: Conversation[]) => void;
  onAllUsersChange: (users: User[]) => void;
  onGroupsChange: (groups: GroupWithUnread[]) => void;
  socket?: any;
}

const LeftSidebar = forwardRef<{ 
  updateGroupsWithNewMessage: (message: Message, shouldIncrementUnread?: boolean) => void;
  addNewGroup: (group: Group) => void;
}, LeftSidebarProps>(({
  selectedUser,
  selectedGroup,
  conversations,
  allUsers,
  onlineUsers,
  onUserSelect,
  onGroupSelect,
  onConversationsChange,
  onAllUsersChange,
  onGroupsChange,
  socket,
}, ref) => {
  const { user, token, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());

  // Note: Removed debounce tracking for markGroupMessagesAsRead to prevent race conditions
  
  // Function to mark group messages as read using socket
  const markGroupMessagesAsRead = (groupId: string) => {
    if (socket) {
      socket.emit('markGroupMessagesAsRead', { groupId });
    }
  };
  const [blockedByUsers, setBlockedByUsers] = useState<Set<string>>(new Set());
  // Local groups state (EXACT same pattern as conversations)
  const [groups, setGroups] = useState<GroupWithUnread[]>([]);
  
  // Set up refs for socket access
  useEffect(() => {
    selectedGroupRef.current = selectedGroup;
    userRef.current = user;
    // No need to set updateGroupsWithNewMessageRef since ChatArea handles it
  }, [selectedGroup, user]);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'chats' | 'groups'>('chats');

  // Performance optimization: Memoized filtered conversations
  const filteredConversationsMemo = useMemo(() => {
    if (!searchQuery) return conversations;
    return conversations.filter(conv => 
      conv.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [conversations, searchQuery]);

  // Performance optimization: Memoized filtered groups
  const filteredGroupsMemo = useMemo(() => {
    if (!searchQuery) return groups;
    return groups.filter(group => 
      group.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [groups, searchQuery]);

  // Performance optimization: Memoized filtered users for search
  const filteredUsers = useMemo(() => {
    return allUsers.filter(
      (u) =>
        u.id !== user?.id &&
        (u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.email.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [allUsers, user?.id, searchQuery]);
  
  // Refs for socket access
  const selectedGroupRef = useRef<Group | null>(null);
  const userRef = useRef<any>(null);
  const joinedRoomsRef = useRef<Set<string>>(new Set());

  //fetch conversations (users with chat history)
  useEffect(() => {
    if (token) {
      fetchConversations(token, logout).then(onConversationsChange);
    }
  }, [token, logout, onConversationsChange]);

  //fetch all users for search
  useEffect(() => {
    if (token) {
      fetchUsers(token, logout).then(onAllUsersChange);
    }
  }, [token, logout, onAllUsersChange]);

  //fetch user groups (EXACT same pattern as conversations)
  useEffect(() => {
    if (token) {
      fetchUserGroups(token, logout).then((userGroups) => {
        const groupsWithExtras = userGroups.map(g => ({
          ...g,
          unreadCount: (g as any).unreadCount ?? 0,
          lastMessage: (g as any).lastMessage ?? null
        }));
        setGroups(groupsWithExtras);
        onGroupsChange(groupsWithExtras);
        
        // Join all group rooms for real-time updates (only if not already joined)
        userGroups.forEach(group => {
          const roomId = `group_${group._id}`;
          if (socket && socket.connected && !joinedRoomsRef.current.has(roomId)) {
            socket.emit('joinGroupChat', group._id);
            joinedRoomsRef.current.add(roomId);
          }
        });
      });
    }
  }, [token, logout, socket, onGroupsChange]);

  // Join group rooms when socket becomes available (only if not already joined)
  useEffect(() => {
    if (socket && socket.connected && groups.length > 0) {
      groups.forEach(group => {
        const roomId = `group_${group._id}`;
        if (!joinedRoomsRef.current.has(roomId)) {
          socket.emit('joinGroupChat', group._id);
          joinedRoomsRef.current.add(roomId);
        }
      });
    }
  }, [socket, groups]);

  // Note: Removed tab switching refresh to prevent UI flickering
  // Groups are already loaded on initial mount and updated via real-time events

  const isUserOnline = (userId: string) => {
    // Don't show online status for users who have blocked us
    if (isUserBlockedByThem(userId)) return false;
    return onlineUsers.some((u) => u.userId === userId);
  };

  const isUserBlockedByMe = (userId: string) =>
    blockedUsers.has(userId);

  const isUserBlockedByThem = (userId: string) =>
    blockedByUsers.has(userId);


  // Check block status for all users
  const checkBlockStatusForUsers = async () => {
    if (!token) return;
    
    const allUserIds = [...allUsers.map(u => u.id), ...conversations.map(c => c._id)];
    const uniqueUserIds = [...new Set(allUserIds)];
    
    for (const userId of uniqueUserIds) {
      if (userId !== user?.id) {
        try {
          const result = await checkBlockStatus(token, userId);
          if (result?.isBlockedByMe) {
            setBlockedUsers(prev => new Set([...prev, userId]));
          } else {
            setBlockedUsers(prev => {
              const newSet = new Set(prev);
              newSet.delete(userId);
              return newSet;
            });
          }
          
          if (result?.isBlockedByThem) {
            setBlockedByUsers(prev => new Set([...prev, userId]));
          } else {
            setBlockedByUsers(prev => {
              const newSet = new Set(prev);
              newSet.delete(userId);
              return newSet;
            });
          }
        } catch (error) {
          console.error('Error checking block status for user:', userId, error);
        }
      }
    }
  };

  // Check block status when users or conversations change
  useEffect(() => {
    if (allUsers.length > 0 || conversations.length > 0) {
      checkBlockStatusForUsers();
    }
  }, [allUsers, conversations, token, user?.id]);

  const handleUserSelect = async (user: User) => {
    // If clicking on the same user, close the chat
    if (selectedUser?.id === user.id) {
      onUserSelect(null);
      onGroupSelect(null); // Close any selected group
      setShowSearchResults(false);
      setSearchQuery("");
      return;
    }

    // Otherwise, open the chat with the selected user
    onUserSelect(user);
    onGroupSelect(null); // Close any selected group
    setShowSearchResults(false);
    setSearchQuery("");

    // Mark messages as read first, then update UI
    if (token && user.id) {
      try {
        const result = await markMessagesAsRead(token, user.id);
        
        // Only update UI if API call was successful
        if (result) {
          onConversationsChange(
            conversations.map((conv) =>
              conv._id === user.id ? { ...conv, unreadCount: 0 } : conv
            )
          );
        }
      } catch (error) {
        console.error('Error marking messages as read:', error);
        // Don't update UI if API call failed
      }
    }
  };

  

  const handleGroupSelect = async (group: Group) => {
    // If clicking on the same group, close the chat
    if (selectedGroup?._id === group._id) {
      onGroupSelect(null);
      onUserSelect(null); // Close any selected user
      return;
    }

    // Mark messages as read on server FIRST (before updating UI)
    markGroupMessagesAsRead(group._id);

    // Then update the UI
    onGroupSelect(group);
    onUserSelect(null); // Close any selected user
    
    // Reset unread count for this group
    setGroups(prevGroups => {
      const updatedGroups = prevGroups.map(g => {
        if (g._id === group._id) {
          return { ...g, unreadCount: 0 };
        }
        return g;
      });
      
      // Update the parent component with the new groups state
    onGroupsChange(updatedGroups);
    
      return updatedGroups;
      });
  };

  // Update groups with new message (simplified approach)
  const updateGroupsWithNewMessage = useCallback((message: Message, shouldIncrementUnread: boolean = true) => {
    // Only handle group messages (not direct messages)
    if (!message.group) return;
    
    const messageGroupId = typeof message.group === 'string' ? message.group : message.group?._id;
    
    
    
    setGroups(prevGroups => {
      const existingGroupIndex = prevGroups.findIndex(
        (group) => group._id === messageGroupId
      );

      if (existingGroupIndex >= 0) {
        const existingGroup = prevGroups[existingGroupIndex];
        
        // Don't update unread counts for removed or left members
        if (existingGroup.hasBeenRemoved || existingGroup.hasLeft) {
          return prevGroups; // Return unchanged groups
        }
        
        // Check if this message is already the latest message to prevent duplicate updates
        if (existingGroup.lastMessage && existingGroup.lastMessage._id === message._id) {
          // Allow updates for edited or deleted messages (same ID but different content)
          const isEditedOrDeleted = message.isEdited || message.deletedForEveryone || message.deletedForSender || message.deletedForReceiver;
          if (!isEditedOrDeleted) {
            return prevGroups; // Return unchanged if this message is already the latest and not edited/deleted
          }
        }
        
        // Update existing group (EXACT same pattern as normal chats)
        const updatedGroups = [...prevGroups];

        // Check if this is the currently open group
        const isCurrentGroupOpen = selectedGroup?._id === messageGroupId;

        // Handle different message update scenarios
        let updatedLastMessage: Message | null = message;
        let newUnreadCount = existingGroup.unreadCount || 0;

        // Check if this is a delete operation
        const isDeleteOperation = message.deletedForSender || message.deletedForReceiver || message.deletedForEveryone;
        
        if (isDeleteOperation) {
          // Handle delete logic similar to conversations
          if (message.deletedForEveryone) {
            // For "delete for everyone", show the deleted message
            updatedLastMessage = {
              ...message,
              deletedForSender: message.deletedForSender,
              deletedForReceiver: message.deletedForReceiver,
              deletedForEveryone: message.deletedForEveryone,
              deletedAt: message.deletedAt
            };
          } else {
            // For "delete for me", don't update the group list here
            // This is handled by the onMessageDelete callback to avoid conflicts
            return prevGroups; // Return unchanged groups
          }
        } else {
          // Handle edit, new message, or existing message that should become last message
          // If shouldIncrementUnread is false, this might be an existing message that should become the last message
          // (e.g., when a message is deleted and we need to show the previous message)
          // Handle edit or new message
          // If this is the currently open group, mark the message as read on server immediately
          if (isCurrentGroupOpen && message.sender._id !== user?.id) {
            markGroupMessagesAsRead(messageGroupId);
          }

          // Calculate unread count based on whether user is viewing the group and if they sent the message
          if (isCurrentGroupOpen) {
            // If viewing the group, unread count should be 0
            newUnreadCount = 0;
          } else if (message.sender._id === user?.id) {
            // If current user sent the message, don't increment unread count
            newUnreadCount = existingGroup.unreadCount || 0;
          } else {
            // If someone else sent the message and we're not viewing the group, increment unread count only if shouldIncrementUnread is true
            newUnreadCount = shouldIncrementUnread ? (existingGroup.unreadCount || 0) + 1 : (existingGroup.unreadCount || 0);
          }
        }


        updatedGroups[existingGroupIndex] = {
          ...existingGroup,
          lastMessage: updatedLastMessage,
          unreadCount: newUnreadCount,
        };

        // Move to top (EXACT same pattern as normal chats)
        const [updatedGroup] = updatedGroups.splice(existingGroupIndex, 1);
        const newGroupsState = [updatedGroup, ...updatedGroups];
        
        // Call onGroupsChange with the new state
        onGroupsChange(newGroupsState);
        
        return newGroupsState;
      } else {
        // Create new group conversation (EXACT same pattern as normal chats)
        const newGroup: any = {
          _id: messageGroupId,
          name: typeof message.group === 'string' ? 'Group' : message.group?.name || 'Group',
          lastMessage: message,
          unreadCount: shouldIncrementUnread && message.sender._id !== user?.id ? 1 : 0,
        };
        const newGroupsState = [newGroup, ...prevGroups];
        
        // Call onGroupsChange with the new state
        onGroupsChange(newGroupsState);
        
        return newGroupsState as any;
      }
    });
  }, [user?.id, selectedGroup, onGroupsChange]);

  // Function to add a new group to the list (for real-time group creation)
  const addNewGroup = useCallback((group: Group) => {
    
    // Convert the group to GroupWithUnread format
    // For newly created groups, we need to include the system message and unread count
    const groupWithUnread: GroupWithUnread = {
      ...group,
      // Set unread count to 1 for the system message (unless current user is the creator)
      unreadCount: group.createdBy._id === user?.id ? 0 : 1,
      // Include the latest message (system message) if it exists
      lastMessage: group.latestMessage ? {
        _id: group.latestMessage.messageId,
        text: group.latestMessage.text || '',
        messageType: group.latestMessage.messageType,
        sender: {
          _id: group.latestMessage.sender,
          username: group.latestMessage.senderUsername || 'System'
        },
        createdAt: group.latestMessage.createdAt,
        isRead: false
      } : null
    };
    
    // Add the new group to the beginning of the list
    setGroups(prevGroups => {
      // Check if group already exists to avoid duplicates
      const exists = prevGroups.some(g => g._id === group._id);
      if (exists) {
        return prevGroups;
      }
      
      const newGroups = [groupWithUnread, ...prevGroups];
      onGroupsChange(newGroups);
      return newGroups;
    });

    // Join the group chat room for real-time updates
    if (socket && socket.connected) {
      const roomId = `group_${group._id}`;
      if (!joinedRoomsRef.current.has(roomId)) {
        socket.emit('joinGroupChat', group._id);
        joinedRoomsRef.current.add(roomId);
      }
    }
  }, [onGroupsChange, socket, user?.id]);

  // Expose functions to parent component
  useImperativeHandle(ref, () => ({
    updateGroupsWithNewMessage,
    addNewGroup
  }), [updateGroupsWithNewMessage, addNewGroup]);

  const handleGroupCreated = () => {
    // Refresh groups list (EXACT same pattern as normal chats)
    if (token) {
      fetchUserGroups(token, logout).then((userGroups) => {
        const groupsWithExtras = userGroups.map(g => ({
          ...g,
          unreadCount: (g as any).unreadCount ?? 0,
          lastMessage: (g as any).lastMessage ?? null
        }));
        setGroups(groupsWithExtras);
        onGroupsChange(groupsWithExtras);
      });
    }
  };





  // No longer needed - groups are updated directly via ChatArea like normal chats

  // Clear unread count when a group is selected (like normal chats)
  useEffect(() => {
    if (selectedGroup && token) {
      
      // Update local state immediately for better UX (EXACT same pattern as conversations)
      setGroups(prevGroups =>
        prevGroups.map(group => 
        group._id === selectedGroup._id 
          ? { ...group, unreadCount: 0 }
          : group
        )
      );
      
      // Note: We don't automatically mark messages as read here
      // Messages are only marked as read when user actually clicks on a group (in handleGroupSelect)
    }
  }, [selectedGroup, token]);

  // Continuously ensure unread count stays at 0 for currently open group
  useEffect(() => {
    if (selectedGroup) {
      setGroups(prevGroups => {
        const hasUnreadInOpenGroup = prevGroups.some(group => 
          group._id === selectedGroup._id && group.unreadCount > 0
        );
        
        if (hasUnreadInOpenGroup) {
          return prevGroups.map(group => 
            group._id === selectedGroup._id 
              ? { ...group, unreadCount: 0 }
              : group
          );
        }
        
        return prevGroups;
      });
    }
  }, [selectedGroup]);


  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowSearchResults(false);
    };

    if (showSearchResults) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showSearchResults]);

  return (
    <div className="w-80 bg-white flex flex-col overflow-hidden border-r border-gray-200">
      {/* Search */}
      <div className="px-6 py-4 border-b border-gray-200 relative">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearchResults(e.target.value.length > 0);
            }}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          />
        </div>

        {/* Search Results */}
        {showSearchResults && searchQuery && (
          <div className="absolute top-full left-6 right-6 bg-white border border-gray-200 rounded-md mt-1 max-h-60 overflow-y-auto z-10 shadow-lg">
            {filteredUsers.map((userItem) => (
              <div
                key={userItem.id}
                onClick={() => handleUserSelect(userItem)}
                className="flex items-center p-3 cursor-pointer hover:bg-gray-50 transition duration-200 border-b border-gray-100 last:border-b-0"
              >
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold overflow-hidden">
                    {userItem.profilePicture ? (
                      <img
                        src={userItem.profilePicture}
                        alt={userItem.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      userItem.username.charAt(0).toUpperCase()
                    )}
                  </div>
                  {isUserBlockedByMe(userItem.id) ? (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>
                  ) : isUserOnline(userItem.id) && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></span>
                  )}
                </div>
                <div className="ml-3 flex-1 overflow-hidden min-w-0">
                  <h3 className="font-medium text-gray-900 truncate">
                    {userItem.username}
                  </h3>
                  <p className="text-sm text-gray-500 truncate">
                    {userItem.email}
                  </p>
                </div>
              </div>
            ))}
            {filteredUsers.length === 0 && (
              <div className="p-3 text-gray-500 text-center text-sm">
                No users found
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="px-6 py-2 border-b border-gray-200">
  <div className="flex space-x-1 relative">
    {/* Highlight animation bar */}
    <div
      className={`absolute bottom-0 h-0.5 bg-blue-500 transition-all duration-300 ease-in-out ${
        activeTab === 'chats' ? 'left-0 w-1/2' : 'left-1/2 w-1/2'
      }`}
    />
    
          <button
            onClick={() => setActiveTab('chats')}
      className={`relative px-3 py-2 text-sm font-medium rounded-md transition-all duration-300 ease-in-out w-full ${
              activeTab === 'chats'
          ? 'text-blue-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Chats
          </button>
          <button
            onClick={() => setActiveTab('groups')}
      className={`relative px-3 py-2 text-sm font-medium rounded-md transition-all duration-300 ease-in-out w-full ${
              activeTab === 'groups'
          ? 'text-blue-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Groups
          </button>
        </div>
      </div>


      {/* Groups Tab */}
      {activeTab === 'groups' && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-3 border-b border-gray-200">
            <button
              onClick={() => setShowCreateGroupModal(true)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Create New Group
            </button>
          </div>
          <div className="pl-1">
            <GroupList
              groups={filteredGroupsMemo as any}
              selectedGroup={selectedGroup}
              onGroupSelect={handleGroupSelect}
              currentUserId={user?.id || ''}
            />
          </div>
        </div>
      )}

      {/* Conversations Tab */}
      {activeTab === 'chats' && (
      <div className="flex-1 overflow-y-auto">
          <div className="pl-1">
            <ConversationList
              conversations={filteredConversationsMemo}
              selectedUser={selectedUser}
              onUserSelect={handleUserSelect}
              currentUserId={user?.id || ''}
              isUserBlockedByMe={isUserBlockedByMe}
              isUserOnline={isUserOnline}
            />
          </div>
      </div>
      )}

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={showCreateGroupModal}
        onClose={() => setShowCreateGroupModal(false)}
        onGroupCreated={handleGroupCreated}
        users={allUsers.filter(u => u.id !== user?.id)}
        token={token || ''}
      />
    </div>
  );
});

LeftSidebar.displayName = 'LeftSidebar';

export default LeftSidebar;
