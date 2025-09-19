import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import mongoose from "mongoose";
import User, { IUser } from "../models/user.js";
import { AuthRequest } from "../middleware/auth.js";

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// Register new user
export const register = async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({
        message: existingUser.email === email ? "Email already exists" : "Username already exists"
      });
    }

    // Create new user
    const user = new User({ username, email, password });
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Login user
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all users (for search functionality)
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await User.find({}, { password: 0 }).select("_id username email bio profilePicture");
    // Transform _id to id for frontend compatibility
    const transformedUsers = users.map(user => ({
      id: user._id,
      username: user.username,
      email: user.email,
      bio: user.bio,
      profilePicture: user.profilePicture
    }));
    res.json(transformedUsers);
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Search users
export const searchUsers = async (req: Request, res: Response) => {
  try {
    const { query } = req.query;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ message: "Search query is required" });
    }

    const users = await User.find({
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    }, { password: 0 }).select("_id username email bio profilePicture");

    // Transform _id to id for frontend compatibility
    const transformedUsers = users.map(user => ({
      id: user._id,
      username: user.username,
      email: user.email,
      bio: user.bio,
      profilePicture: user.profilePicture
    }));

    res.json(transformedUsers);
  } catch (error) {
    console.error("Search users error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Block a user
export const blockUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const currentUserId = (req as any).user?.id;

    if (!currentUserId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (userId === currentUserId) {
      return res.status(400).json({ message: "Cannot block yourself" });
    }

    // Add user to blocked list
    await User.findByIdAndUpdate(
      currentUserId,
      { $addToSet: { blockedUsers: userId } }
    );

    // Add current user to blocked user's blockedBy list
    await User.findByIdAndUpdate(
      userId,
      { $addToSet: { blockedBy: currentUserId } }
    );

    res.json({ message: "User blocked successfully" });
  } catch (error) {
    console.error("Block user error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Unblock a user
export const unblockUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const currentUserId = (req as any).user?.id;

    if (!currentUserId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Remove user from blocked list
    await User.findByIdAndUpdate(
      currentUserId,
      { $pull: { blockedUsers: userId } }
    );

    // Remove current user from blocked user's blockedBy list
    await User.findByIdAndUpdate(
      userId,
      { $pull: { blockedBy: currentUserId } }
    );

    res.json({ message: "User unblocked successfully" });
  } catch (error) {
    console.error("Unblock user error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Check if user is blocked
export const checkBlockStatus = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const currentUserId = (req as any).user?.id;

    if (!currentUserId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (!userId || userId === 'undefined') {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const currentUser = await User.findById(currentUserId);
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const otherUser = await User.findById(userId);
    if (!otherUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const currentUserObjectId = new mongoose.Types.ObjectId(currentUserId);
    const otherUserObjectId = new mongoose.Types.ObjectId(userId);

    const isBlockedByMe = currentUser.blockedUsers?.includes(otherUserObjectId) || false;
    const isBlockedByThem = otherUser.blockedUsers?.includes(currentUserObjectId) || false;

    res.json({ 
      isBlockedByMe,
      isBlockedByThem,
      isBlocked: isBlockedByMe || isBlockedByThem
    });
  } catch (error) {
    console.error("Check block status error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update user profile
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { bio, profilePicture } = req.body;
    const userId = req.user!.id;

    const updateData: any = {};
    if (bio !== undefined) updateData.bio = bio;
    if (profilePicture !== undefined) updateData.profilePicture = profilePicture;

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, select: '-password' }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
