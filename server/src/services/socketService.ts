import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Message from "../models/message.js";
import User from "../models/user.js";
import Group from "../models/group.js";

// Extend Socket interface to include custom properties
export interface CustomSocket extends Socket {
  userId?: string;
  username?: string;
}

// Store online users
export const onlineUsers = new Map();

// Store the Socket.IO server instance
let ioInstance: Server | null = null;

// Function to set the Socket.IO instance
export const setSocketIOInstance = (io: Server) => {
  ioInstance = io;
};

// Function to get the Socket.IO instance
export const getIoInstance = (): Server | null => {
  return ioInstance;
};

// Function to emit group creation event to all group members
export const emitGroupCreated = (group: any) => {
  if (!ioInstance) return;
  
  // Emit to all group members who are online
  group.members.forEach((member: any) => {
    const memberId = member.user._id || member.user;
    const onlineUser = Array.from(onlineUsers.values())
      .find(user => user.userId === memberId.toString());
    
    if (onlineUser && ioInstance) {
      ioInstance.to(onlineUser.socketId).emit('groupCreated', group);
    }
  });
};

// Function to remove user from group socket room when they are removed
export const removeUserFromGroupRoom = (userId: string, groupId: string) => {
  if (!ioInstance) return;
  
  const onlineUser = Array.from(onlineUsers.values())
    .find(user => user.userId === userId);
  
  if (onlineUser) {
    const socket = ioInstance.sockets.sockets.get(onlineUser.socketId);
    if (socket) {
      const roomName = `group_${groupId}`;
      socket.leave(roomName);
      
      // Clean up room tracking
      if (userRooms.has(userId)) {
        userRooms.get(userId)!.delete(roomName);
      }
      
      // Emit error to the removed user
      socket.emit("error", { message: "You were removed from this group" });
    }
  }
};

// Helper function to filter online users based on blocking relationships
async function getFilteredOnlineUsers(currentUserId: string, allOnlineUsers: any[]) {
  try {
    const currentUser = await User.findById(currentUserId);
    if (!currentUser) return allOnlineUsers;

    // Filter out users that are blocked by current user or have blocked current user
    const filteredUsers = [];
    for (const onlineUser of allOnlineUsers) {
      if (onlineUser.userId === currentUserId) {
        // Always include current user
        filteredUsers.push(onlineUser);
        continue;
      }

      const otherUser = await User.findById(onlineUser.userId);
      if (!otherUser) continue;

      const currentUserObjectId = new mongoose.Types.ObjectId(currentUserId);
      const otherUserObjectId = new mongoose.Types.ObjectId(onlineUser.userId);

      // Check if current user has blocked the other user
      const isBlockedByMe = currentUser.blockedUsers?.includes(otherUserObjectId);
      
      // Check if the other user has blocked the current user
      const isBlockedByThem = otherUser.blockedUsers?.includes(currentUserObjectId);
      
      // Only show online status if neither user has blocked the other
      if (!isBlockedByMe && !isBlockedByThem) {
        filteredUsers.push(onlineUser);
      }
    }

    return filteredUsers;
  } catch (error) {
    console.error("Error filtering online users:", error);
    return allOnlineUsers;
  }
}

// Helper function to notify users about online/offline status (excluding blocked users)
async function notifyUserOnlineStatus(io: Server, userId: string, username: string, isOnline: boolean) {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const onlineUsersList = Array.from(onlineUsers.values());

    for (const onlineUser of onlineUsersList) {
      if (onlineUser.userId === userId) continue; // Skip self

      const otherUser = await User.findById(onlineUser.userId);
      if (!otherUser) continue;

      const otherUserObjectId = new mongoose.Types.ObjectId(onlineUser.userId);

      // Check if the other user has blocked the current user
      const isBlockedByThem = otherUser.blockedUsers?.includes(userObjectId);
      
      // Check if the current user has blocked the other user
      const isBlockedByMe = user.blockedUsers?.includes(otherUserObjectId);
      
      // Only send online status notifications if neither user has blocked the other
      if (!isBlockedByThem && !isBlockedByMe) {
        // Notify this user about the online/offline status
        const socket = io.sockets.sockets.get(onlineUser.socketId);
        if (socket) {
          if (isOnline) {
            socket.emit("userOnline", { userId, username });
          } else {
            socket.emit("userOffline", { userId, username });
          }
        }
      }
    }
  } catch (error) {
    console.error("Error notifying online status:", error);
  }
}

