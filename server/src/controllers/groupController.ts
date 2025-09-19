import { Response } from "express";
import Group from "../models/group.js";
import User from "../models/user.js";
import Message from "../models/message.js";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth.js";
import { onlineUsers, emitGroupCreated, getIoInstance, removeUserFromGroupRoom } from "../services/socketService.js";

// Create a new group
export const createGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, memberIds, icon } = req.body;
    const userId = req.user!.id;

    // Validate input
    if (!name || !memberIds || !Array.isArray(memberIds)) {
      return res.status(400).json({ message: "Group name and member IDs are required" });
    }

    // Check if all member IDs are valid
    const validMembers = await User.find({ _id: { $in: memberIds } });
    if (validMembers.length !== memberIds.length) {
      return res.status(400).json({ message: "Some member IDs are invalid" });
    }

    // Check blocking relationships
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const blockedMembers = [];
    const blockingMembers = [];

    for (const memberId of memberIds) {
      const memberObjectId = new mongoose.Types.ObjectId(memberId);
      
      // Check if current user has blocked this member
      if (currentUser.blockedUsers?.includes(memberObjectId)) {
        blockedMembers.push(memberId);
      }
      
      // Check if this member has blocked current user
      const member = await User.findById(memberId);
      if (member?.blockedUsers?.includes(new mongoose.Types.ObjectId(userId))) {
        blockingMembers.push(memberId);
      }
    }

    if (blockedMembers.length > 0 || blockingMembers.length > 0) {
      return res.status(400).json({ 
        message: "Cannot create group with blocked users",
        blockedMembers,
        blockingMembers
      });
    }

    // Create group with creator as admin
    const group = new Group({
      name,
      description,
      icon,
      createdBy: userId,
      members: [
        { user: userId, role: 'admin' },
        ...memberIds.map((memberId: string) => ({ user: memberId, role: 'member' }))
      ]
    });

    await group.save();

    // Create system message for group creation
    const systemMessage = new Message({
      sender: userId,
      group: group._id,
      text: `Group created by ${currentUser.username}`,
      messageType: 'system',
      isRead: false
    });

    await systemMessage.save();
    await systemMessage.populate('sender', 'username email bio profilePicture');

    // Update group's latest message
    group.latestMessage = {
      messageId: systemMessage._id as mongoose.Types.ObjectId,
      text: `Group created by ${currentUser.username}`,
      messageType: 'system',
      sender: new mongoose.Types.ObjectId(userId),
      senderUsername: currentUser.username,
      createdAt: systemMessage.createdAt
    };
    await group.save();

    // Populate user data for response
    const populatedGroup = await Group.findById(group._id)
      .populate('members.user', 'username email bio profilePicture')
      .populate('createdBy', 'username');

    if (!populatedGroup) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Ensure the latestMessage is properly included in the populated group
    const groupWithLatestMessage = {
      ...populatedGroup.toObject(),
      latestMessage: group.latestMessage
    };

    // Emit socket event to notify all group members
    emitGroupCreated(groupWithLatestMessage);

    res.status(201).json({
      message: "Group created successfully",
      group: populatedGroup
    });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get user's groups
