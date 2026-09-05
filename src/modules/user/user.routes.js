import { Router } from "express";
import * as userController from "./user.controller.js";
import { authenticate } from "../../common/middleware/authenticate.js";
import { authorize } from "../../common/middleware/authorize.js";
import upload from "../../common/middleware/upload.js";
import { authLimiter, refreshLimiter } from "../../common/middleware/rateLimit.js";

const router = Router();

/* =======================================================================
   🔐 AUTHENTICATION
======================================================================= */

// ✅ NEW: Endpoint for uploading a single file during signup
router.post("/upload", upload.single("file"), userController.uploadSingleFile);

// ✅ UPDATED: Removed multer middleware since files are already uploaded individually as JSON
router.post("/register", authLimiter, userController.register);

router.post("/verify-registration", authLimiter, userController.verifyRegistration);

router.post("/login", authLimiter, userController.login);

router.post("/refresh-token", refreshLimiter, userController.refreshToken);

router.post("/logout", userController.logout);

router.post(
  "/forgot-password/send-code",
  authLimiter,
  userController.sendForgotPasswordCodeController,
);

router.post("/forgot-password/reset", authLimiter, userController.resetPasswordController);

/* =======================================================================
   👤 PROFILE MANAGEMENT
======================================================================= */

router.get(
  "/profile",
  authenticate,
  authorize("user"),
  userController.getProfile,
);

router.patch(
  "/profile",
  authenticate,
  authorize("user"),
  userController.updateProfile,
);

router.post(
  "/profile/picture",
  authenticate,
  authorize("user"),
  upload.single("picture"),
  userController.uploadProfilePicture,
);
router.get(
  "/profile/picture",
  authenticate,
  authorize("user"),
  userController.getProfilePicture,
);

router.delete(
  "/profile",
  authenticate,
  authorize("user"),
  userController.deleteProfile,
);

/* =======================================================================
   📧 EMAIL & PASSWORD MANAGEMENT
======================================================================= */

router.post(
  "/profile/email/request",
  authenticate,
  userController.requestEmailVerification,
);

router.post("/profile/email/verify", authenticate, userController.verifyEmail);

router.post(
  "/profile/change-password",
  authenticate,
  userController.changePassword,
);

/* =======================================================================
   📦 CONTAINERS (SUPPLIER FOCUS)
======================================================================= */

router.get(
  "/containers/:id",
  authenticate,
  authorize("user"),
  userController.getContainerDetails,
);

router.get(
  "/containers/:id/plan-date",
  authenticate,
  authorize("user", "manager", "admin"),
  userController.getPlanDate,
);
router.patch(
  "/containers/:id/plan-date",
  authenticate,
  authorize("user", "manager", "admin"),
  userController.updatePlanDate,
);

router.get(
  "/assigned-containers",
  authenticate,
  authorize("user"),
  userController.listAssignedContainers,
);

router
  .route("/containers/:containerId/files")
  .post(
    authenticate,
    authorize("user"),
    upload.single("file"),
    userController.uploadFile,
  )
  .get(authenticate, authorize("user"), userController.listFiles);

router.patch(
  "/containers/:id/status",
  authenticate,
  authorize("user"),
  userController.updateContainerStatusController,
);

router
  .route("/containers/:id/metadata")
  .get(
    authenticate,
    authorize("user", "admin", "manager", "qc_internal"),
    userController.getContainerMetadata,
  )
  .patch(
    authenticate,
    authorize("user", "manager", "admin", "qc_internal"),
    userController.updateContainerMetadataController,
  );

/* =======================================================================
   🚚 CONTAINER TRACKING
======================================================================= */

router
  .route("/containers/:id/tracking")
  .get(authenticate, authorize("user"), userController.listContainerTracking)
  .post(authenticate, authorize("user"), userController.addContainerTracking);

export default router;