// Socket authentication middleware
export const socketAuthMiddleware = (JWT_SECRET: string) => {
  return async (socket: CustomSocket, next: any) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication error"));
      }

      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; username: string };
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        return next(new Error("User not found"));
      }

      socket.userId = decoded.userId;
      socket.username = decoded.username;
      next();
    } catch (err) {
      next(new Error("Authentication error"));
    }
  };
};

// Handle sending messages
const handleSendMessage = async (io: Server, socket: CustomSocket, data: { receiverId: string; text?: string; imageData?: string; videoData?: string; messageType?: 'text' | 'image' | 'video' }) => {
  try {
    const senderObjectId = new mongoose.Types.ObjectId(socket.userId);
    const receiverObjectId = new mongoose.Types.ObjectId(data.receiverId);

    const messageType = data.messageType || 'text';
    
    // Check if sender is blocked by receiver OR if sender has blocked receiver
    const receiver = await User.findById(data.receiverId);
    const sender = await User.findById(socket.userId);
    
    if (receiver && receiver.blockedUsers?.includes(senderObjectId)) {
      // Sender is blocked by receiver, don't send message to receiver
      socket.emit("messageSent", {
        _id: new mongoose.Types.ObjectId(),
        sender: { _id: socket.userId, username: socket.username },
        receiver: { _id: data.receiverId, username: receiver.username },
        text: data.text || '',
        messageType,
        isRead: false,
        createdAt: new Date()
      });
      return;
    }
    
    if (sender && sender.blockedUsers?.includes(receiverObjectId)) {
      // Sender has blocked receiver, don't send message to receiver
      socket.emit("messageSent", {
        _id: new mongoose.Types.ObjectId(),
        sender: { _id: socket.userId, username: socket.username },
        receiver: { _id: data.receiverId, username: receiver?.username || 'Unknown' },
        text: data.text || '',
        messageType,
        isRead: false,
        createdAt: new Date()
      });
      return;
    }
    
    if (messageType === 'video' && data.videoData) {
      const videoSizeKB = Math.round(data.videoData.length / 1024);
      
      // Warn if video is very large
      if (videoSizeKB > 10000) { // 10MB
        console.warn(`Large video message detected: ${videoSizeKB}KB`);
      }
    }
    
    // Check if receiver is currently viewing this chat
    const receiverUser = Array.from(onlineUsers.values())
      .find(user => user.userId === data.receiverId);
    
    // Only mark as read if receiver is online AND viewing this specific chat
    let isRead = false;
    if (receiverUser) {
      const receiverSocketInstance = io.sockets.sockets.get(receiverUser.socketId);
      const roomName = [socket.userId, data.receiverId].sort().join('_');
      if (receiverSocketInstance && receiverSocketInstance.rooms.has(`chat_${roomName}`)) {
        isRead = true;
      }
    }

    const messageData: any = {
      sender: senderObjectId,
      receiver: receiverObjectId,
      messageType,
      isRead: isRead
    };

    if (messageType === 'text') {
      messageData.text = data.text || '';
    } else if (messageType === 'image') {
      messageData.imageUrl = data.imageData;
      messageData.text = '';
    } else if (messageType === 'video') {
      messageData.videoUrl = data.videoData;
      messageData.text = '';
    }

    const message = new Message(messageData);
    await message.save();
    
    // Populate sender info
    await message.populate('sender', 'username');
    await message.populate('receiver', 'username');

    // Send to receiver if online
    const receiverSocket = Array.from(onlineUsers.values())
      .find(user => user.userId === data.receiverId);
    
    if (receiverSocket) {
      io.to(receiverSocket.socketId).emit("receiveMessage", message);
    }

    // Send back to sender for confirmation
    socket.emit("messageSent", message);
    
    // If message was marked as read immediately, notify sender
    if (isRead && receiverUser) {
      socket.emit("messagesRead", {
        senderId: data.receiverId
      });
    }
    
    
  } catch (err) {
    console.error("Send message error:", err);
    console.error("Error details:", {
      messageType: data.messageType,
      receiverId: data.receiverId,
      senderId: socket.userId,
      error: err instanceof Error ? err.message : String(err)
    });
    socket.emit("error", { message: "Failed to send message" });
  }
};

