import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import * as adminTrackingCtrl from "../controllers/containerTracking.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import upload from "../middleware/upload.js";

const router = Router();

/* -------------------- Auth -------------------- */
// Admin (Manager) login
router.post("/login", adminController.loginWithLicense);

// Admin (Manager) profile
router.get(
  "/profile",
  authenticate,
  authorize("admin", "manager"),
  adminController.getProfile
);
router.patch(
  "/profile",
  authenticate,
  authorize("admin", "manager"),
  adminController.updateProfile
);

/* -------------------- Users -------------------- */
router.post(
  "/users",
  authenticate,
  authorize("admin"),
  adminController.createUser
);
router.get(
  "/users",
  authenticate,
  authorize("admin", "manager"),
  adminController.listUsers
);
router.patch(
  "/users/:id/status",
  authenticate,
  authorize("admin"),
  adminController.banOrUnbanUser
);
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

/* -------------------- Reports -------------------- */
router.get(
  "/reports/export-csv",
  authenticate,
  authorize("admin", "manager"),
  adminController.exportReportsCSV
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
  authorize("admin"),
  adminController.reviewApplication
);

/* -------------------- Settings -------------------- */
router.get(
  "/settings",
  authenticate,
  authorize("admin", "manager"),
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
  authorize("admin", "manager"),
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
  authorize("admin", "manager"),
  adminController.getRoles
);

/* -------------------- Buyer Requests -------------------- */
router.get(
  "/buyer-requests",
  authenticate,
  authorize("admin", "manager"),
  adminController.getBuyerRequests
);
router.post(
  "/buyer-requests/:id/review",
  authenticate,
  authorize("admin"),
  adminController.reviewBuyerRequest
);
router.post(
  "/buyer-requests/:id/admin-docs",
  authenticate,
  authorize("admin"),
  upload.array("files"),
  adminController.addAdminDocs
);
router.patch(
  "/buyer-requests/:id",
  authenticate,
  authorize("admin"),
  adminController.updateBuyerRequest
);
router.post(
  "/buyer-requests/:id/complete",
  authenticate,
  authorize("admin"),
  adminController.completeRequest
);
router.get(
  "/buyer-requests/:id",
  authenticate,
  authorize("admin", "manager"),
  adminController.getBuyerRequestById
);

// Review farmer files
router.post(
  "/farmer-files/:fileId/review",
  authenticate,
  authorize("admin"),
  adminController.reviewFarmerFile
);
router.post(
  "/buyer-requests/:id/assign-suppliers",
  authenticate,
  authorize("admin"),
  adminController.assignSuppliers
);

/* -------------------- Tickets -------------------- */
router.get(
  "/tickets",
  authenticate,
  authorize("admin", "manager"),
  adminController.listTickets
);
router.get(
  "/tickets/:id",
  authenticate,
  authorize("admin", "manager"),
  adminController.getTicket
);
router.post(
  "/tickets/:id/reply",
  authenticate,
  authorize("admin", "manager"),
  upload.single("attachment"),
  adminController.replyToTicket
);
router.post(
  "/tickets/:id/close",
  authenticate,
  authorize("admin", "manager"),
  adminController.closeTicket
);

router.delete(
  "/tickets/:id",
  authenticate,
  authorize("admin", "manager"),

  adminController.deleteTicket
);

/* -------------------- Update deadline -------------------- */

router.patch(
  "/buyer-requests/:id/update-deadline",
  authenticate,
  authorize("admin"), // only admin allowed
  adminController.updateBuyerRequestDeadline
);
/* -------------------- Container Tracking -------------------- */
router.get(
  "/containers-with-tracking",
  authenticate,
  authorize("admin", "manager"),
  adminTrackingCtrl.listAllContainersWithTracking
);

router.get(
  "/tracking-code/:code",
  authenticate,
  authorize("admin", "manager"),
  adminTrackingCtrl.findByTrackingCode
);
export default router;
