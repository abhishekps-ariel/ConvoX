import { Response } from "express";
import mongoose from "mongoose";
import Message from "../models/message.js";
import User from "../models/user.js";
import Group from "../models/group.js";
import { AuthRequest } from "../middleware/auth.js";

// Get messages between two users
export const getMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { receiverId } = req.params;
    const senderId = req.user?.id;

    if (!senderId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (!receiverId) {
      return res.status(400).json({ message: "Receiver ID is required" });
    }

    const messages = await Message.find({
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId }
      ],
      receiver: { $exists: true } // Only direct messages, not group messages
    })
    .populate('sender', 'username email')
    .populate('receiver', 'username email')
    .sort({ createdAt: 1 })
    .select('sender receiver text imageUrl videoUrl messageType isRead isEdited editedAt deletedForSender deletedForReceiver deletedForEveryone deletedAt createdAt');
    res.json(messages);
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get conversation history (users with whom current user has chatted)
export const getConversations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    console.log(`Fetching conversations for user: ${userId} (ObjectId: ${userObjectId})`);

    // Get all direct messages for this user (exclude group messages and deleted messages)
    const messages = await Message.find({
          $and: [
            { receiver: { $exists: true } }, // Only direct messages, not group messages
            {
              $or: [
                { sender: userObjectId },
                { receiver: userObjectId }
              ]
            },
            // Note: We now allow messages deleted for everyone to show (they show "This message was deleted")
            // Only filter out messages deleted for the current user
            // Not deleted for sender (if current user is sender)
            {
              $or: [
                { sender: { $ne: userObjectId } }, // Current user is not sender
                { deletedForSender: { $ne: true } } // Or not deleted for sender
              ]
            },
            // Not deleted for receiver (if current user is receiver)
            {
              $or: [
                { receiver: { $ne: userObjectId } }, // Current user is not receiver
                { deletedForReceiver: { $ne: true } } // Or not deleted for receiver
              ]
            }
          ]
    }) 
    .populate('sender', 'username email bio profilePicture')
    .populate('receiver', 'username email bio profilePicture')
    .sort({ createdAt: 1 });

    console.log(`Found ${messages.length} messages for user ${userId}`);
    messages.forEach((msg, index) => {
      console.log(`Message ${index + 1}: sender=${msg.sender._id}, receiver=${msg.receiver?._id || 'N/A'}, text="${msg.text}"`);
    });

    // Group messages by conversation partner
    const conversationMap = new Map();

    messages.forEach(message => {
      // Skip messages without receiver (group messages)
      if (!message.receiver) {
        return;
      }

      // Additional validation: ensure current user is actually part of this conversation
      if (message.sender._id.toString() !== userId && message.receiver._id.toString() !== userId) {
        console.warn(`Message ${message._id} does not belong to user ${userId}! Sender: ${message.sender._id}, Receiver: ${message.receiver._id}`);
        return;
      }

      const otherUserId = message.sender._id.toString() === userId 
        ? message.receiver._id.toString() 
        : message.sender._id.toString();
      
      const otherUser = message.sender._id.toString() === userId 
        ? message.receiver 
        : message.sender;

      if (!conversationMap.has(otherUserId)) {
        conversationMap.set(otherUserId, {
          _id: otherUserId,
          username: (otherUser as any).username,
          email: (otherUser as any).email,
          bio: (otherUser as any).bio,
          profilePicture: (otherUser as any).profilePicture,
          lastMessage: null,
          unreadCount: 0
        });
      }

      const conversation = conversationMap.get(otherUserId);
      
      // Update last message
      if (!conversation.lastMessage || message.createdAt > conversation.lastMessage.createdAt) {
        conversation.lastMessage = {
          _id: message._id,
          text: message.text || '',
          imageUrl: message.imageUrl || null,
          videoUrl: message.videoUrl || null,
          messageType: message.messageType || 'text',
          isRead: message.isRead || false,
          isEdited: message.isEdited || false,
          editedAt: message.editedAt || null,
          deletedForSender: message.deletedForSender || false,
          deletedForReceiver: message.deletedForReceiver || false,
          deletedForEveryone: message.deletedForEveryone || false,
          deletedAt: message.deletedAt || null,
          sender: {
            _id: message.sender._id,
            username: (message.sender as any).username
          },
          receiver: {
            _id: message.receiver._id,
            username: (message.receiver as any).username
          },
          createdAt: message.createdAt
        };
      }

      // Count unread messages
      if (message.receiver && message.receiver._id.toString() === userId && !message.isRead) {
        conversation.unreadCount++;
      }
    });

    // Convert map to array and sort by last message time
    const conversations = Array.from(conversationMap.values())
      .filter(conv => conv.lastMessage) // Only include conversations with messages
      .sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());

    console.log(`Returning ${conversations.length} conversations for user ${userId}`);
    conversations.forEach((conv, index) => {
      console.log(`Conversation ${index + 1}: User ${conv._id} (${conv.username})`);
    });

    res.json(conversations);
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Send a message (text or image)
export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { receiverId, text, imageData, videoData, messageType } = req.body;
    const senderId = req.user?.id;

    if (!senderId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (!receiverId) {
      return res.status(400).json({ message: "Receiver ID is required" });
    }

    if (!messageType || !['text', 'image', 'video'].includes(messageType)) {
      return res.status(400).json({ message: "Invalid message type" });
    }

    if (messageType === 'text' && !text?.trim()) {
      return res.status(400).json({ message: "Text message cannot be empty" });
    }

    if (messageType === 'image' && !imageData) {
      return res.status(400).json({ message: "Image data is required for image messages" });
    }

    if (messageType === 'video' && !videoData) {
      return res.status(400).json({ message: "Video data is required for video messages" });
    }

    // Validate base64 image data
    if (messageType === 'image' && imageData) {
      if (!imageData.startsWith('data:image/')) {
        return res.status(400).json({ message: "Invalid image format" });
      }
    }

    // Validate base64 video data
    if (messageType === 'video' && videoData) {
      if (!videoData.startsWith('data:video/')) {
        return res.status(400).json({ message: "Invalid video format" });
      }
    }

    const senderObjectId = new mongoose.Types.ObjectId(senderId);
    const receiverObjectId = new mongoose.Types.ObjectId(receiverId);

    // Check if sender is blocked by receiver OR if sender has blocked receiver
    const receiver = await User.findById(receiverId);
    const sender = await User.findById(senderId);
    
    if (receiver && receiver.blockedUsers?.includes(senderObjectId)) {
      return res.status(403).json({ message: "You are blocked by this user" });
    }
    
    if (sender && sender.blockedUsers?.includes(receiverObjectId)) {
      return res.status(403).json({ message: "You have blocked this user" });
    }

    const messageData: any = {
      sender: senderObjectId,
      receiver: receiverObjectId,
      messageType,
      isRead: false
    };

    if (messageType === 'text') {
      messageData.text = text.trim();
    } else if (messageType === 'image') {
      messageData.imageUrl = imageData; // Store base64 data directly
      messageData.text = ''; // Empty text for image messages
    } else if (messageType === 'video') {
      messageData.videoUrl = videoData; // Store base64 data directly
      messageData.text = ''; // Empty text for video messages
    }

    const message = new Message(messageData);
    await message.save();

    // Populate sender and receiver info
    await message.populate('sender', 'username');
    await message.populate('receiver', 'username');

    res.status(201).json(message);
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Mark messages as read
export const markMessagesAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const { senderId } = req.params;
    const receiverId = req.user?.id;

    if (!receiverId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const senderObjectId = new mongoose.Types.ObjectId(senderId);
    const receiverObjectId = new mongoose.Types.ObjectId(receiverId);

    const result = await Message.updateMany(
      { sender: senderObjectId, receiver: receiverObjectId, isRead: false },
      { isRead: true }
    );

    res.json({ 
      message: "Messages marked as read", 
      modifiedCount: result.modifiedCount 
    });
  } catch (error) {
    console.error("Mark messages as read error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Edit a message 
export const editMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const { text } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (!messageId) {
      return res.status(400).json({ message: "Message ID is required" });
    }

    if (!text?.trim()) {
      return res.status(400).json({ message: "Text cannot be empty" });
    }

    const messageObjectId = new mongoose.Types.ObjectId(messageId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Find the message and verify ownership
    const message = await Message.findOne({
      _id: messageObjectId,
      sender: userObjectId
    });

    if (!message) {
      return res.status(404).json({ message: "Message not found or you don't have permission to edit it" });
    }

    // Check if the message is older than 12 hours
    const messageAge = Date.now() - new Date(message.createdAt).getTime();
    const twelveHoursInMs = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
    
    if (messageAge > twelveHoursInMs) {
      return res.status(400).json({ message: "Cannot edit message older than 12 hours" });
    }

    // Only allow editing text messages
    if (message.messageType !== 'text') {
      return res.status(400).json({ message: "Only text messages can be edited" });
    }

    // Update the message
    message.text = text.trim();
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

    res.json(message);
  } catch (error) {
    console.error("Edit message error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete message for me (only on user's side)
export const deleteMessageForMe = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (!messageId) {
      return res.status(400).json({ message: "Message ID is required" });
    }

    const messageObjectId = new mongoose.Types.ObjectId(messageId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Find the message
    const message = await Message.findById(messageObjectId);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Check if user is sender, receiver, or group member
    const isSender = message.sender.toString() === userId;
    const isReceiver = message.receiver && message.receiver.toString() === userId;
    
    // For group messages, check if user is a member of the group
    let isGroupMember = false;
    if (message.group) {
      const group = await Group.findOne({
        _id: message.group,
        'members.user': userId,
        isActive: true
      });
      isGroupMember = !!group;
    }

    if (!isSender && !isReceiver && !isGroupMember) {
      return res.status(403).json({ message: "You don't have permission to delete this message" });
    }

    // Update the appropriate delete flag
    if (isSender) {
      message.deletedForSender = true;
    } else if (isReceiver) {
      message.deletedForReceiver = true;
    } else if (isGroupMember) {
      // For group messages, add the user to the deletedForUsers array
      if (!message.deletedForUsers) {
        message.deletedForUsers = [];
      }
      if (!message.deletedForUsers.includes(userObjectId)) {
        message.deletedForUsers.push(userObjectId);
      }
    }

    message.deletedAt = new Date();
    await message.save();

    res.json({ message: "Message deleted for you", messageId: messageId });
  } catch (error) {
    console.error("Delete message for me error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete message for everyone (only sender, within 12 hours)
export const deleteMessageForEveryone = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (!messageId) {
      return res.status(400).json({ message: "Message ID is required" });
    }

    const messageObjectId = new mongoose.Types.ObjectId(messageId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Find the message and verify ownership
    const message = await Message.findOne({
      _id: messageObjectId,
      sender: userObjectId
    });

    if (!message) {
      return res.status(404).json({ message: "Message not found or you don't have permission to delete it" });
    }

    // Check if the message is older than 12 hours
    const messageAge = Date.now() - new Date(message.createdAt).getTime();
    const twelveHoursInMs = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
    
    if (messageAge > twelveHoursInMs) {
      return res.status(400).json({ message: "Cannot delete message older than 12 hours" });
    }

    // Mark as deleted for everyone
    message.deletedForEveryone = true;
    message.deletedAt = new Date();
    await message.save();

    res.json({ message: "Message deleted for everyone", messageId: messageId });
  } catch (error) {
    console.error("Delete message for everyone error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