// Handle marking messages as read
const handleMarkMessagesAsRead = async (io: Server, socket: CustomSocket, data: { senderId: string }) => {
  try {
    const senderObjectId = new mongoose.Types.ObjectId(data.senderId);
    const receiverObjectId = new mongoose.Types.ObjectId(socket.userId);

    await Message.updateMany(
      { sender: senderObjectId, receiver: receiverObjectId, isRead: false },
      { isRead: true }
    );

    // to keep check of undread messages on reciever end 
    const senderSocket = Array.from(onlineUsers.values())
      .find(user => user.userId === data.senderId);
    
    if (senderSocket) {
      io.to(senderSocket.socketId).emit("messagesRead", {
        senderId: data.senderId
      });
    }
  } catch (err) {
    console.error("Mark messages as read error:", err);
  }
};

// Handle joining a chat room
const handleJoinChat = (socket: CustomSocket, receiverId: string) => {
  // Join a room specific to this conversation between two users
  const roomName = [socket.userId, receiverId].sort().join('_');
  socket.join(`chat_${roomName}`);
};

// Handle leaving a chat room
const handleLeaveChat = (socket: CustomSocket, receiverId: string) => {
  // Leave the room specific to this conversation between two users
  const roomName = [socket.userId, receiverId].sort().join('_');
  socket.leave(`chat_${roomName}`);
};

// Handle editing messages
const handleEditMessage = async (io: Server, socket: CustomSocket, data: { messageId: string; text: string }) => {
  try {
    const messageObjectId = new mongoose.Types.ObjectId(data.messageId);
    const userObjectId = new mongoose.Types.ObjectId(socket.userId);

    // Find the message and verify ownership
    const message = await Message.findOne({
      _id: messageObjectId,
      sender: userObjectId
    });

    if (!message) {
      socket.emit("error", { message: "Message not found or you don't have permission to edit it" });
      return;
    }

    // Check if the message is older than 12 hours
    const messageAge = Date.now() - new Date(message.createdAt).getTime();
    const twelveHoursInMs = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
    
    if (messageAge > twelveHoursInMs) {
      socket.emit("error", { message: "Cannot edit message older than 12 hours" });
      return;
    }

    // Only allow editing text messages
    if (message.messageType !== 'text') {
      socket.emit("error", { message: "Only text messages can be edited" });
      return;
    }

    // Update the message
    message.text = data.text.trim();
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    // Populate sender, receiver, and group info
    await message.populate('sender', 'username');
    if (message.receiver) {
    await message.populate('receiver', 'username');
    }
    if (message.group) {
      await message.populate('group', 'name');
    }

    // Send updated message to sender
    socket.emit("messageEdited", message);
    
    // Send to receiver if online (for direct messages)
    if (message.receiver) {
      const receiver = message.receiver;
      const receiverSocket = Array.from(onlineUsers.values())
        .find(user => user.userId === receiver._id.toString());
      
      if (receiverSocket) {
        io.to(receiverSocket.socketId).emit("messageEdited", message);
      }
    }
    
    // Send to all group members if online (for group messages)
    if (message.group) {
      const groupRoom = `group_${message.group._id}`;
      io.to(groupRoom).emit("messageEdited", message);
    }

  } catch (err) {
    console.error("Edit message error:", err);
    socket.emit("error", { message: "Failed to edit message" });
  }
};

