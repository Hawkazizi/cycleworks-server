// routes/user.routes.js
import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import upload from "../middleware/upload.js";

const router = Router();

/* -------------------- Auth -------------------- */
router.post(
  "/register",
  upload.fields([
    { name: "biosecurity", maxCount: 1 },
    { name: "vaccination", maxCount: 1 },
    { name: "emergency", maxCount: 1 },
    { name: "foodSafety", maxCount: 1 },
    { name: "description", maxCount: 1 },
    { name: "farmBiosecurity", maxCount: 1 },
  ]),
  userController.register
);
router.post("/login", userController.login);
router.get(
  "/profile",
  authenticate,
  authorize("user"),
  userController.getProfile
);
router.patch(
  "/profile",
  authenticate,
  authorize("user"),
  userController.updateProfile
);
router.delete(
  "/profile",
  authenticate,
  authorize("user"),
  userController.deleteProfile
);

/* -------------------- email verification flow -------------------- */
router.post(
  "/profile/email/request",
  authenticate,
  userController.requestEmailVerification
);
router.post("/profile/email/verify", authenticate, userController.verifyEmail);

/* -------------------- Change Password -------------------- */
router.post(
  "/profile/change-password",
  authenticate,
  userController.changePassword
);

// Plans
router.post(
  "/buyer-requests/:requestId/plans",
  authenticate,
  authorize("user"),
  userController.createPlan
);
router.get(
  "/buyer-requests/:requestId/plans",
  authenticate,
  authorize("user"),
  userController.listPlans
);

// File upload for a container
router.post(
  "/containers/:containerId/files",
  authenticate,
  authorize("user"),
  upload.single("file"),
  userController.uploadFile
);
router.get(
  "/farmer/requests",
  authenticate,
  authorize("user"),
  userController.listFarmerRequests
);

// Farmer → get single buyer request (with plans, containers, files)
router.get(
  "/farmer/requests/:id",
  authenticate,
  authorize("user"),
  userController.getFarmerRequest
);
export default router;
