import { Router } from "express";
import { register, login, getAllUsers, searchUsers, blockUser, unblockUser, checkBlockStatus, updateProfile } from "../controllers/authController.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

// Public routes
router.post("/register", register);
router.post("/login", login);

// Protected routes
router.get("/users", authenticateToken, getAllUsers);
router.get("/search", authenticateToken, searchUsers);
router.post("/block/:userId", authenticateToken, blockUser);
router.post("/unblock/:userId", authenticateToken, unblockUser);
router.get("/block-status/:userId", authenticateToken, checkBlockStatus);
router.put("/profile", authenticateToken, updateProfile);

export default router;