// Handle deleting messages for me - SEPARATE LOGIC FOR NORMAL VS GROUP CHATS
const handleDeleteMessageForMe = async (io: Server, socket: CustomSocket, data: { messageId: string }) => {
  try {
    const messageObjectId = new mongoose.Types.ObjectId(data.messageId);
    const userObjectId = new mongoose.Types.ObjectId(socket.userId);

    // Find the message
    const message = await Message.findById(messageObjectId);

    if (!message) {
      socket.emit("error", { message: "Message not found" });
      return;
    }

    // SEPARATE LOGIC: Handle group messages vs normal messages
    if (message.group) {
      // GROUP MESSAGE LOGIC
      await handleGroupMessageDeleteForMe(io, socket, message, userObjectId);
    } else {
      // NORMAL MESSAGE LOGIC
      await handleNormalMessageDeleteForMe(io, socket, message, userObjectId);
    }

  } catch (err) {
    console.error("Delete message for me error:", err);
    socket.emit("error", { message: "Failed to delete message" });
  }
};

// CLEAN GROUP MESSAGE DELETE FOR ME LOGIC
const handleGroupMessageDeleteForMe = async (io: Server, socket: CustomSocket, message: any, userObjectId: mongoose.Types.ObjectId) => {
  // Check if user is a member of the group
  const group = await Group.findOne({
    _id: message.group,
    'members.user': socket.userId,
    isActive: true
  });

  if (!group) {
    socket.emit("error", { message: "You don't have permission to delete this message" });
    return;
  }

  // Update the appropriate delete flag for group messages
  if (message.sender.toString() === socket.userId) {
    // User is the sender - mark as deleted for sender
    message.deletedForSender = true;
  } else {
    // User is a group member - add to deletedForUsers array
    if (!message.deletedForUsers) {
      message.deletedForUsers = [];
    }
    if (!message.deletedForUsers.includes(userObjectId)) {
      message.deletedForUsers.push(userObjectId);
    }
  }

  message.deletedAt = new Date();
  await message.save();

  // Populate group info
  await message.populate('sender', 'username');
  await message.populate('group', 'name');

  // Send event only to the user who performed the delete
  socket.emit("messageDeletedForMe", message);
};

// CLEAN NORMAL MESSAGE DELETE FOR ME LOGIC
const handleNormalMessageDeleteForMe = async (io: Server, socket: CustomSocket, message: any, userObjectId: mongoose.Types.ObjectId) => {
  // Check if user is sender or receiver
    const isSender = message.sender.toString() === socket.userId;
    const isReceiver = message.receiver && message.receiver.toString() === socket.userId;

    if (!isSender && !isReceiver) {
      socket.emit("error", { message: "You don't have permission to delete this message" });
      return;
    }

  // Update the appropriate delete flag for normal messages
    if (isSender) {
      message.deletedForSender = true;
    } else {
      message.deletedForReceiver = true;
    }

    message.deletedAt = new Date();
    await message.save();

    // Populate sender and receiver info
    await message.populate('sender', 'username');
    await message.populate('receiver', 'username');

  // Send event only to the user who performed the delete
  socket.emit("messageDeletedForMe", message);
};

