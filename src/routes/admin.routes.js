import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import * as adminTrackingCtrl from "../controllers/containerTracking.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import upload from "../middleware/upload.js";

const router = Router();

/* =======================================================================
   🔐 AUTHENTICATION & PROFILE
======================================================================= */

// Login
router.post("/login", adminController.loginWithLicense);

// Profile
router.get(
  "/profile",
  authenticate,
  authorize("admin", "manager"),
  adminController.getProfile,
);
router.patch(
  "/profile",
  authenticate,
  authorize("admin", "manager"),
  adminController.updateProfile,
);

// Profile picture
router.post(
  "/profile/picture",
  authenticate,
  authorize("admin", "manager"),
  upload.single("picture"),
  adminController.uploadProfilePicture,
);
router.get(
  "/profile/picture",
  authenticate,
  authorize("admin", "manager"),
  adminController.getProfilePicture,
);

// Delete profile
router.delete(
  "/profile",
  authenticate,
  authorize("admin", "manager"),
  adminController.deleteProfile,
);

/* =======================================================================
   👥 USER MANAGEMENT
======================================================================= */

router.post(
  "/users",
  authenticate,
  authorize("admin", "manager"),
  adminController.createUser,
);
router.get(
  "/users",
  authenticate,
  authorize("admin", "manager"),
  adminController.listUsers,
);
router.get(
  "/users/:id",
  authenticate,
  authorize("admin", "manager", "buyer", "user"),
  adminController.getUserById,
);
router.get(
  "/users/:id/picture",
  authenticate,
  authorize("admin", "manager"),
  adminController.getUserProfilePicture,
);
router.patch(
  "/users/:id/status",
  authenticate,
  authorize("admin", "manager"),
  adminController.banOrUnbanUser,
);
router.delete(
  "/users/:id",
  authenticate,
  authorize("admin", "manager"),
  adminController.deleteUser,
);

/* =======================================================================
   🧩 ROLES & SETTINGS
======================================================================= */

// Roles
router.get(
  "/roles",
  authenticate,
  authorize("admin", "manager"),
  adminController.getRoles,
);

// Settings
router.get(
  "/settings",
  authenticate,
  authorize("admin", "manager"),
  adminController.getSettings,
);
router.patch(
  "/settings/:key",
  authenticate,
  authorize("admin", "manager"),
  adminController.updateSetting,
);

/* =======================================================================
   🔑 LICENSE KEYS
======================================================================= */

router.get(
  "/license-keys",
  authenticate,
  authorize("admin", "manager"),
  adminController.getLicenseKeys,
);
router.post(
  "/license-keys",
  authenticate,
  authorize("admin"),
  adminController.createLicenseKey,
);
router.patch(
  "/license-keys/:id",
  authenticate,
  authorize("admin"),
  adminController.updateLicenseKey,
);
router.patch(
  "/license-keys/:id/toggle",
  authenticate,
  authorize("admin"),
  adminController.toggleLicenseKey,
);
router.delete(
  "/license-keys/:id",
  authenticate,
  authorize("admin"),
  adminController.deleteLicenseKey,
);

/* =======================================================================
   📋 APPLICATIONS
======================================================================= */

router.get(
  "/applications",
  authenticate,
  authorize("admin", "manager"),
  adminController.getApplications,
);
router.get(
  "/applications/user/:userId",
  authenticate,
  authorize("admin", "manager", "user"),
  adminController.getApplicationsByUser,
);
router.patch(
  "/applications/:id",
  authenticate,
  authorize("admin", "manager", "user"),
  upload.fields([
    { name: "biosecurity", maxCount: 1 },
    { name: "vaccination", maxCount: 1 },
    { name: "emergency", maxCount: 1 },
    { name: "food_safety", maxCount: 1 },
    { name: "description", maxCount: 1 },
    { name: "farm_biosecurity", maxCount: 1 },
  ]),
  adminController.updateApplication,
);
router.post(
  "/applications/:id/review",
  authenticate,
  authorize("admin"),
  adminController.reviewApplication,
);
router.patch(
  "/applications/:id/final-review",
  authenticate,
  authorize("admin"),
  adminController.finalizeApplicationReview,
);

/* =======================================================================
   💼 BUYER REQUESTS
======================================================================= */

router.get(
  "/buyer-requests",
  authenticate,
  authorize("admin", "manager"),
  adminController.getBuyerRequests,
);
router.get(
  "/buyer-requests/:id",
  authenticate,
  authorize("admin", "manager"),
  adminController.getBuyerRequestById,
);
router.patch(
  "/buyer-requests/:id",
  authenticate,
  authorize("admin", "manager"),
  adminController.updateBuyerRequest,
);
router.post(
  "/buyer-requests/:id/review",
  authenticate,
  authorize("admin", "manager"),
  adminController.reviewBuyerRequest,
);
router.post(
  "/buyer-requests/:id/admin-docs",
  authenticate,
  authorize("admin", "manager"),
  upload.array("files"),
  adminController.addAdminDocs,
);
router.post(
  "/buyer-requests/:id/final-status",
  authenticate,
  authorize("admin", "manager"),
  adminController.toggleFinalStatus,
);
router.post(
  "/buyer-requests/:id/assign-suppliers",
  authenticate,
  authorize("admin", "manager"),
  adminController.assignSuppliers,
);
router.patch(
  "/buyer-requests/:id/update-deadline",
  authenticate,
  authorize("admin", "manager"),
  adminController.updateBuyerRequestDeadline,
);

