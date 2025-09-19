import { Router } from "express";
import { getMessages, getConversations, markMessagesAsRead, sendMessage, editMessage, deleteMessageForMe, deleteMessageForEveryone } from "../controllers/messageController.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

// GET conversations (users with chat history)
router.get("/conversations", authenticateToken, getConversations);

// POST send a message (text or image)
router.post("/", authenticateToken, sendMessage);

// GET messages between two users
router.get("/:receiverId", authenticateToken, getMessages);

// PUT mark messages as read
router.put("/mark-read/:senderId", authenticateToken, markMessagesAsRead);

// PUT edit a message
router.put("/edit/:messageId", authenticateToken, editMessage);

// DELETE message for me
router.delete("/delete-for-me/:messageId", authenticateToken, deleteMessageForMe);

// DELETE message for everyone
router.delete("/delete-for-everyone/:messageId", authenticateToken, deleteMessageForEveryone);

export default router;