// Handle deleting messages for everyone - SEPARATE LOGIC FOR NORMAL VS GROUP CHATS
const handleDeleteMessageForEveryone = async (io: Server, socket: CustomSocket, data: { messageId: string }) => {
  try {
    const messageObjectId = new mongoose.Types.ObjectId(data.messageId);
    const userObjectId = new mongoose.Types.ObjectId(socket.userId);

    // Find the message and verify ownership
    const message = await Message.findOne({
      _id: messageObjectId,
      sender: userObjectId
    });

    if (!message) {
      socket.emit("error", { message: "Message not found or you don't have permission to delete it" });
      return;
    }

    // Check if the message is older than 12 hours
    const messageAge = Date.now() - new Date(message.createdAt).getTime();
    const twelveHoursInMs = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
    
    if (messageAge > twelveHoursInMs) {
      socket.emit("error", { message: "Cannot delete message older than 12 hours" });
      return;
    }

    // SEPARATE LOGIC: Handle group messages vs normal messages
    if (message.group) {
      // GROUP MESSAGE LOGIC
      await handleGroupMessageDeleteForEveryone(io, socket, message);
    } else {
      // NORMAL MESSAGE LOGIC
      await handleNormalMessageDeleteForEveryone(io, socket, message);
    }

  } catch (err) {
    console.error("Delete message for everyone error:", err);
    socket.emit("error", { message: "Failed to delete message" });
  }
};

// NEW APPROACH: GROUP MESSAGE DELETE FOR EVERYONE - TREAT AS EDITED MESSAGE
const handleGroupMessageDeleteForEveryone = async (io: Server, socket: CustomSocket, message: any) => {
  // Replace message text with "This message was deleted" (like editing)
  message.text = "This message was deleted";
  message.deletedForEveryone = true;
  message.deletedAt = new Date();
  message.isEdited = true; // Mark as edited so it shows the edit indicator
  await message.save();

  // Populate sender and group info
  await message.populate('sender', 'username');
  await message.populate('group', 'name');

  // Update group's latestMessage with the "deleted" message (it stays in place)
  const group = await Group.findById(message.group._id);
  if (group && group.latestMessage && group.latestMessage.messageId.toString() === message._id.toString()) {
    // Update group with the "deleted" message as latest (it keeps its place)
    group.latestMessage = {
      messageId: message._id as mongoose.Types.ObjectId,
      text: "This message was deleted",
      messageType: message.messageType,
      sender: (message.sender as any)._id,
      senderUsername: (message.sender as any).username,
      createdAt: message.createdAt
    };
    await group.save();
  }

  // Send to all group members if online
  const groupRoom = `group_${message.group._id}`;
  io.to(groupRoom).emit("messageDeletedForEveryone", message);
};

// NEW APPROACH: NORMAL MESSAGE DELETE FOR EVERYONE - TREAT AS EDITED MESSAGE
const handleNormalMessageDeleteForEveryone = async (io: Server, socket: CustomSocket, message: any) => {
    // Replace message text with "This message was deleted" (like editing)
    message.text = "This message was deleted";
    message.deletedForEveryone = true;
    message.deletedAt = new Date();
    message.isEdited = true; // Mark as edited so it shows the edit indicator
    await message.save();

    // Populate sender and receiver info
    await message.populate('sender', 'username');
    await message.populate('receiver', 'username');

    // Send to sender if online
    const senderSocket = Array.from(onlineUsers.values())
      .find(user => user.userId === message.sender._id.toString());
    
    if (senderSocket) {
      io.to(senderSocket.socketId).emit("messageDeletedForEveryone", message);
    }

  // Send to receiver if online
    if (message.receiver) {
      const receiver = message.receiver;
      const receiverSocket = Array.from(onlineUsers.values())
        .find(user => user.userId === receiver._id.toString());
      
      if (receiverSocket) {
        io.to(receiverSocket.socketId).emit("messageDeletedForEveryone", message);
      }
  }
};

