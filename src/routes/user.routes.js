import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
const router = Router();

// User registration
router.post("/register", userController.register);

// User login
router.post("/login", userController.login);

router.get(
  "/profile",
  authenticate,
  authorize("user"),
  userController.getProfile
);

// Get all my export permit requests
router.get(
  "/permit-requests",
  authenticate,
  authorize("user"),
  userController.getMyPermitRequests
);

// Get single export permit request
router.get(
  "/permit-requests/:id",
  authenticate,
  authorize("user"),
  userController.getMyPermitRequestById
);

router.post(
  "/permit-requests",
  authenticate,
  authorize("user"),
  userController.requestExportPermit
);
// Register a packing unit
router.post(
  "/packing-units",
  authenticate,
  authorize("user"),
  userController.registerPackingUnit
);

// Get my packing units
router.get(
  "/packing-units",
  authenticate,
  authorize("user"),
  userController.getMyPackingUnits
);
// Weekly plans
router.get(
  "/weekly-plans",
  authenticate,
  authorize("user"),
  userController.getMyWeeklyPlans
);
router.get(
  "/weekly-plans/:id",
  authenticate,
  authorize("user"),
  userController.getMyWeeklyPlanById
);
// Submit weekly loading plan
router.post(
  "/weekly-plans",
  authenticate,
  authorize("user"),
  userController.submitWeeklyLoadingPlan
);

// QC submissions
router.get(
  "/qc-pre",
  authenticate,
  authorize("user"),
  userController.getMyQcSubmissions
);
// QC pre‑production submission
router.post(
  "/qc-pre",
  authenticate,
  authorize("user"),
  userController.submitQcPre
);

// Export documents
router.get(
  "/export-docs",
  authenticate,
  authorize("user"),
  userController.getMyExportDocs
);
// Export documents submission
router.post(
  "/export-docs",
  authenticate,
  authorize("user"),
  userController.submitExportDocs
);

// Final documents
router.get(
  "/final-docs",
  authenticate,
  authorize("user"),
  userController.getMyFinalDocs
);
// Final documents submission
router.post(
  "/final-docs",
  authenticate,
  authorize("user"),
  userController.submitFinalDocs
);

export default router;
