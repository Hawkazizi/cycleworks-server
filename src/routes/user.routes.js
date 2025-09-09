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
// Submit weekly loading plan
router.post(
  "/weekly-plans",
  authenticate,
  authorize("user"),
  userController.submitWeeklyLoadingPlan
);

// QC pre‑production submission
router.post(
  "/qc-pre",
  authenticate,
  authorize("user"),
  userController.submitQcPre
);

// Export documents submission
router.post(
  "/export-docs",
  authenticate,
  authorize("user"),
  userController.submitExportDocs
);

// Final documents submission
router.post(
  "/final-docs",
  authenticate,
  authorize("user"),
  userController.submitFinalDocs
);

export default router;