// Handle sending group messages
const handleSendGroupMessage = async (io: Server, socket: CustomSocket, data: { groupId: string; text?: string; imageData?: string; videoData?: string; messageType?: 'text' | 'image' | 'video' }) => {
  try {
    const groupObjectId = new mongoose.Types.ObjectId(data.groupId);
    const senderObjectId = new mongoose.Types.ObjectId(socket.userId);

    const messageType = data.messageType || 'text';
    
    // Check if user is member of group (not removed)
    const group = await Group.findOne({
      _id: data.groupId,
      'members.user': socket.userId,
      isActive: true
    });

    if (!group) {
      // Check if user was removed from the group
      const removedGroup = await Group.findOne({
        _id: data.groupId,
        'removedMembers.user': socket.userId,
        isActive: true
      });
      
      if (removedGroup) {
        return socket.emit("error", { message: "You were removed from this group" });
      }
      
      return socket.emit("error", { message: "Group not found or access denied" });
    }

    // Check blocking relationships with all group members
    const sender = await User.findById(socket.userId);
    if (!sender) {
      return socket.emit("error", { message: "Sender not found" });
    }

    const blockedMembers: string[] = [];
    const blockingMembers: string[] = [];

    for (const member of group.members) {
      const memberId = member.user._id.toString();
      if (memberId === socket.userId) continue; // Skip self

      const memberObjectId = new mongoose.Types.ObjectId(memberId);
      
      // Check if sender has blocked this member
      if (sender.blockedUsers?.includes(memberObjectId)) {
        blockedMembers.push(memberId);
      }
      
      // Check if this member has blocked sender
      const memberUser = await User.findById(memberId);
      if (memberUser?.blockedUsers?.includes(senderObjectId)) {
        blockingMembers.push(memberId);
      }
    }

    // Get list of users currently viewing this group chat
    const groupRoom = `group_${data.groupId}`;
    const roomSockets = await io.in(groupRoom).fetchSockets();
    const viewingUserIds = roomSockets.map(s => (s as any).userId).filter(Boolean);
    

    // Create message with proper isRead logic (like normal messages)
    const message = new Message({
      sender: socket.userId,
      group: data.groupId,
      text: data.text,
      imageUrl: data.imageData,
      videoUrl: data.videoData,
      messageType,
      isRead: false // Will be updated based on who's viewing
    });

    await message.save();
    await message.populate('sender', 'username');
    await message.populate('group', 'name');

    // Mark message as read for users currently viewing the group (except sender)
    if (viewingUserIds.length > 0) {
      const viewingUserIdsExceptSender = viewingUserIds.filter(id => id !== socket.userId);
      if (viewingUserIdsExceptSender.length > 0) {
        // For group messages, we need to create separate read records for each viewing user
        // Since Message model doesn't support multiple readers, we'll handle this in the client
      }
    }

    // Update group with latest message (NO unread count increment - handled by client)
    await Group.updateOne(
      { _id: data.groupId },
      {
        $set: {
          latestMessage: {
            messageId: message._id,
            text: message.text,
            messageType: message.messageType,
            sender: message.sender._id,
            senderUsername: (message.sender as any).username || socket.username || 'Unknown',
            createdAt: message.createdAt
          }
        }
      }
    );

    // Send message only to active group members (not removed members)
    // This ensures removed members don't receive new messages
    for (const member of group.members) {
      const memberId = member.user._id.toString();
      const onlineUser = Array.from(onlineUsers.values())
        .find(user => user.userId === memberId);
      
      if (onlineUser) {
        io.to(onlineUser.socketId).emit("newMessage", message);
      }
    }

    // Send confirmation to sender
    socket.emit("messageSent", message);

  } catch (err) {
    console.error("Send group message error:", err);
    socket.emit("error", { message: "Failed to send message" });
  }
};

// Track which rooms users are in to prevent duplicate joins
const userRooms = new Map<string, Set<string>>();

// Handle joining group chat
const handleJoinGroupChat = async (socket: CustomSocket, groupId: string) => {
  if (!socket.userId) return;
  
  try {
    // Check if user is still an active member of the group (not removed)
    const group = await Group.findOne({
      _id: groupId,
      'members.user': socket.userId, // Only active members can join
      isActive: true
    });
    
    if (!group) {
      // Check if user was removed from the group
      const removedGroup = await Group.findOne({
        _id: groupId,
        'removedMembers.user': socket.userId,
        isActive: true
      });
      
      if (removedGroup) {
        socket.emit("error", { message: "You were removed from this group" });
        return;
      }
      
      socket.emit("error", { message: "You are not a member of this group" });
      return;
    }
    
    const roomName = `group_${groupId}`;
    
    // Check if user is already in this room
    if (!userRooms.has(socket.userId)) {
      userRooms.set(socket.userId, new Set());
    }
    
    const userRoomSet = userRooms.get(socket.userId)!;
    
    if (!userRoomSet.has(roomName)) {
      socket.join(roomName);
      userRoomSet.add(roomName);
    }
  } catch (error) {
    console.error("Error joining group chat:", error);
    socket.emit("error", { message: "Failed to join group chat" });
  }
};

