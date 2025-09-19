import express from "express";
import {
  createGroup,
  getUserGroups,
  getGroupDetails,
  addMembersToGroup,
  removeMemberFromGroup,
  leaveGroup,
  getGroupMessages,
  markGroupMessagesAsRead,
  getGroupsInCommon,
  updateGroupIcon,
  removeGroupIcon
} from "../controllers/groupController.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// All group routes require authentication
router.use(authenticateToken);

// Group management routes
router.post("/", createGroup);
router.get("/", getUserGroups);
router.get("/common/:userId", getGroupsInCommon);
router.get("/:groupId", getGroupDetails);
router.post("/:groupId/members", addMembersToGroup);
router.delete("/:groupId/members/:memberId", removeMemberFromGroup);
router.delete("/:groupId/leave", leaveGroup);

// Group messaging routes
router.get("/:groupId/messages", getGroupMessages);
router.put("/:groupId/mark-read", markGroupMessagesAsRead);

// Group icon management routes (admin only)
router.put("/:groupId/icon", updateGroupIcon);
router.delete("/:groupId/icon", removeGroupIcon);

export default router;
