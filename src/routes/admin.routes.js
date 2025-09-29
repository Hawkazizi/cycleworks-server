// routes/admin.routes.js
import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import upload from "../middleware/upload.js";

const router = Router();

/* -------------------- Auth -------------------- */
// Admin login
router.post("/login", adminController.loginWithLicense);

// Admin profile
router.get(
  "/profile",
  authenticate,
  authorize("admin"),
  adminController.getProfile
);

/* -------------------- Users -------------------- */
// Create new user
router.post(
  "/users",
  authenticate,
  authorize("admin"),
  adminController.createUser
);

// List all users
router.get(
  "/users",
  authenticate,
  authorize("admin"),
  adminController.listUsers
);

// Ban/unban user
router.patch(
  "/users/:id/status",
  authenticate,
  authorize("admin"),
  adminController.banOrUnbanUser
);

// Get user by id
router.get(
  "/users/:id",
  authenticate,
  authorize("admin", "manager", "buyer", "user"),
  adminController.getUserById
);
router.delete(
  "/users/:id",
  authenticate,
  authorize("admin"),
  adminController.deleteUser
);

/* -------------------- Applications -------------------- */
router.get(
  "/applications",
  authenticate,
  authorize("admin", "manager"),
  adminController.getApplications
);

router.post(
  "/applications/:id/review",
  authenticate,
  authorize("admin", "manager"),
  adminController.reviewApplication
);

/* -------------------- Settings -------------------- */
router.get(
  "/settings",
  authenticate,
  authorize("admin"),
  adminController.getSettings
);

router.patch(
  "/settings/:key",
  authenticate,
  authorize("admin"),
  adminController.updateSetting
);

/* -------------------- License Keys -------------------- */
router.get(
  "/license-keys",
  authenticate,
  authorize("admin"),
  adminController.getLicenseKeys
);

router.post(
  "/license-keys",
  authenticate,
  authorize("admin"),
  adminController.createLicenseKey
);

router.patch(
  "/license-keys/:id",
  authenticate,
  authorize("admin"),
  adminController.updateLicenseKey
);

router.patch(
  "/license-keys/:id/toggle",
  authenticate,
  authorize("admin"),
  adminController.toggleLicenseKey
);

router.delete(
  "/license-keys/:id",
  authenticate,
  authorize("admin"),
  adminController.deleteLicenseKey
);

/* -------------------- Roles -------------------- */
router.get(
  "/roles",
  authenticate,
  authorize("admin"),
  adminController.getRoles
);

/* -------------------- Buyer Requests (new flow) -------------------- */
// Step 1: List all buyer requests
router.get(
  "/buyer-requests",
  authenticate,
  authorize("admin"),
  adminController.getBuyerRequests
);

// Step 2: Admin accepts/rejects buyer request
router.post(
  "/buyer-requests/:id/review",
  authenticate,
  authorize("admin"),
  adminController.reviewBuyerRequest
);

// Step 3: Admin attaches documents
router.post(
  "/buyer-requests/:id/admin-docs",
  authenticate,
  authorize("admin"),
  upload.array("files"),
  adminController.addAdminDocs
);

// Step 4: Mark request as completed → notify buyer
router.post(
  "/buyer-requests/:id/complete",
  authenticate,
  authorize("admin"),
  adminController.completeRequest
);

// Get single buyer request
router.get(
  "/buyer-requests/:id",
  authenticate,
  authorize("admin"),
  adminController.getBuyerRequestById
);

export default router;
