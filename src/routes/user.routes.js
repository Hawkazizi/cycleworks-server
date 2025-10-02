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
/* -------------------- Reqs -------------------- */

// Buyer Request Plans
router
  .route("/buyer-requests/:requestId/plans")
  .post(authenticate, authorize("user"), userController.createPlan)
  .get(authenticate, authorize("user"), userController.listPlans);

// Plan Containers (list containers of a plan)
router.get(
  "/plans/:planId/containers",
  authenticate,
  authorize("user"),
  userController.listContainers
);

// Container Files (upload & list)
router
  .route("/containers/:containerId/files")
  .post(
    authenticate,
    authorize("user"),
    upload.single("file"),
    userController.uploadFile
  )
  .get(authenticate, authorize("user"), userController.listFiles);

// Farmer Requests
router.get(
  "/farmer/requests",
  authenticate,
  authorize("user"),
  userController.listFarmerRequests
);

router.get(
  "/farmer/requests/:id",
  authenticate,
  authorize("user"),
  userController.getFarmerRequest
);

export default router;
