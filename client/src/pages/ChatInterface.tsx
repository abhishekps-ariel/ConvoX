import React, { useState, useEffect, useRef, useCallback } from "react";
import type { User, Message, OnlineUser, Conversation, Group } from "../types/chatTypes";
import LeftSidebar from "../components/chatComponents/LeftSidebar";
import ChatArea from "../components/chatComponents/ChatArea";
import { useAuth } from "../contexts/AuthContext";

const ChatInterface: React.FC = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [socket, setSocket] = useState<any>(null);
  
  // Store reference to LeftSidebar's functions
  const updateGroupsWithNewMessageRef = useRef<((message: Message, shouldIncrementUnread?: boolean) => void) | null>(null);
  const addNewGroupRef = useRef<((group: Group) => void) | null>(null);

  // Memoize the onGroupsChange callback to prevent unnecessary re-renders
  const onGroupsChange = useCallback(() => {
    // Groups are managed locally in LeftSidebar (EXACT same pattern as conversations)
    // No need to log every update
  }, []);

  // Memoize the onGroupMessageReceived callback to prevent unnecessary re-renders
  const onGroupMessageReceived = useCallback((message: Message, shouldIncrementUnread?: boolean) => {
    // Call LeftSidebar's updateGroupsWithNewMessage function (EXACT same pattern as conversations)
    if (updateGroupsWithNewMessageRef.current) {
      console.log('📱 ChatInterface calling LeftSidebar updateGroupsWithNewMessage:', {
        messageId: message._id,
        messageText: message.text?.substring(0, 20),
        shouldIncrementUnread,
        hasRef: !!updateGroupsWithNewMessageRef.current
      });
      updateGroupsWithNewMessageRef.current(message, shouldIncrementUnread);
    } else {
      console.log('❌ ChatInterface - no ref available');
    }
  }, []);

  // Memoize the onGroupCreated callback to prevent unnecessary re-renders
  const onGroupCreated = useCallback((group: Group) => {
    console.log('📱 ChatInterface group created:', {
      groupId: group._id,
      groupName: group.name,
      memberCount: group.members.length
    });
    // Add the new group to the LeftSidebar's group list
    if (addNewGroupRef.current) {
      addNewGroupRef.current(group);
    }
  }, []);


  // Reset all state when user changes (logout/login)
  useEffect(() => {
    if (!user) {
      // Clear all state when user logs out
      setConversations([]);
      setAllUsers([]);
      setSelectedUser(null);
      setSelectedGroup(null);
      setMessages([]);
      setOnlineUsers([]);
    }
  }, [user]);

  return (
    <div className="flex h-full w-full bg-white">
      <LeftSidebar
        selectedUser={selectedUser}
        selectedGroup={selectedGroup}
        conversations={conversations}
        allUsers={allUsers}
        onlineUsers={onlineUsers}
        messages={messages}
        onUserSelect={setSelectedUser}
        onGroupSelect={setSelectedGroup}
        onConversationsChange={setConversations}
        onAllUsersChange={setAllUsers}
        onGroupsChange={onGroupsChange}
        socket={socket}
        ref={(ref) => {
          // Store references to LeftSidebar's functions
          if (ref && ref.updateGroupsWithNewMessage) {
            updateGroupsWithNewMessageRef.current = ref.updateGroupsWithNewMessage;
          }
          if (ref && ref.addNewGroup) {
            addNewGroupRef.current = ref.addNewGroup;
          }
        }}
      />
      
      <ChatArea
        selectedUser={selectedUser}
        selectedGroup={selectedGroup}
        messages={messages}
        setMessages={setMessages}
        onlineUsers={onlineUsers}
        setOnlineUsers={setOnlineUsers}
        conversations={conversations}
        setConversations={setConversations}
        allUsers={allUsers}
        onSocketChange={setSocket}
        onGroupMessageReceived={onGroupMessageReceived}
        onGroupCreated={onGroupCreated}
      />
    </div>
  );
};

export default ChatInterface;