export const getUserGroups = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const groups = await Group.find({
      $or: [
        { 'members.user': userId },
        { 'leftMembers.user': userId },
        { 'removedMembers.user': userId }
      ],
      isActive: true
    })
    .populate('createdBy', 'username')
    .sort({ updatedAt: -1 });

    // Get unread counts and latest messages for each group
    const groupsWithUnreadCounts = await Promise.all(
      groups.map(async (group) => {
        // Get the user's member status (current, left, or removed member)
        const userMember = group.members.find(member => member.user.toString() === userId);
        const userLeftMember = group.leftMembers.find(member => member.user.toString() === userId);
        const userRemovedMember = group.removedMembers.find(member => member.user.toString() === userId);
        
        // Calculate unread count based on user's status
        let unreadCount = 0;
        
        if (userMember) {
          // Current member: calculate actual unread count
          const lastReadAt = userMember.lastReadAt || new Date(0);
          unreadCount = await Message.countDocuments({
            group: group._id,
            createdAt: { $gt: lastReadAt }, // Messages after last read time
            sender: { $ne: userId }, // Don't count own messages
            $and: [
              // Note: We now allow messages deleted for everyone to show (they show "This message was deleted")
              // Only filter out messages deleted for the current user
              // Not deleted for this specific user
              {
                $or: [
                  // User is not in deletedForUsers array
                  { deletedForUsers: { $nin: [userId] } },
                  // deletedForUsers field doesn't exist
                  { deletedForUsers: { $exists: false } }
                ]
              },
              // If user is the sender, not deleted for sender
              {
            $or: [
                  { sender: { $ne: userId } }, // User is not the sender
                  { deletedForSender: { $ne: true } } // Or not deleted for sender
                ]
              }
            ]
          });
        } else {
          // Left or removed member: unread count should be 0 since they can't see new messages
          unreadCount = 0;
        }

        // Get the actual latest message that is not deleted for the current user
        let latestMessage = null;
        if (group.latestMessage && group.latestMessage.messageId) {
          // First, check if the stored latest message is deleted for the current user
          const storedMessage = await Message.findById(group.latestMessage.messageId);
          
          if (storedMessage) {
            // Check if this message is deleted for the current user
            const userObjectId = new mongoose.Types.ObjectId(userId);
            const isDeletedForUser = (
              // Note: deletedForEveryone messages should still show (they show "This message was deleted")
              // Only check if the message is deleted specifically for this user
              (storedMessage.deletedForUsers && storedMessage.deletedForUsers.some((id: any) => id.toString() === userId)) ||
              (storedMessage.sender.toString() === userId && storedMessage.deletedForSender)
            );
            
            if (!isDeletedForUser) {
              // Message is not deleted for user, use it
              const sender = await User.findById(storedMessage.sender).select('username email bio profilePicture');
              latestMessage = {
                _id: storedMessage._id,
                text: storedMessage.text,
                messageType: storedMessage.messageType,
                sender: {
                  _id: storedMessage.sender,
                  username: sender?.username || 'Unknown',
                  email: sender?.email || '',
                  bio: sender?.bio || '',
                  profilePicture: sender?.profilePicture || ''
                },
                createdAt: storedMessage.createdAt,
                deletedForSender: storedMessage.deletedForSender || false,
                deletedForReceiver: storedMessage.deletedForReceiver || false,
                deletedForEveryone: storedMessage.deletedForEveryone || false,
                deletedForUsers: storedMessage.deletedForUsers || []
              };
            } else {
              // Message is deleted for user, find the actual latest non-deleted message
              const actualLatestMessage = await Message.findOne({
            group: group._id,
                _id: { $ne: group.latestMessage.messageId }, // Exclude the deleted message
                $and: [
                  // Note: We now allow messages deleted for everyone to show (they show "This message was deleted")
                  // Only filter out messages deleted for the current user
                  // Not deleted for this specific user
                  {
                    $or: [
                      { deletedForUsers: { $nin: [userId] } },
                      { deletedForUsers: { $exists: false } }
                    ]
                  },
                  // If user is the sender, not deleted for sender
                  {
            $or: [
                      { sender: { $ne: userId } },
                      { deletedForSender: { $ne: true } }
                    ]
                  }
                ]
              })
              .populate('sender', 'username email bio profilePicture')
              .sort({ createdAt: -1 })
              .limit(1);
              
              if (actualLatestMessage) {
                latestMessage = {
                  _id: actualLatestMessage._id,
                  text: actualLatestMessage.text,
                  messageType: actualLatestMessage.messageType,
                  sender: {
                    _id: actualLatestMessage.sender._id,
                    username: (actualLatestMessage.sender as any).username || 'Unknown',
                    email: (actualLatestMessage.sender as any).email || '',
                    bio: (actualLatestMessage.sender as any).bio || '',
                    profilePicture: (actualLatestMessage.sender as any).profilePicture || ''
                  },
                  createdAt: actualLatestMessage.createdAt,
                  deletedForSender: actualLatestMessage.deletedForSender || false,
                  deletedForReceiver: actualLatestMessage.deletedForReceiver || false,
                  deletedForEveryone: actualLatestMessage.deletedForEveryone || false,
                  deletedForUsers: actualLatestMessage.deletedForUsers || []
                };
              }
            }
          }
        }

        // Check if current user has left this group
        const hasLeft = group.leftMembers.some(leftMember => 
          leftMember.user.toString() === userId
        );

        // Check if current user has been removed from this group
        const hasBeenRemoved = group.removedMembers.some(removedMember => 
          removedMember.user.toString() === userId
        );

        // Populate user data for response
        const populatedGroup = await Group.findById(group._id)
          .populate('members.user', 'username email bio profilePicture')
          .populate('createdBy', 'username');

        return {
          ...populatedGroup!.toObject(),
          unreadCount,
          lastMessage: latestMessage,
          hasLeft,
          hasBeenRemoved
        };
      })
    );

    res.json({ groups: groupsWithUnreadCounts });
  } catch (error) {
    console.error("Error fetching user groups:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get group details
export const getGroupDetails = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;

    const group = await Group.findOne({
      _id: groupId,
      'members.user': userId,
      isActive: true
    })
    .populate('createdBy', 'username');

    if (!group) {
      return res.status(404).json({ message: "Group not found or access denied" });
    }

    // Populate user data for response
    const populatedGroup = await Group.findById(group._id)
      .populate('members.user', 'username email bio profilePicture')
      .populate('createdBy', 'username');

    res.json({ group: populatedGroup });
  } catch (error) {
    console.error("Error fetching group details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Add members to group
export const addMembersToGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const { memberIds } = req.body;
    const userId = req.user!.id;

    const group = await Group.findOne({
      _id: groupId,
      'members.user': userId,
      'members.role': 'admin',
      isActive: true
    });

    if (!group) {
      return res.status(404).json({ message: "Group not found or insufficient permissions" });
    }

    // Check if all member IDs are valid
    const validMembers = await User.find({ _id: { $in: memberIds } });
    if (validMembers.length !== memberIds.length) {
      return res.status(400).json({ message: "Some member IDs are invalid" });
    }

    // Check blocking relationships
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const blockedMembers = [];
    const blockingMembers = [];
    const alreadyInGroupMembers = [];

    for (const memberId of memberIds) {
      const memberObjectId = new mongoose.Types.ObjectId(memberId);
      
      // Check if member is already in group
      if (group.members.some(m => m.user.toString() === memberId)) {
        alreadyInGroupMembers.push(memberId);
        continue; // Skip other checks for this user
      }
      
      // Check if current user has blocked this member
      if (currentUser.blockedUsers?.includes(memberObjectId)) {
        blockedMembers.push(memberId);
      }
      
      // Check if this member has blocked current user
      const member = await User.findById(memberId);
      if (member?.blockedUsers?.includes(new mongoose.Types.ObjectId(userId))) {
        blockingMembers.push(memberId);
      }
    }

    if (blockedMembers.length > 0 || blockingMembers.length > 0 || alreadyInGroupMembers.length > 0) {
      return res.status(400).json({ 
        message: "Cannot add blocked users, users who blocked you, or users already in group",
        blockedMembers,
        blockingMembers,
        alreadyInGroupMembers
      });
    }

    // Add new members and handle users who previously left
    const newMembers = [];
    for (const memberId of memberIds) {
      // Check if user previously left the group
      const leftMemberIndex = group.leftMembers.findIndex(
        leftMember => leftMember.user.toString() === memberId
      );
      
      if (leftMemberIndex !== -1) {
        // Remove from leftMembers array
        group.leftMembers.splice(leftMemberIndex, 1);
      }
      
      // Add to members array
      newMembers.push({
        user: new mongoose.Types.ObjectId(memberId),
        role: 'member' as const,
        joinedAt: new Date(),
        unreadCount: 0,
        lastReadAt: new Date()
      });
    }

    group.members.push(...newMembers);
    await group.save();

    // Create a system message to notify about new members
    const newMemberUsernames = validMembers.map(member => member.username).join(', ');
    const systemMessage = new Message({
      sender: userId, // Admin who added the members
      group: groupId,
      text: `${newMemberUsernames} ${memberIds.length === 1 ? 'was' : 'were'} added to the group`,
      messageType: 'system'
    });
    await systemMessage.save();
    await systemMessage.populate('sender', 'username');
    await systemMessage.populate('group', 'name');

    // Update group's latest message
    group.latestMessage = {
      messageId: systemMessage._id as mongoose.Types.ObjectId,
      text: systemMessage.text,
      messageType: systemMessage.messageType,
      sender: new mongoose.Types.ObjectId(userId), // Use the admin's userId directly
      senderUsername: (systemMessage.sender as any).username || 'System',
      createdAt: systemMessage.createdAt
    };
    await group.save();

    // Populate user data for response
    const populatedGroup = await Group.findById(group._id)
      .populate('members.user', 'username email bio profilePicture')
      .populate('createdBy', 'username');

    res.json({
      message: "Members added successfully",
      group: populatedGroup
    });
  } catch (error) {
    console.error("Error adding members to group:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Remove member from group
export const removeMemberFromGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.user!.id;

    const group = await Group.findOne({
      _id: groupId,
      'members.user': userId,
      'members.role': 'admin',
      isActive: true
    }).populate('members.user', 'username');

    if (!group) {
      return res.status(404).json({ message: "Group not found or insufficient permissions" });
    }

    // Check if member exists in group
    // Convert memberId to ObjectId for comparison
    const memberObjectId = new mongoose.Types.ObjectId(memberId);
    const memberIndex = group.members.findIndex(m => m.user.equals(memberObjectId));
    if (memberIndex === -1) {
      return res.status(404).json({ message: "Member not found in group" });
    }

    const memberToRemove = group.members[memberIndex];
    const removedMemberUsername = (memberToRemove.user as any).username;

    // Move member from members to removedMembers (like WhatsApp - they can still see chat history)
    const memberToMove = group.members[memberIndex];
    group.members.splice(memberIndex, 1);
    group.removedMembers.push({
      user: new mongoose.Types.ObjectId(memberId),
      removedAt: new Date(),
      removedBy: new mongoose.Types.ObjectId(userId)
    });
    await group.save();

    // Create a single system message for member removal
    const removalMessage = new Message({
      sender: userId,
      group: groupId,
      text: `${removedMemberUsername} was removed from this group`,
      messageType: 'system',
      removedMemberId: memberId, // Store the removed member's ID for client-side logic
      createdAt: new Date()
    });
    await removalMessage.save();
    await removalMessage.populate('sender', 'username email bio profilePicture');

    // Update group's latest message
    group.latestMessage = {
      messageId: removalMessage._id as mongoose.Types.ObjectId,
      text: `${removedMemberUsername} was removed from this group`,
      messageType: 'system',
      sender: new mongoose.Types.ObjectId(userId),
      senderUsername: (req.user as any).username,
      createdAt: removalMessage.createdAt
    };
    await group.save();

    // Populate the updated group
    const populatedGroup = await Group.findById(group._id)
      .populate('members.user', 'username email bio profilePicture')
      .populate('createdBy', 'username');

    // Emit socket events for real-time updates
    const io = getIoInstance();
    if (io) {
      // Remove the user from the group room (so they stop receiving new messages)
      const removedMemberSocket = Array.from(onlineUsers.values())
        .find(user => user.userId === memberId);
      if (removedMemberSocket) {
        // Remove from group room
        io.to(removedMemberSocket.socketId).socketsLeave(`group_${group._id}`);
        
        // Send the removal message and updated group data
        io.to(removedMemberSocket.socketId).emit('memberRemovedFromGroup', {
          groupId: group._id,
          message: removalMessage,
          updatedGroup: populatedGroup
        });
      }

      // Remove the user from the group socket room immediately
      removeUserFromGroupRoom(memberId, group._id as string);

      // Emit to all remaining group members (not removed members)
      for (const member of group.members) {
        const memberId = member.user._id.toString();
        const onlineUser = Array.from(onlineUsers.values())
          .find(user => user.userId === memberId);
        
        if (onlineUser) {
          io.to(onlineUser.socketId).emit('groupMemberRemoved', {
            groupId: group._id,
            removedMemberId: memberId,
            removedMemberUsername: removedMemberUsername,
            message: removalMessage,
            updatedGroup: populatedGroup
          });
        }
      }
    }

    res.json({ group: populatedGroup });
  } catch (error) {
    console.error("Error removing member from group:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Leave group
export const leaveGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;

    const group = await Group.findOne({
      _id: groupId,
      'members.user': userId,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if user is the creator
    if (group.createdBy.toString() === userId) {
      return res.status(400).json({ message: "Group creator cannot leave the group" });
    }

    // Get user info before removing
    const leavingUser = await User.findById(userId);
    
    // Move user from members to leftMembers instead of removing completely
    const memberToMove = group.members.find(m => m.user.toString() === userId);
    if (memberToMove) {
      group.members = group.members.filter(m => m.user.toString() !== userId);
      group.leftMembers.push({
        user: new mongoose.Types.ObjectId(userId),
        leftAt: new Date()
      });
      await group.save();
    }

    // Create system message for user leaving
    if (leavingUser) {
      const systemMessage = new Message({
        sender: userId,
        group: groupId,
        text: `${leavingUser.username} left the group`,
        messageType: 'system',
        isRead: false
      });

      await systemMessage.save();
      await systemMessage.populate('sender', 'username email bio profilePicture');

      // Update group's latest message
      group.latestMessage = {
        messageId: systemMessage._id as mongoose.Types.ObjectId,
        text: `${leavingUser.username} left the group`,
        messageType: 'system',
        sender: new mongoose.Types.ObjectId(userId),
        senderUsername: leavingUser.username,
        createdAt: systemMessage.createdAt
      };
      await group.save();

      // Emit socket event to remaining group members
      const io = getIoInstance();
      if (io) {
        const groupRoom = `group_${group._id}`;
        io.to(groupRoom).emit('groupMemberLeft', {
          groupId: group._id,
          leftMemberId: userId,
          leftMemberUsername: leavingUser.username,
          message: systemMessage
        });
      }
    }

    res.json({ message: "Left group successfully" });
  } catch (error) {
    console.error("Error leaving group:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get group messages
export const getGroupMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    // Check if user was ever a member of this group (current, left, or removed)
    const group = await Group.findOne({
      _id: groupId,
      $or: [
        { 'members.user': userId }, // Current member
        { 'leftMembers.user': userId }, // Left member
        { 'removedMembers.user': userId } // Removed member
      ],
      isActive: true
    });

    if (!group) {
      return res.status(404).json({ message: "Group not found or access denied" });
    }

    // Find the user's member record to get their join date (current, left, or removed)
    let userMember = group.members.find(member => member.user.toString() === userId);
    let userLeftMember = group.leftMembers.find(member => member.user.toString() === userId);
    let userRemovedMember = group.removedMembers.find(member => member.user.toString() === userId);
    
    if (!userMember && !userLeftMember && !userRemovedMember) {
      return res.status(404).json({ message: "User not found in group" });
    }

    // Determine the date range for messages based on user's status
    let messageDateFilter: any = {};
    
    if (userMember) {
      // Current member: can see all messages from when they joined
      messageDateFilter = {
        $or: [
          // System messages (like group creation) - show regardless of join date
          { messageType: 'system' },
          // Regular messages - only show after user joined
          { 
            messageType: { $ne: 'system' },
            createdAt: { $gte: userMember.joinedAt }
          }
        ]
      };
    } else if (userLeftMember) {
      // Left member: can see messages from when they joined until they left
      // Note: We need to get the original join date, but leftMembers only has leftAt
      // For now, we'll show all messages up to when they left (this might need refinement)
      messageDateFilter = {
        $or: [
          // System messages (like group creation) - show regardless of join date
          { messageType: 'system' },
          // Regular messages - only show up to when they left
          { 
            messageType: { $ne: 'system' },
            createdAt: { $lte: userLeftMember.leftAt }
          }
        ]
      };
    } else if (userRemovedMember) {
      // Removed member: can see messages from when they joined until they were removed
      messageDateFilter = {
        $or: [
          // System messages (like group creation) - show regardless of join date
          { messageType: 'system' },
          // Regular messages - only show from join date until removal date
          { 
            messageType: { $ne: 'system' },
            createdAt: { $lte: userRemovedMember.removedAt }
          }
        ]
      };
    }

    // Get messages with pagination
    const messages = await Message.find({
      group: groupId,
      ...messageDateFilter,
      $and: [
        // Note: We now allow messages deleted for everyone to show (they show "This message was deleted")
        // Only filter out messages deleted for the current user
        // Not deleted for this specific user
        {
          $or: [
            // User is not in deletedForUsers array
            { deletedForUsers: { $nin: [userId] } },
            // deletedForUsers field doesn't exist
            { deletedForUsers: { $exists: false } }
          ]
        },
        // If user is the sender, not deleted for sender
        {
      $or: [
            { sender: { $ne: userId } }, // User is not the sender
            { deletedForSender: { $ne: true } } // Or not deleted for sender
          ]
        }
      ]
    })
    .populate('sender', 'username email bio profilePicture')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip((page - 1) * limit);

    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error("Error fetching group messages:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Mark group messages as read
export const markGroupMessagesAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;

    // Check if user is member of group
    const group = await Group.findOne({
      _id: groupId,
      'members.user': userId,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({ message: "Group not found or access denied" });
    }

    // Update the user's lastReadAt timestamp in the group
    // This is the proper way to track read status for group messages
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const result = await Group.updateOne(
      {
        _id: groupId,
        'members.user': userObjectId
      },
      {
        $set: {
          'members.$.lastReadAt': new Date(),
          'members.$.unreadCount': 0
        }
      }
    );

    res.json({ modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error("Error marking group messages as read:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get groups in common between current user and another user
export const getGroupsInCommon = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.userId;
    const currentUserId = req.user!.id;

    // Use string IDs directly like getUserGroups does

    // First, let's check what groups each user is in
    const currentUserGroups = await Group.find({
      'members.user': currentUserId,
      isActive: true
    }).select('name members.user');

    const targetUserGroups = await Group.find({
      'members.user': userId,
      isActive: true
    }).select('name members.user');

    // Let's also check what groups exist and their members
    const allGroups = await Group.find({ isActive: true }).select('name members.user');

    // Find groups where both users are members
    const groups = await Group.find({
      'members.user': { $all: [currentUserId, userId] },
      isActive: true
    })
    .populate('createdBy', 'username')
    .select('name members createdBy createdAt')
    .sort({ updatedAt: -1 });

    
    // Populate user data for response
    const populatedGroups = await Promise.all(
      groups.map(async (group) => {
        return await Group.findById(group._id)
          .populate('members.user', 'username email bio profilePicture')
          .populate('createdBy', 'username');
      })
    );

    res.json(populatedGroups);
  } catch (error) {
    console.error("Error fetching groups in common:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update group icon (admin only)
export const updateGroupIcon = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const { icon } = req.body;
    const userId = req.user!.id;

    // Find the group and verify admin access
    const group = await Group.findOne({
      _id: groupId,
      'members.user': userId,
      'members.role': 'admin',
      isActive: true
    });

    if (!group) {
      return res.status(404).json({ message: "Group not found or you don't have admin access" });
    }

    // Update the group icon
    group.icon = icon;
    await group.save();

    // Populate user data for response
    const populatedGroup = await Group.findById(group._id)
      .populate('members.user', 'username email bio profilePicture')
      .populate('createdBy', 'username');

    res.json(populatedGroup);
  } catch (error) {
    console.error("Error updating group icon:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Remove group icon (admin only)
export const removeGroupIcon = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;

    // Find the group and verify admin access
    const group = await Group.findOne({
      _id: groupId,
      'members.user': userId,
      'members.role': 'admin',
      isActive: true
    });

    if (!group) {
      return res.status(404).json({ message: "Group not found or you don't have admin access" });
    }

    // Remove the group icon
    group.icon = undefined;
    await group.save();

    // Populate user data for response
    const populatedGroup = await Group.findById(group._id)
      .populate('members.user', 'username email bio profilePicture')
      .populate('createdBy', 'username');

    res.json(populatedGroup);
  } catch (error) {
    console.error("Error removing group icon:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
