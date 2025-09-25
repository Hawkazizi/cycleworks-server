import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import upload from "../middleware/upload.js";
const router = Router();

//admin login
router.post("/login", adminController.loginWithLicense);

// admin profile
router.get(
  "/profile",
  authenticate,
  authorize("admin"),
  adminController.getProfile
);

//get all users

router.get(
  "/users",
  authenticate,
  authorize("admin"),
  adminController.listUsers
);
router.patch(
  "/users/:id/status",
  authenticate,
  authorize("admin"),
  adminController.banOrUnbanUser
);

//get user by id for all users
router.get(
  "/users/:id",
  authenticate,
  authorize("admin", "manager", "buyer", "user"),
  adminController.getUserById
);

// Protected admin routes
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

// routes/adminRoutes.js
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

// Roles management
router.get(
  "/roles",
  authenticate,
  authorize("admin"),
  adminController.getRoles
);

// Packing units management
router.get(
  "/packing-units",
  authenticate,
  authorize("admin", "manager"),
  adminController.getPackingUnits
);

router.post(
  "/packing-units/:id/review",
  authenticate,
  authorize("admin", "manager"),
  adminController.reviewPackingUnit
);

// Export permit requests (admin/manager)
router.get(
  "/permit-requests",
  authenticate,
  authorize("admin", "manager"),
  adminController.getPermitRequests
);

router.post(
  "/permit-requests/:id/review",
  authenticate,
  authorize("admin", "manager"),
  upload.single("permit_document"),
  adminController.reviewPermitRequest
);
// 🆕 Weekly plans management (admin/manager)
router.get(
  "/weekly-plans",
  authenticate,
  authorize("admin", "manager"),
  adminController.getWeeklyPlans
);

router.post(
  "/weekly-plans/:id/review",
  authenticate,
  authorize("admin", "manager"),
  adminController.reviewWeeklyPlan
);
// QC pre-production queue + review (admin/manager)
router.get(
  "/qc-pre",
  authenticate,
  authorize("admin", "manager"),
  adminController.getQcPreProductions
);

router.post(
  "/qc-pre/:id/review",
  authenticate,
  authorize("admin", "manager"),
  adminController.reviewQcPreProduction
);

// Export docs workflow (admin/manager)
router.get(
  "/export-docs",
  authenticate,
  authorize("admin", "manager"),
  adminController.listExportDocs
);

router.post(
  "/export-docs/:id/send-to-sales",
  authenticate,
  authorize("admin", "manager"),
  adminController.sendDocsToSales
);

router.post(
  "/export-docs/:id/import-permit",
  authenticate,
  authorize("admin", "manager"),
  adminController.recordImportPermitDoc
);

router.post(
  "/export-docs/:id/forward-to-customs",
  authenticate,
  authorize("admin", "manager"),
  adminController.forwardToCustoms
);

// Final docs review & closure (admin/manager)
router.get(
  "/final-docs",
  authenticate,
  authorize("admin", "manager"),
  adminController.listFinalDocs
);

router.post(
  "/final-docs/:id/review",
  authenticate,
  authorize("admin", "manager"),
  adminController.reviewFinalDocuments
);

// 🛒 Buyer Requests & Offers (Admin/Manager only)

// --- Requests ---
router.get(
  "/buyer-requests",
  authenticate,
  authorize("admin", "manager"),
  adminController.getBuyerRequests
);

router.post(
  "/buyer-requests/:id/review",
  authenticate,
  authorize("admin", "manager"),
  adminController.reviewBuyerRequest
);

// --- Offers ---
// ⚠️ Put these BEFORE ":id" so Express doesn't misinterpret "offers" as an ID
router.get(
  "/buyer-requests/offers",
  authenticate,
  authorize("admin", "manager"),
  adminController.getAllOffers
);

router.post(
  "/buyer-requests/offers/:offerId/review",
  authenticate,
  authorize("admin", "manager"),
  adminController.reviewOffer
);

router.get(
  "/buyer-requests/:id/offers",
  authenticate,
  authorize("admin", "manager"),
  adminController.getOffersForRequest
);

// --- Single Request ---
router.get(
  "/buyer-requests/:id",
  authenticate,
  authorize("admin", "manager"),
  adminController.getBuyerRequestById
);

export default router;
