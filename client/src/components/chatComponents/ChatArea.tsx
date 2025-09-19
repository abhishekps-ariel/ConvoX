import React, { useRef, useEffect, useState, useMemo } from "react";
import { useAuth } from "../../contexts/AuthContext";
import useSocket from "../../hooks/useSockets";
import { fetchMessages, fetchGroupMessages } from "../../services/api";
import type { User, Message, OnlineUser, Conversation, Group } from "../../types/chatTypes";
import ChatHeader from "./ChatHeader";
import MessageArea from "./MessageArea";
import InputMessage from "./InputMessage";
import GroupMenu from "./GroupMenu";
import AddMembersModal from "./AddMembersModal";

interface ChatAreaProps {
  selectedUser: User | null;
  selectedGroup: Group | null;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onlineUsers: OnlineUser[];
  setOnlineUsers: React.Dispatch<React.SetStateAction<OnlineUser[]>>;
  conversations: Conversation[];
  setConversations: (conversations: Conversation[]) => void;
  allUsers: User[];
  onSocketChange?: (socket: any) => void;
  onGroupMessageReceived?: (message: Message, shouldIncrementUnread?: boolean) => void;
  onGroupCreated?: (group: Group) => void;
}

// Helper function to check if a message is deleted for a specific user
const isMessageDeletedForUser = (message: Message, userId?: string): boolean => {
  if (!userId) return false;
  
  // For group messages, check if the current user deleted it for themselves
  if (message.group) {
    // If the current user is the sender, check deletedForSender
    if (message.sender._id === userId) {
      return message.deletedForSender || false;
    } else {
      // If the current user is not the sender, check if they're in deletedForUsers array
      return !!(message.deletedForUsers && message.deletedForUsers.includes(userId));
    }
  }
  
  // For direct messages, use the original logic
  if (message.sender._id === userId) {
    return message.deletedForSender || false;
  } else {
    return message.deletedForReceiver || false;
  }
};