/* =======================================================================
   🚚 CONTAINERS
======================================================================= */

// 🔸 List all containers (must come before :id)
router.get(
  "/containers/all",
  authenticate,
  authorize("admin", "manager"),
  adminController.listAllContainersWithTracking,
);

// 🔸 Get single container details
router.get(
  "/containers/:id",
  authenticate,
  authorize("admin", "manager"),
  adminController.getContainerById,
);

// 🔸 List containers by Buyer Request
router.get(
  "/containers",
  authenticate,
  authorize("admin", "manager"),
  adminController.listContainersByRequestId,
);

// 🔸 Assign containers to suppliers
router.post(
  "/containers/assign",
  authenticate,
  authorize("admin"),
  adminController.assignContainersToSuppliers,
);

// 🔸 Review / Update metadata
router.patch(
  "/containers/:id/metadata-review",
  authenticate,
  authorize("admin", "manager"),
  adminController.reviewContainerMetadataController,
);
router.patch(
  "/containers/:id/admin-metadata",
  authenticate,
  authorize("admin", "manager"),
  adminController.updateContainerAdminMetadataController,
);

// 🔸 Container tracking operations
router.get(
  "/containers-with-tracking",
  authenticate,
  authorize("admin", "manager"),
  adminTrackingCtrl.listAllContainersWithTracking,
);
router.get(
  "/containers/:id/files",
  authenticate,
  authorize("admin", "manager"),
  adminTrackingCtrl.getContainerFiles,
);
router.get(
  "/tracking-code/:code",
  authenticate,
  authorize("admin", "manager"),
  adminTrackingCtrl.findByTrackingCode,
);
router.patch(
  "/containers/:id/toggle-progress",
  authenticate,
  authorize("admin", "manager"),
  adminController.toggleInProgress,
);
router.patch(
  "/containers/:id/complete",
  authenticate,
  authorize("admin", "manager"),
  adminController.markContainerCompleted,
);

/* =======================================================================
   📂 FILES & REVIEWS
======================================================================= */

/* =======================================================================
   📎 CONTAINER FILES (Admin Upload/Delete)
======================================================================= */

// Upload file to container (as admin/manager)
router.post(
  "/containers/:containerId/files",
  authenticate,
  authorize("admin", "manager"),
  upload.single("file"),
  adminController.uploadContainerFile,
);

// Delete a container file (as admin/manager)
router.delete(
  "/containers/:containerId/files/:fileId",
  authenticate,
  authorize("admin", "manager"),
  adminController.deleteContainerFile,
);

// Review farmer file
router.post(
  "/farmer-files/:fileId/review",
  authenticate,
  authorize("admin"),
  adminController.reviewFarmerFile,
);

/* =======================================================================
   🎟️ TICKETS
======================================================================= */

router.get(
  "/tickets",
  authenticate,
  authorize("admin", "manager"),
  adminController.listTickets,
);
router.get(
  "/tickets/:id",
  authenticate,
  authorize("admin", "manager"),
  adminController.getTicket,
);
router.post(
  "/tickets/:id/reply",
  authenticate,
  authorize("admin", "manager"),
  upload.single("attachment"),
  adminController.replyToTicket,
);
router.post(
  "/tickets/:id/close",
  authenticate,
  authorize("admin", "manager"),
  adminController.closeTicket,
);
router.delete(
  "/tickets/:id",
  authenticate,
  authorize("admin", "manager"),
  adminController.deleteTicket,
);

/* =======================================================================
   📊 REPORTS & COMPLETION
======================================================================= */

// Reports export
router.get(
  "/reports/export-csv",
  authenticate,
  authorize("admin", "manager"),
  adminController.exportReportsCSV,
);

// Toggle is_rejected status for a container
router.patch(
  "/:id/reject-toggle",
  authenticate,
  authorize("admin", "manager"),
  adminController.toggleRejectStatus,
);

// Mark buyer request complete
router.put(
  "/buyer-requests/:id/complete",
  authenticate,
  authorize("admin", "manager"),
  adminController.completeBuyerRequest,
);

///////////////
// ⬇️ NEW: Excel import route
router.post(
  "/import-excel",
  authenticate,
  authorize("admin", "manager"),
  upload.array("files", 10),
  adminController.importExcelData,
);

export default router;
