import { Router } from "express";
import * as userController from "./user.controller.js";
import { authenticate } from "../../common/middleware/authenticate.js";
import { authorize } from "../../common/middleware/authorize.js";
import upload from "../../common/middleware/upload.js";

const router = Router();

/* =======================================================================
   🔐 AUTHENTICATION
======================================================================= */

// 🧾 Register new farmer (with required application files)
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
  userController.register,
);

// 🔑 Login
router.post("/login", userController.login);

/* =======================================================================
   👤 PROFILE MANAGEMENT
======================================================================= */

// 📄 Get profile
router.get(
  "/profile",
  authenticate,
  authorize("user"),
  userController.getProfile,
);

// ✏️ Update profile
router.patch(
  "/profile",
  authenticate,
  authorize("user"),
  userController.updateProfile,
);

// 🖼️ Profile picture upload & fetch
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

// 🧹 Delete profile
router.delete(
  "/profile",
  authenticate,
  authorize("user"),
  userController.deleteProfile,
);

/* =======================================================================
   📧 EMAIL & PASSWORD MANAGEMENT
======================================================================= */

// Request email verification code
router.post(
  "/profile/email/request",
  authenticate,
  userController.requestEmailVerification,
);

// Verify email
router.post("/profile/email/verify", authenticate, userController.verifyEmail);

// Change password
router.post(
  "/profile/change-password",
  authenticate,
  userController.changePassword,
);

/* =======================================================================
   📦 CONTAINERS (SUPPLIER FOCUS)
======================================================================= */

// 📦 Get single container details (for farmer)
router.get(
  "/containers/:id",
  authenticate,
  authorize("user"),
  userController.getContainerDetails,
);
// ✅ New route — Get selected plan date
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
// List assigned containers for supplier
router.get(
  "/assigned-containers",
  authenticate,
  authorize("user"),
  userController.listAssignedContainers,
);

// Upload & list container files
router
  .route("/containers/:containerId/files")
  .post(
    authenticate,
    authorize("user"),
    upload.single("file"),
    userController.uploadFile,
  )
  .get(authenticate, authorize("user"), userController.listFiles);

// Update container status
router.patch(
  "/containers/:id/status",
  authenticate,
  authorize("user"),
  userController.updateContainerStatusController,
);

// Container metadata (GET + PATCH)
router
  .route("/containers/:id/metadata")
  .get(
    authenticate,
    authorize("user", "admin", "manager"),
    userController.getContainerMetadata,
  )
  .patch(
    authenticate,
    authorize("user", "manager", "admin"),
    userController.updateContainerMetadataController,
  );

/* =======================================================================
   🚚 CONTAINER TRACKING
======================================================================= */

// Add or list container tracking records
router
  .route("/containers/:id/tracking")
  .get(authenticate, authorize("user"), userController.listContainerTracking)
  .post(authenticate, authorize("user"), userController.addContainerTracking);

export default router;
