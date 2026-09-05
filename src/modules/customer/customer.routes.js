import { Router } from "express";
import * as customerController from "./customer.controller.js";
import { authenticate } from "../../common/middleware/authenticate.js";
import { authorize } from "../../common/middleware/authorize.js";
import upload from "../../common/middleware/upload.js";

const router = Router();

/* =======================================================================
   👤 PROFILE MANAGEMENT
======================================================================= */

// Get profile
router.get(
  "/profile",
  authenticate,
  authorize("buyer"),
  customerController.getProfile,
);

// Update profile
router.put(
  "/profile",
  authenticate,
  authorize("buyer"),
  customerController.updateProfile,
);

// Profile picture upload & fetch
router.post(
  "/profile/picture",
  authenticate,
  authorize("buyer"),
  upload.single("picture"),
  customerController.uploadProfilePicture,
);
router.get(
  "/profile/picture",
  authenticate,
  authorize("buyer"),
  customerController.getProfilePicture,
);

// Delete profile
router.delete(
  "/profile",
  authenticate,
  authorize("buyer"),
  customerController.deleteProfile,
);

/* =======================================================================
   📦 CUSTOMER REQUESTS
======================================================================= */

// Create new customer request
router.post(
  "/requests",
  authenticate,
  authorize("buyer", "admin"),
  customerController.createRequest,
);

// List customer’s own requests
router.get(
  "/requests",
  authenticate,
  authorize("buyer", "admin"),
  customerController.getMyRequests,
);

// Get single request (with details)
router.get(
  "/requests/:id",
  authenticate,
  authorize("buyer", "admin"),
  customerController.getRequestById,
);

// Update customer request (only if still pending)
router.patch(
  "/requests/:id",
  authenticate,
  authorize("buyer", "admin"),
  customerController.updateRequest,
);

// Cancel customer request (soft delete → status=cancelled)
router.delete(
  "/requests/:id",
  authenticate,
  authorize("buyer", "admin"),
  customerController.cancelRequest,
);

/* =======================================================================
   👥 USER & ROLE UTILITIES
======================================================================= */

// Minimal user list (for customer to select supplier)
router.get(
  "/users/minimal",
  authenticate,
  authorize("buyer"),
  customerController.getMinimalUsers,
);

// Minimal customer list (extra endpoint)
router.get(
  "/minimal",
  authenticate,
  authorize("buyer"),
  customerController.getMinimalCustomers,
);

// List users by role "user"
router.get(
  "/roles/user",
  authenticate,
  authorize("buyer"),
  customerController.listUserRoleUsers,
);

/* =======================================================================
   🎟️ TICKETS
======================================================================= */

// Create customer ticket
router.post(
  "/tickets",
  authenticate,
  authorize("buyer"),
  upload.single("attachment"),
  customerController.createCustomerTicket,
);

// Get all customer’s tickets
router.get(
  "/tickets",
  authenticate,
  authorize("buyer"),
  customerController.getMyCustomerTickets,
);

// Update customer ticket
router.patch(
  "/tickets/:id",
  authenticate,
  authorize("buyer"),
  upload.single("attachment"),
  customerController.updateCustomerTicket,
);

export default router;
