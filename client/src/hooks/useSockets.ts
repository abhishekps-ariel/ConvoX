import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Message, OnlineUser, User, Group } from '../types/chatTypes';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

// Performance optimization: Debounce utility
const debounce = <T extends (...args: any[]) => void>(func: T, delay: number): T => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  }) as T;
};


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
      return message.deletedForUsers && message.deletedForUsers.includes(userId) || false;
    }
  }
  
  // For direct messages, use the original logic
  if (message.sender._id === userId) {
    return message.deletedForSender || false;
  } else {
    return message.deletedForReceiver || false;
  }
};

const useSocket = (
  token: string | null,
  logout: () => void,
  selectedUser: User | null,
  selectedGroup: Group | null,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  setOnlineUsers: React.Dispatch<React.SetStateAction<OnlineUser[]>>,
  onMessagesRead?: (receiverId: string) => void,
  updateConversationWithNewMessage?: (message: Message, shouldIncrementUnread?: boolean) => void,
  currentUserId?: string,
  onMessageEdited?: (message: Message) => void,
  onMessageDeleted?: (message: Message) => void,
  onGroupMessageReceived?: (message: Message, shouldIncrementUnread?: boolean) => void,
  onGroupMessageEdited?: (message: Message) => void,
  onGroupMessageDeleted?: (message: Message) => void,
  onGroupCreated?: (group: Group) => void
): { socket: Socket | null; isConnected: boolean; sendGroupMessage: (groupId: string, text: string, messageType: 'text' | 'image' | 'video', imageData?: string, videoData?: string) => void; joinGroupChat: (groupId: string) => void; leaveGroupChat: (groupId: string) => void; markGroupMessagesAsRead: (groupId: string) => void } => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const selectedUserRef = useRef<User | null>(null);
  const selectedGroupRef = useRef<Group | null>(null);
  
  // Performance optimization: Connection state tracking
  const connectionAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelayRef = useRef(1000);
  const onMessagesReadRef = useRef<((receiverId: string) => void) | undefined>(undefined);
  const updateConversationRef = useRef<((message: Message, shouldIncrementUnread?: boolean) => void) | undefined>(undefined);
  const onMessageEditedRef = useRef<((message: Message) => void) | undefined>(undefined);
  const onMessageDeletedRef = useRef<((message: Message) => void) | undefined>(undefined);
  const onGroupMessageReceivedRef = useRef<((message: Message, shouldIncrementUnread?: boolean) => void) | undefined>(undefined);
  const onGroupMessageEditedRef = useRef<((message: Message) => void) | undefined>(undefined);
  const onGroupMessageDeletedRef = useRef<((message: Message) => void) | undefined>(undefined);
  const onGroupCreatedRef = useRef<((group: Group) => void) | undefined>(undefined);
  const tokenRef = useRef<string | null>(null);
  const logoutRef = useRef<() => void>(logout);
  const currentUserIdRef = useRef<string | undefined>(null);

  // Update refs when props change - CRITICAL for real-time updates
  useEffect(() => {
    selectedUserRef.current = selectedUser;
    selectedGroupRef.current = selectedGroup;
    onMessagesReadRef.current = onMessagesRead;
    updateConversationRef.current = updateConversationWithNewMessage;
    onMessageEditedRef.current = onMessageEdited;
    onMessageDeletedRef.current = onMessageDeleted;
    onGroupMessageReceivedRef.current = onGroupMessageReceived;
    onGroupMessageEditedRef.current = onGroupMessageEdited;
    onGroupMessageDeletedRef.current = onGroupMessageDeleted;
    onGroupCreatedRef.current = onGroupCreated;
    tokenRef.current = token;
    logoutRef.current = logout;
    currentUserIdRef.current = currentUserId;
  }, [selectedUser, selectedGroup, onMessagesRead, updateConversationWithNewMessage, onMessageEdited, onMessageDeleted, onGroupMessageReceived, onGroupMessageEdited, onGroupMessageDeleted, onGroupCreated, token, logout, currentUserId]);

  // Performance optimization: Optimized socket connection with better reconnection strategy
  useEffect(() => {
    if (!token) {
      if (socket) {
        socket.close();
        setSocket(null);
        setIsConnected(false);
        setOnlineUsers([]);
        connectionAttemptsRef.current = 0;
      }
      return;
    }

    // Only create new socket if we don't have one or if it's disconnected
    if (!socket || !socket.connected) {
      const newSocket = io(SOCKET_URL, { 
        auth: { token },
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: reconnectDelayRef.current,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        forceNew: true
      });

      // Performance optimization: Debounced connection handlers
      const debouncedSetOnlineUsers = debounce((users: OnlineUser[]) => {
        setOnlineUsers(users);
      }, 100);

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        setIsConnected(false);
        connectionAttemptsRef.current++;
        
        // Exponential backoff for reconnection
        if (connectionAttemptsRef.current < maxReconnectAttempts) {
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 5000);
        }
        
        if (error.message === 'Authentication error') {
          logoutRef.current();
        }
      });

      newSocket.on('error', (error) => {
        console.error('Socket error:', error);
        // Handle specific error cases
        if (error.message && error.message.includes('Failed to send message')) {
          console.error('Message sending failed:', error.message);
        }
        if (error.message && error.message.includes('Failed to delete message')) {
          console.error('Message deletion failed:', error.message);
        }
      });

      newSocket.on('connect', () => {
        setIsConnected(true);
        connectionAttemptsRef.current = 0;
        reconnectDelayRef.current = 1000; // Reset delay on successful connection
      });

      newSocket.on('disconnect', () => {
        setIsConnected(false);
        setOnlineUsers([]);
      });

      newSocket.on('receiveMessage', (message: Message) => {
        // Handle direct messages
        if (message.receiver) {
          // Only process messages where current user is either sender or receiver
          const isCurrentUserSender = message.sender._id === currentUserIdRef.current;
          const isCurrentUserReceiver = message.receiver._id === currentUserIdRef.current;
          
          if (isCurrentUserSender || isCurrentUserReceiver) {
            // Only add to messages if we're viewing the chat with the other user
        if (
          selectedUserRef.current &&
          (message.sender._id === selectedUserRef.current.id || message.receiver._id === selectedUserRef.current.id)
        ) {
          setMessages((prev) => [...prev, message]);
            }
        }
        
        // Update conversation list with new message
        // Only increment unread count if the receiver doesn't have this specific chat open
        if (updateConversationRef.current) {
          // Check if the current user (receiver) is viewing the chat with the sender
          const isReceiverViewingThisSpecificChat = selectedUserRef.current && 
            selectedUserRef.current.id === message.sender._id;
          const shouldIncrementUnread = !isReceiverViewingThisSpecificChat && message.receiver._id === currentUserIdRef.current;
          
          updateConversationRef.current(message, shouldIncrementUnread);
          }
        }
      });

      newSocket.on('messageSent', (message: Message) => {
        setMessages((prev) =>
          prev.map((msg) => {
            // Match temp messages by checking if it's a temp message and either text matches, imageUrl matches, or videoUrl matches
            if (msg._id.startsWith('temp-')) {
              if (message.messageType === 'text' && msg.text === message.text) {
                return message;
              } else if (message.messageType === 'image' && msg.imageUrl === message.imageUrl) {
                return message;
              } else if (message.messageType === 'video' && msg.videoUrl === message.videoUrl) {
                return message;
              }
            }
            return msg;
          })
        );
        
        // Update conversation list with sent message (never increment unread for sent messages)
        // Only for direct messages, not group messages
        if (updateConversationRef.current && message.receiver && !message.group) {
          updateConversationRef.current(message, false);
        }
      });

      newSocket.on('messagesRead', (data: { senderId: string }) => {
        if (onMessagesReadRef.current) {
          onMessagesReadRef.current(data.senderId);
        }
      });

      // Performance optimization: Use debounced online users updates
      newSocket.on('onlineUsers', debouncedSetOnlineUsers);
      
      newSocket.on('userOnline', (user: OnlineUser) => {
        setOnlineUsers((prev) => {
          // Avoid duplicate users
          if (prev.some(u => u.userId === user.userId)) return prev;
          return [...prev, user];
        });
      });
      
      newSocket.on('userOffline', (user: OnlineUser) => {
        setOnlineUsers((prev) => prev.filter((u) => u.userId !== user.userId));
      });

      newSocket.on('messageEdited', (message: Message) => {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg._id === message._id) {
              return message;
            }
            return msg;
          })
        );
        
        // Update conversation list if this is the last message (for direct messages)
        if (message.receiver && onMessageEditedRef.current) {
          onMessageEditedRef.current(message);
        }
        
        // Update group list if this is the last message (for group messages)
        if (message.group && onGroupMessageEditedRef.current) {
          onGroupMessageEditedRef.current(message);
        }
      });

      // Handle message delete for me (both normal and group messages)
      newSocket.on('messageDeletedForMe', (message: Message) => {

        // Update message state for both normal and group messages
        setMessages((prev) => {
          const updatedMessages = prev.map((msg) => {
            if (msg._id === message._id) {
              return message;
            }
            return msg;
          });
          
          // For group messages, find the previous non-deleted message after updating the state
          if (message.group && onGroupMessageReceivedRef.current) {
            const groupId = typeof message.group === 'string' ? message.group : message.group._id;
            
            const groupMessages = updatedMessages
              .filter(msg => {
                const msgGroupId = typeof msg.group === 'string' ? msg.group : msg.group?._id;
                return msgGroupId === groupId;
              })
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            
            const previousMessage = groupMessages.find(msg => !isMessageDeletedForUser(msg, currentUserId));
            
            if (previousMessage) {
              // Use setTimeout to avoid updating during render
              setTimeout(() => {
                onGroupMessageReceivedRef.current?.(previousMessage, false);
              }, 0);
            }
          }
          
          return updatedMessages;
        });
        
        // Update conversation list for normal messages
        if (message.receiver && onMessageDeletedRef.current) {
          onMessageDeletedRef.current(message);
        }
      });

      // Handle message delete for everyone (both normal and group messages) - NEW APPROACH: TREAT AS EDITED MESSAGE
      newSocket.on('messageDeletedForEveryone', (message: Message) => {

        // Update message state - the message stays in place with "This message was deleted" text
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg._id === message._id) {
              return message; // The message now has text: "This message was deleted" and isEdited: true
            }
            return msg;
          })
        );
        
        // Update conversation list for normal messages - the message stays as the last message
        if (message.receiver && onMessageDeletedRef.current) {
          onMessageDeletedRef.current(message);
        }
        
        // For group messages, update group list with the "deleted" message (it keeps its place)
        if (message.group && onGroupMessageReceivedRef.current) {
          // The message stays as the latest message, just with "This message was deleted" text
          onGroupMessageReceivedRef.current(message, false);
        }
      });


      // Group messaging event handlers
        newSocket.on('newMessage', (message: Message) => {
        
        // Handle group messages
        if (message.group) {
          // Handle both string and object group formats
          const messageGroupId = typeof message.group === 'string' ? message.group : message.group?._id;
          const isViewingThisGroupChat = selectedGroupRef.current && messageGroupId === selectedGroupRef.current._id;
          const isCurrentUserSender = message.sender._id === currentUserIdRef.current;
          
          // Only add message to chat if viewing the group AND it's not from the current user
          // (current user's messages are handled by messageSent event)
          if (isViewingThisGroupChat && !isCurrentUserSender) {
            setMessages((prev) => {
              // Check if message already exists to prevent duplicates
              const messageExists = prev.some(msg => msg._id === message._id);
              if (messageExists) {
                return prev;
              }
              
              return [...prev, message];
            });
          }
          
          // Update groups in real-time for latest messages (simplified approach)
          if (onGroupMessageReceivedRef.current) {
            // Simple logic: only increment unread if receiver is not viewing this specific group
            const isCurrentUserViewingThisSpecificGroup = selectedGroupRef.current && 
              selectedGroupRef.current._id === messageGroupId;
            const shouldIncrementUnread = !isCurrentUserViewingThisSpecificGroup && !isCurrentUserSender;
            
            
            onGroupMessageReceivedRef.current(message, shouldIncrementUnread);
          }
        }
      });

      // Handle group creation event
      newSocket.on('groupCreated', (group: Group) => {
        
        if (onGroupCreatedRef.current) {
          onGroupCreatedRef.current(group);
        }
      });

      // Handle member removal events
      newSocket.on('memberRemovedFromGroup', (data: { groupId: string; message: Message; updatedGroup?: Group }) => {
        // Add the system message to the chat at the end (latest position)
        setMessages((prev) => [...prev, data.message]);
        
        // Update group list with the system message
        if (onGroupMessageReceivedRef.current) {
          onGroupMessageReceivedRef.current(data.message, false);
        }
        
        // If updated group data is provided, update the group list
        if (data.updatedGroup && onGroupCreatedRef.current) {
          onGroupCreatedRef.current(data.updatedGroup);
        }
      });

      newSocket.on('groupMemberRemoved', (data: { 
        groupId: string; 
        removedMemberId: string; 
        removedMemberUsername: string; 
        message: Message; 
        updatedGroup: Group 
      }) => {
        // Add the system message to the chat at the end (latest position)
        setMessages((prev) => [...prev, data.message]);
        
        // Update group list with the system message
        if (onGroupMessageReceivedRef.current) {
          onGroupMessageReceivedRef.current(data.message, false);
        }
      });

      newSocket.on('groupMemberLeft', (data: { 
        groupId: string; 
        leftMemberId: string; 
        leftMemberUsername: string; 
        message: Message 
      }) => {
        // Add the system message to the chat at the end (latest position)
        setMessages((prev) => [...prev, data.message]);
        
        // Update group list with the system message
        if (onGroupMessageReceivedRef.current) {
          onGroupMessageReceivedRef.current(data.message, false);
        }
      });

      setSocket(newSocket);
    }

    // Cleanup function
    return () => {
      // Only close socket on unmount, not on every effect run
    };
  }, [token]); // Only depend on token

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [socket]);

  // Helper functions for group messaging
  const sendGroupMessage = (
    groupId: string,
    text: string,
    messageType: 'text' | 'image' | 'video' = 'text',
    imageData?: string,
    videoData?: string
  ) => {
    if (socket) {
      const messageData: any = {
        groupId,
        messageType
      };

      if (messageType === 'text') {
        messageData.text = text;
      } else if (messageType === 'image' && imageData) {
        messageData.imageData = imageData;
      } else if (messageType === 'video' && videoData) {
        messageData.videoData = videoData;
      }

      socket.emit('sendGroupMessage', messageData);
    }
  };

  const joinGroupChat = (groupId: string) => {
    if (socket) {
      socket.emit('joinGroupChat', groupId);
    }
  };

  const leaveGroupChat = (groupId: string) => {
    if (socket) {
      socket.emit('leaveGroupChat', groupId);
    }
  };

  const markGroupMessagesAsRead = (groupId: string) => {
    if (socket) {
      socket.emit('markGroupMessagesAsRead', { groupId });
    }
  };

  return { 
    socket, 
    isConnected, 
    sendGroupMessage, 
    joinGroupChat, 
    leaveGroupChat, 
    markGroupMessagesAsRead 
  };
};

export default useSocket;
