import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";

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

router.patch(
  "/users/:id/status",
  authenticate,
  authorize("admin"),
  adminController.banOrUnbanUser
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
  adminController.reviewPermitRequest
);

// QC pre‑production queue + review (admin/manager)
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

export default router;