const ChatArea: React.FC<ChatAreaProps> = ({
  selectedUser,
  selectedGroup,
  messages,
  setMessages,
  onlineUsers,
  setOnlineUsers,
  conversations,
  setConversations,
  allUsers,
  onSocketChange,
  onGroupMessageReceived,
  onGroupCreated,
}) => {
  const { user, token, logout } = useAuth();

  // Performance optimization: Memoized filtered messages
  const visibleMessages = useMemo(() => {
    return messages.filter(msg => !isMessageDeletedForUser(msg, user?.id));
  }, [messages, user?.id]);


  // Performance optimization: Memory cleanup for old messages
  useEffect(() => {
    const MAX_MESSAGES = 200; // Keep only last 200 messages in memory
    if (messages.length > MAX_MESSAGES) {
      const messagesToKeep = messages.slice(-MAX_MESSAGES);
      setMessages(messagesToKeep);
    }
  }, [messages, setMessages]);
  const [newMessage, setNewMessage] = useState("");
  const [showScrollButton] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [viewingVideo, setViewingVideo] = useState<string | null>(null);
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [forceScrollToBottom, setForceScrollToBottom] = useState(false);
  
  // Remove excessive logging to clean up console
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleMessagesRead = (senderId: string) => {
    // Update conversations to reflect read status
    setConversations(
      conversations.map((conv) =>
        conv._id === senderId ? { ...conv, unreadCount: 0 } : conv
      )
    );
    
    // Update local messages to show read status
    setMessages(prevMessages => 
      prevMessages.map(message => 
        message.sender._id === senderId && !message.isRead
          ? { ...message, isRead: true }
          : message
      )
    );
  };

  const updateConversationWithNewMessage = (message: Message, shouldIncrementUnread: boolean = true) => {
    // Only handle direct messages (not group messages)
    if (!message.receiver || message.group) return;
    
    const otherUserId =
      message.sender._id === user?.id
        ? message.receiver._id
        : message.sender._id;
    const existingConvIndex = conversations.findIndex(
      (conv) => conv._id === otherUserId
    );

    if (existingConvIndex >= 0) {
      // Update existing conversation
      const updatedConversations = [...conversations];
      const existingConv = updatedConversations[existingConvIndex];

      const newUnreadCount =
        shouldIncrementUnread && message.receiver._id === user?.id
          ? existingConv.unreadCount + 1
          : existingConv.unreadCount;

      updatedConversations[existingConvIndex] = {
        ...existingConv,
        lastMessage: message,
        unreadCount: newUnreadCount,
      };

      // Move to top
      const [updatedConv] = updatedConversations.splice(
        existingConvIndex,
        1
      );
      setConversations([updatedConv, ...updatedConversations]);
    } else {
      // Create new conversation if it doesn't exist
      // Use user info from the message itself, not from allUsers
      const otherUser = message.sender._id === user?.id ? message.receiver : message.sender;
      const newUnreadCount =
        shouldIncrementUnread && message.receiver._id === user?.id ? 1 : 0;

      const newConversation: Conversation = {
        _id: otherUserId,
        username: otherUser.username,
        email: (otherUser as any).email || "",
        lastMessage: message,
        unreadCount: newUnreadCount,
      };

      setConversations([newConversation, ...conversations]);
    }
  };

  // Update groups via callback (EXACT same pattern as updateConversationWithNewMessage)
  const updateGroupsWithNewMessage = (message: Message, shouldIncrementUnread: boolean = true) => {
    console.log('🔄 ChatArea updateGroupsWithNewMessage called:', {
      messageId: message._id,
      messageText: message.text?.substring(0, 20),
      shouldIncrementUnread
    });
    
    // Only handle group messages (not direct messages)
    if (!message.group || !onGroupMessageReceived) {
      console.log('❌ ChatArea early return - missing group or callback');
      return;
    }
    
    // Call the callback to update groups
    onGroupMessageReceived(message, shouldIncrementUnread);
    console.log('✅ ChatArea called onGroupMessageReceived callback');
  };

  const socketHook = useSocket(
    token,
    logout,
    selectedUser,
    selectedGroup,
    setMessages,
    setOnlineUsers,
    handleMessagesRead,
    updateConversationWithNewMessage,
    user?.id,
    (message: Message) => {
      // Update conversation list when message is edited via socket
      const updatedConversations = conversations.map((conv: Conversation) => {
        if (conv.lastMessage && conv.lastMessage._id === message._id) {
          return {
            ...conv,
            lastMessage: {
              ...conv.lastMessage,
              text: message.text,
              isEdited: message.isEdited,
              editedAt: message.editedAt
            }
          };
        }
        return conv;
      });
      setConversations(updatedConversations);
    },
    (message: Message) => {
      // Update conversation list when message is deleted via socket
      const updatedConversations = conversations.map((conv: Conversation) => {
        if (conv.lastMessage && conv.lastMessage._id === message._id) {
          // If it's "delete for everyone", show the deleted message
          if (message.deletedForEveryone) {
            return {
              ...conv,
              lastMessage: {
                ...conv.lastMessage,
                deletedForSender: message.deletedForSender,
                deletedForReceiver: message.deletedForReceiver,
                deletedForEveryone: message.deletedForEveryone,
                deletedAt: message.deletedAt
              }
            };
          } else {
            // For "delete for me", find the previous non-deleted message in the same conversation
            const previousMessages = messages.filter(msg => {
              // Check if it's the same conversation (either direction)
              const isSameConversation = (
                (msg.sender._id === message.sender._id && msg.receiver && message.receiver && msg.receiver._id === message.receiver._id) ||
                (msg.sender._id === message.receiver?._id && msg.receiver && message.receiver && msg.receiver._id === message.sender._id)
              );
              
              return msg._id !== message._id && 
                     isSameConversation &&
                     !isMessageDeletedForUser(msg, user?.id);
            });
            
            // Sort by creation time to get the most recent message
            previousMessages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            
            const newLastMessage = previousMessages.length > 0 
              ? previousMessages[0] // Most recent message
              : null;
            
            console.log('🔄 Found previous message for normal chat delete:', {
              deletedMessageId: message._id,
              previousMessageId: newLastMessage?._id,
              previousMessageText: newLastMessage?.text?.substring(0, 20),
              totalPreviousMessages: previousMessages.length
            });
            
            return {
              ...conv,
              lastMessage: newLastMessage
            };
          }
        }
        return conv;
      });
      setConversations(updatedConversations);
    },
    updateGroupsWithNewMessage,
    (message: Message) => {
      // Update group list when message is edited via socket
      if (onGroupMessageReceived) {
        onGroupMessageReceived(message, false);
      }
    },
    (message: Message) => {
      // Update group list when message is deleted via socket
      if (onGroupMessageReceived && message.deletedForEveryone) {
        onGroupMessageReceived(message, false);
      }
    },
    (group: Group) => {
      // Handle group creation - call the parent callback
      console.log('🟢 Group created in ChatArea:', {
        groupId: group._id,
        groupName: group.name
      });
      if (onGroupCreated) {
        onGroupCreated(group);
      }
    }
  );

  const { socket, sendGroupMessage, joinGroupChat, markGroupMessagesAsRead } = socketHook;

  // Pass socket to parent component
  useEffect(() => {
    if (socket && onSocketChange) {
      onSocketChange(socket);
    }
  }, [socket, onSocketChange]);

  // fetch messages for selected user
  useEffect(() => {
    if (token && selectedUser) {
      setForceScrollToBottom(true); // Force scroll to bottom when opening new conversation
      fetchMessages(token, selectedUser.id, logout).then((fetchedMessages) => {
        setMessages(fetchedMessages);
        // Reset the force scroll flag after a short delay
        setTimeout(() => {
          setForceScrollToBottom(false);
        }, 100);
      });
    } else {
      setMessages([]);
    }
  }, [selectedUser, token, logout, setMessages]);

  // fetch messages for selected group
  useEffect(() => {
    if (token && selectedGroup) {
      setForceScrollToBottom(true); // Force scroll to bottom when opening new group
      
      // Only fetch from API if we don't have messages for this group
      if (messages.length === 0 || messages[0]?.group?._id !== selectedGroup._id) {
      fetchGroupMessages(token, selectedGroup._id, 1, 50).then(async (fetchedMessages) => {
        console.log('Fetched group messages from API:', fetchedMessages.length);
          // Filter messages on client side to handle delete status properly
          const filteredMessages = filterMessagesForUser(fetchedMessages, user?.id);
          console.log('Filtered group messages for user:', filteredMessages.length);
          setMessages(filteredMessages);
        
        // Mark group messages as read
          markGroupMessagesAsRead(selectedGroup._id);
        
        // Reset the force scroll flag after a short delay
        setTimeout(() => {
          setForceScrollToBottom(false);
        }, 100);
      });
      } else {
        // Just mark as read if we already have messages
        markGroupMessagesAsRead(selectedGroup._id);
        setForceScrollToBottom(false);
      }
    } else if (!selectedUser) {
      setMessages([]);
    }
  }, [selectedGroup, token, logout, setMessages, selectedUser, markGroupMessagesAsRead, messages, user?.id]);

  // Handle socket emit for marking messages as read
  useEffect(() => {
    if (socket && socket.connected && selectedUser && token) {
      socket.emit("markMessagesAsRead", { senderId: selectedUser.id });
    }
  }, [socket, selectedUser, token]);

  // Handle joining/leaving chat rooms for read status tracking
  useEffect(() => {
    if (socket && socket.connected && selectedUser) {
      // Join the chat room when user selects a chat
      socket.emit("joinChat", selectedUser.id);
      
      // Cleanup: leave the chat room when component unmounts or user changes
      return () => {
        if (socket && socket.connected) {
          socket.emit("leaveChat", selectedUser.id);
        }
      };
    }
  }, [socket, selectedUser]);

  // Handle joining/leaving group chat rooms
  useEffect(() => {
    if (selectedGroup) {
      // Join the group chat room when group is selected
      joinGroupChat(selectedGroup._id);
      
      // Note: We don't leave group chat rooms when switching groups
      // Users should stay in all group rooms to receive real-time updates
      // (unlike 1-on-1 chats where rooms are temporary)
    }
  }, [selectedGroup, joinGroupChat]);

  // Join all group rooms for real-time updates (regardless of which group is selected)
  useEffect(() => {
    if (socket && socket.connected && allUsers.length > 0) {
      // This will be handled by the LeftSidebar component when groups are loaded
      console.log('🔥 Socket connected, ready to join group rooms');
    }
  }, [socket, allUsers]);

  // Scroll functionality is now handled in MessageArea component
  const scrollToBottom = () => {
    // This function is passed to MessageArea but not used here
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      // Check file size (limit to 50MB)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        alert('Video file is too large. Please select a video smaller than 50MB.');
        return;
      }
      
      console.log(`Selected video: ${file.name}, size: ${Math.round(file.size / 1024)}KB`);
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setSelectedVideo(result);
        console.log(`Video base64 size: ${Math.round(result.length / 1024)}KB`);
      };
      reader.readAsDataURL(file);
    }
  };


  // Filter messages based on delete status for the current user
  const filterMessagesForUser = (messages: Message[], userId?: string) => {
    if (!userId) return messages;
    
    return messages.filter(message => {
      // Always show messages that are deleted for everyone (they show "This message was deleted")
      if (message.deletedForEveryone) {
        return true;
      }
      
      // For group messages, check if the user deleted it for themselves
      if (message.group) {
        return !isMessageDeletedForUser(message, userId);
      }
      
      // For direct messages, use the original logic
      if (message.sender._id === userId && message.deletedForSender) {
        return false;
      }
      
      if (message.receiver && message.receiver._id === userId && message.deletedForReceiver) {
        return false;
      }
      
      return true;
    });
  };

  const handleSendImage = async () => {
    if (!selectedImage || (!selectedUser && !selectedGroup) || !socket || !socket.connected || isUploading) return;

    setIsUploading(true);

    // Temporary optimistic message
    const tempMessage: Message = {
      _id: `temp-${Date.now()}`,
      sender: { _id: user?.id || "", username: user?.username || "" },
      receiver: selectedUser ? { _id: selectedUser.id, username: selectedUser.username } : undefined,
      group: selectedGroup ? { _id: selectedGroup._id, name: selectedGroup.name } : undefined,
      text: "",
      imageUrl: selectedImage,
      messageType: 'image',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMessage]);
    updateConversationWithNewMessage(tempMessage, false);

    // Send via socket based on type
    if (selectedUser) {
    socket.emit("sendMessage", {
      receiverId: selectedUser.id,
      imageData: selectedImage,
      messageType: 'image'
    });
    } else if (selectedGroup) {
      sendGroupMessage(selectedGroup._id, "", 'image', selectedImage);
    }
    
    setSelectedImage(null);
    setIsUploading(false);
    
    // Clear file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendVideo = async () => {
    if (!selectedVideo || (!selectedUser && !selectedGroup) || !socket || !socket.connected || isUploading) return;

    setIsUploading(true);

    // Log video sending attempt
    const targetName = selectedUser?.username || selectedGroup?.name || 'unknown';
    console.log(`Attempting to send video to ${targetName}`);
    console.log(`Video base64 size: ${Math.round(selectedVideo.length / 1024)}KB`);

    // Temporary optimistic message
    const tempMessage: Message = {
      _id: `temp-${Date.now()}`,
      sender: { _id: user?.id || "", username: user?.username || "" },
      receiver: selectedUser ? { _id: selectedUser.id, username: selectedUser.username } : undefined,
      group: selectedGroup ? { _id: selectedGroup._id, name: selectedGroup.name } : undefined,
      text: "",
      videoUrl: selectedVideo,
      messageType: 'video',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMessage]);
    updateConversationWithNewMessage(tempMessage, false);

    try {
      // Send via socket based on type
      if (selectedUser) {
      socket.emit("sendMessage", {
        receiverId: selectedUser.id,
        videoData: selectedVideo,
        messageType: 'video'
      });
      } else if (selectedGroup) {
        sendGroupMessage(selectedGroup._id, "", 'video', undefined, selectedVideo);
      }
      
      console.log('Video message sent via socket');
    } catch (error) {
      console.error('Error sending video message:', error);
      // Remove the optimistic message if sending fails
      setMessages((prev) => prev.filter(msg => msg._id !== tempMessage._id));
    }
    
    setSelectedVideo(null);
    setIsUploading(false);
    
    // Clear file input
    if (videoInputRef.current) {
      videoInputRef.current.value = '';
    }
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeSelectedVideo = () => {
    setSelectedVideo(null);
    if (videoInputRef.current) {
      videoInputRef.current.value = '';
    }
  };

  const openImageViewer = (imageUrl: string) => {
    setViewingImage(imageUrl);
  };

  const closeImageViewer = () => {
    setViewingImage(null);
  };

  const openVideoViewer = (videoUrl: string) => {
    setViewingVideo(videoUrl);
  };

  const closeVideoViewer = () => {
    setViewingVideo(null);
  };

  // Handle ESC key to close image/video viewer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (viewingImage) {
          closeImageViewer();
        } else if (viewingVideo) {
          closeVideoViewer();
        }
      }
    };

    if (viewingImage || viewingVideo) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [viewingImage, viewingVideo]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || (!selectedUser && !selectedGroup) || !socket || !socket.connected)
      return;

    const messageText = newMessage.trim();
    setNewMessage("");

    // Temporary optimistic message
    const tempMessage: Message = {
      _id: `temp-${Date.now()}`,
      sender: { _id: user?.id || "", username: user?.username || "" },
      receiver: selectedUser ? { _id: selectedUser.id, username: selectedUser.username } : undefined,
      group: selectedGroup ? { _id: selectedGroup._id, name: selectedGroup.name } : undefined,
      text: messageText,
      messageType: 'text',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMessage]);

    // Update conversation list immediately with optimistic message (never increment unread for sent messages)
    updateConversationWithNewMessage(tempMessage, false);

    // Send message based on type
    if (selectedUser) {
    socket.emit("sendMessage", {
      receiverId: selectedUser.id,
      text: messageText,
      messageType: 'text'
    });
    } else if (selectedGroup) {
      sendGroupMessage(selectedGroup._id, messageText, 'text');
    }
  };

  const handleLeaveGroup = async (groupId: string) => {
    if (!token) return;
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/groups/${groupId}/leave`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        // Refresh groups list and close group chat
        window.location.reload(); // Simple refresh for now
      } else {
        console.error('Failed to leave group');
      }
    } catch (error) {
      console.error('Error leaving group:', error);
    }
  };

  const handleAddMembers = () => {
    setShowAddMembersModal(true);
  };

  const handleMembersAdded = () => {
    // Refresh the page to update group data
    window.location.reload();
  };

  return (
    <div className="flex-1 flex flex-col bg-white">
      {selectedUser ? (
        <>
          <ChatHeader selectedUser={selectedUser} onlineUsers={onlineUsers} />
          
          <MessageArea
            messages={visibleMessages}
            showScrollButton={showScrollButton}
            onScrollToBottom={scrollToBottom}
            onOpenImageViewer={openImageViewer}
            onOpenVideoViewer={openVideoViewer}
            forceScrollToBottom={forceScrollToBottom}
            socket={socket}
            isGroupChat={false}
            onMessageEdit={(messageId, newText) => {
              // Update the message in the local state
              setMessages(prev => prev.map(msg => 
                msg._id === messageId 
                  ? { ...msg, text: newText, isEdited: true, editedAt: new Date().toISOString() }
                  : msg
              ));
              
              // Update the conversation list with the edited message
              const updatedConversations = conversations.map((conv: Conversation) => {
                if (conv.lastMessage && conv.lastMessage._id === messageId) {
                  return {
                    ...conv,
                    lastMessage: {
                      ...conv.lastMessage,
                      text: newText,
                      isEdited: true,
                      editedAt: new Date().toISOString()
                    }
                  };
                }
                return conv;
              });
              setConversations(updatedConversations);
            }}
            onMessageDelete={(messageId) => {
              // Update the message in the local state to show as deleted
              setMessages(prev => {
                const updatedMessages = prev.map(msg => {
                  if (msg._id === messageId) {
                    if (msg.sender._id === user?.id) {
                      return { ...msg, deletedForSender: true, deletedAt: new Date().toISOString() };
                    } else {
                      return { ...msg, deletedForReceiver: true, deletedAt: new Date().toISOString() };
                    }
                  }
                  return msg;
                });

                // Update the conversation list if this is the last message
                const updatedConversations = conversations.map((conv: Conversation) => {
                  if (conv.lastMessage && conv.lastMessage._id === messageId) {
                    // For "delete for me", find the previous non-deleted message using updated messages
                    const previousMessages = updatedMessages.filter(msg => 
                      msg._id !== messageId && 
                      !isMessageDeletedForUser(msg, user?.id)
                    );
                    
                    const newLastMessage = previousMessages.length > 0 
                      ? previousMessages[previousMessages.length - 1]
                      : null;
                    
                    return {
                      ...conv,
                      lastMessage: newLastMessage
                    };
                  }
                  return conv;
                });
                setConversations(updatedConversations);

                return updatedMessages;
              });
            }}
          />

          <InputMessage
            newMessage={newMessage}
            onMessageChange={setNewMessage}
            onSendMessage={handleSendMessage}
            onImageSelect={handleImageSelect}
            onVideoSelect={handleVideoSelect}
            selectedImage={selectedImage}
            selectedVideo={selectedVideo}
            isUploading={isUploading}
            onSendImage={handleSendImage}
            onSendVideo={handleSendVideo}
            onRemoveSelectedImage={removeSelectedImage}
            onRemoveSelectedVideo={removeSelectedVideo}
            disabled={false}
          />
        </>
      ) : selectedGroup ? (
        <>
          <div className="px-6 py-4 border-b border-gray-200 bg-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {selectedGroup.icon ? (
                  <img
                    src={selectedGroup.icon}
                    alt={selectedGroup.name}
                    className="w-10 h-10 rounded-full object-cover mr-3"
                  />
                ) : (
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold mr-3">
                    {selectedGroup.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{selectedGroup.name}</h2>
                  <p className="text-sm text-gray-500">
                    {selectedGroup.members.filter(member => 
                      onlineUsers.some(onlineUser => onlineUser.userId === member.user._id)
                    ).length} online • {selectedGroup.members.length} total
                  </p>
                </div>
              </div>
              <GroupMenu
                group={selectedGroup}
                currentUser={user!}
                onlineUsers={onlineUsers}
                onLeaveGroup={handleLeaveGroup}
                onAddMembers={handleAddMembers}
              />
            </div>
          </div>
          
          <MessageArea
            messages={visibleMessages}
            showScrollButton={showScrollButton}
            onScrollToBottom={scrollToBottom}
            onOpenImageViewer={openImageViewer}
            onOpenVideoViewer={openVideoViewer}
            forceScrollToBottom={forceScrollToBottom}
            socket={socket}
            isGroupChat={true}
            onMessageEdit={(messageId, newText) => {
              // Update the message in the local state
              setMessages(prev => prev.map(msg => 
                msg._id === messageId 
                  ? { ...msg, text: newText, isEdited: true, editedAt: new Date().toISOString() }
                  : msg
              ));
            }}
            onMessageDelete={(messageId) => {
              // Update the message state first
              setMessages(prev => {
                const updatedMessages = prev.map(msg => {
                  if (msg._id === messageId) {
                    if (msg.sender._id === user?.id) {
                      return { ...msg, deletedForSender: true, deletedAt: new Date().toISOString() };
                    } else {
                      if (msg.group) {
                        const deletedForUsers = msg.deletedForUsers || [];
                        if (!deletedForUsers.includes(user?.id || '')) {
                          return { 
                            ...msg, 
                            deletedForUsers: [...deletedForUsers, user?.id || ''],
                            deletedAt: new Date().toISOString() 
                          };
                        }
                    } else {
                      return { ...msg, deletedForReceiver: true, deletedAt: new Date().toISOString() };
                      }
                    }
                  }
                  return msg;
                });

                // For group messages, find the previous non-deleted message and update group list
                if (selectedGroup) {
                  const deletedMessage = updatedMessages.find(msg => msg._id === messageId);
                  if (deletedMessage && deletedMessage.group) {
                    const groupId = typeof deletedMessage.group === 'string' ? deletedMessage.group : deletedMessage.group._id;
                    
                    // Find the previous non-deleted message in this group
                    const groupMessages = updatedMessages
                      .filter(msg => {
                        const msgGroupId = typeof msg.group === 'string' ? msg.group : msg.group?._id;
                        return msgGroupId === groupId;
                      })
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                    
                    const previousMessage = groupMessages.find(msg => 
                      msg._id !== messageId && 
                      !isMessageDeletedForUser(msg, user?.id)
                    );
                    
                    if (previousMessage && onGroupMessageReceived) {
                      // Update group list with the previous message
                      setTimeout(() => {
                        onGroupMessageReceived(previousMessage, false);
                      }, 0);
                    }
                  }
                }

                return updatedMessages;
              });
            }}
          />

          <InputMessage
            newMessage={newMessage}
            onMessageChange={setNewMessage}
            onSendMessage={handleSendMessage}
            onImageSelect={handleImageSelect}
            onVideoSelect={handleVideoSelect}
            selectedImage={selectedImage}
            selectedVideo={selectedVideo}
            isUploading={isUploading}
            onSendImage={handleSendImage}
            onSendVideo={handleSendVideo}
            onRemoveSelectedImage={removeSelectedImage}
            onRemoveSelectedVideo={removeSelectedVideo}
            disabled={!selectedGroup?.members.some(member => member.user._id === user?.id)}
          />
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
            <svg
              className="w-10 h-10 text-gray-400"
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
          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome to ConvoX
          </h3>
          <p className="text-gray-600 max-w-md">
            Select a conversation from the sidebar or search for users to
            start chatting. Your messages will appear here once you start a
            conversation.
          </p>
        </div>
      )}

      {/* Image Viewer Modal */}
      {viewingImage && (
        <div 
           className="fixed inset-0 bg-black/50 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={closeImageViewer}
        >
          <div className="relative max-w-full max-h-full">
            {/* Close button */}
            <button
              onClick={closeImageViewer}
              className="absolute top-4 right-4 z-10 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-70 transition-all"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            
            {/* Image */}
            <img
              src={viewingImage}
              alt="Full size image"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            
            {/* Download button */}
            <button
              onClick={() => {
                const link = document.createElement('a');
                link.href = viewingImage;
                link.download = `image-${Date.now()}.png`;
                link.click();
              }}
              className="absolute bottom-4 right-4 z-10 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-70 transition-all"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Video Viewer Modal */}
      {viewingVideo && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={closeVideoViewer}
        >
          <div className="relative max-w-full max-h-full">
            {/* Close button */}
            <button
              onClick={closeVideoViewer}
              className="absolute top-4 right-4 z-10 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-70 transition-all"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            
            {/* Video */}
            <video
              src={viewingVideo}
              className="max-w-full max-h-full object-contain rounded-lg"
              controls
              autoPlay
              onClick={(e) => e.stopPropagation()}
            />
            
            {/* Download button */}
            <button
              onClick={() => {
                const link = document.createElement('a');
                link.href = viewingVideo;
                link.download = `video-${Date.now()}.mp4`;
                link.click();
              }}
              className="absolute bottom-4 right-4 z-10 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-70 transition-all"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Add Members Modal */}
      <AddMembersModal
        isOpen={showAddMembersModal}
        onClose={() => setShowAddMembersModal(false)}
        group={selectedGroup}
        currentUserId={user?.id || ''}
        onMembersAdded={handleMembersAdded}
      />
    </div>
  );
};

export default ChatArea;
