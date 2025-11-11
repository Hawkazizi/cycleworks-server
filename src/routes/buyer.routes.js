import { Router } from "express";
import * as buyerController from "../controllers/buyer.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import upload from "../middleware/upload.js";

const router = Router();

/* =======================================================================
   👤 PROFILE MANAGEMENT
======================================================================= */

// Get profile
router.get(
  "/profile",
  authenticate,
  authorize("buyer"),
  buyerController.getProfile,
);

// Update profile
router.put(
  "/profile",
  authenticate,
  authorize("buyer"),
  buyerController.updateProfile,
);

// Profile picture upload & fetch
router.post(
  "/profile/picture",
  authenticate,
  authorize("buyer"),
  upload.single("picture"),
  buyerController.uploadProfilePicture,
);
router.get(
  "/profile/picture",
  authenticate,
  authorize("buyer"),
  buyerController.getProfilePicture,
);

// Delete profile
router.delete(
  "/profile",
  authenticate,
  authorize("buyer"),
  buyerController.deleteProfile,
);

/* =======================================================================
   📦 BUYER REQUESTS
======================================================================= */

// Create new buyer request
router.post(
  "/requests",
  authenticate,
  authorize("buyer", "admin"),
  buyerController.createRequest,
);

// List buyer’s own requests
router.get(
  "/requests",
  authenticate,
  authorize("buyer", "admin"),
  buyerController.getMyRequests,
);

// Get single request (with details)
router.get(
  "/requests/:id",
  authenticate,
  authorize("buyer", "admin"),
  buyerController.getRequestById,
);

// Update buyer request (only if still pending)
router.patch(
  "/requests/:id",
  authenticate,
  authorize("buyer", "admin"),
  buyerController.updateRequest,
);

// Cancel buyer request (soft delete → status=cancelled)
router.delete(
  "/requests/:id",
  authenticate,
  authorize("buyer", "admin"),
  buyerController.cancelRequest,
);

/* =======================================================================
   👥 USER & ROLE UTILITIES
======================================================================= */

// Minimal user list (for buyer to select farmer)
router.get(
  "/users/minimal",
  authenticate,
  authorize("buyer"),
  buyerController.getMinimalUsers,
);

// Minimal buyer list (extra endpoint)
router.get(
  "/minimal",
  authenticate,
  authorize("buyer"),
  buyerController.getMinimalBuyers,
);

// List users by role "user"
router.get(
  "/roles/user",
  authenticate,
  authorize("buyer"),
  buyerController.listUserRoleUsers,
);

/* =======================================================================
   🎟️ TICKETS
======================================================================= */

// Create buyer ticket
router.post(
  "/tickets",
  authenticate,
  authorize("buyer"),
  upload.single("attachment"),
  buyerController.createBuyerTicket,
);

// Get all buyer’s tickets
router.get(
  "/tickets",
  authenticate,
  authorize("buyer"),
  buyerController.getMyBuyerTickets,
);

// Update buyer ticket
router.patch(
  "/tickets/:id",
  authenticate,
  authorize("buyer"),
  upload.single("attachment"),
  buyerController.updateBuyerTicket,
);

export default router;