// Handle leaving group chat
const handleLeaveGroupChat = (socket: CustomSocket, groupId: string) => {
  if (!socket.userId) return;
  
  const roomName = `group_${groupId}`;
  socket.leave(roomName);
  
  // Clean up room tracking
  if (userRooms.has(socket.userId)) {
    userRooms.get(socket.userId)!.delete(roomName);
  }
  
};

// Note: Removed debounce tracking for markGroupMessagesAsRead to prevent race conditions

// Handle marking group messages as read
const handleMarkGroupMessagesAsRead = async (io: Server, socket: CustomSocket, data: { groupId: string }) => {
  try {
    
    const userObjectId = new mongoose.Types.ObjectId(socket.userId);
    
    // Immediate database operation - no debounce
    const result = await Group.updateOne(
      {
        _id: data.groupId,
        'members.user': userObjectId
      },
      {
        $set: {
          'members.$.lastReadAt': new Date(),
          'members.$.unreadCount': 0
        }
      }
    );

    
  } catch (err) {
    console.error("Mark group messages as read error:", err);
  }
};

// Handle socket connection
export const handleSocketConnection = async (io: Server, socket: CustomSocket) => {
  
  // Add user to online users
  onlineUsers.set(socket.userId, {
    userId: socket.userId,
    socketId: socket.id,
    username: socket.username
  });

  // Notify all users about online status (except blocked users)
  if (socket.userId && socket.username) {
    notifyUserOnlineStatus(io, socket.userId, socket.username, true);
  }

  // Send filtered online users list to the connected user (excluding blocked users)
  if (socket.userId) {
    const filteredOnlineUsers = await getFilteredOnlineUsers(socket.userId, Array.from(onlineUsers.values()));
    socket.emit("onlineUsers", filteredOnlineUsers);
  }

  // Socket event handlers
  socket.on("sendMessage", (data) => handleSendMessage(io, socket, data));
  socket.on("markMessagesAsRead", (data) => handleMarkMessagesAsRead(io, socket, data));
  socket.on("joinChat", (receiverId) => handleJoinChat(socket, receiverId));
  socket.on("leaveChat", (receiverId) => handleLeaveChat(socket, receiverId));
  socket.on("editMessage", (data) => handleEditMessage(io, socket, data));
  socket.on("deleteMessageForMe", (data) => handleDeleteMessageForMe(io, socket, data));
  socket.on("deleteMessageForEveryone", (data) => handleDeleteMessageForEveryone(io, socket, data));
  
  // Group messaging event handlers
  socket.on("sendGroupMessage", (data) => handleSendGroupMessage(io, socket, data));
  socket.on("joinGroupChat", (groupId) => handleJoinGroupChat(socket, groupId));
  socket.on("leaveGroupChat", (groupId) => handleLeaveGroupChat(socket, groupId));
  socket.on("markGroupMessagesAsRead", (data) => handleMarkGroupMessagesAsRead(io, socket, data));

  socket.on("disconnect", () => {
    
    // Remove user from online users
    onlineUsers.delete(socket.userId);
    
    // Clean up room tracking
    if (socket.userId) {
      userRooms.delete(socket.userId);
    }
    
    // Notify all users about offline status (except blocked users)
    if (socket.userId && socket.username) {
      notifyUserOnlineStatus(io, socket.userId, socket.username, false);
    }
  });
};
