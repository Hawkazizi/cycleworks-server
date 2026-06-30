import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate.js";
import { authorize } from "../../common/middleware/authorize.js";
import upload from "../../common/middleware/upload.js";
import * as superAdminController from "./superAdmin.controller.js";

// ✅ NEW: tickets controller
import * as superAdminTicketsController from "./superadminTickets.controller.js";

const router = Router();

/* ===========================
   AUTH (public)
=========================== */
router.post("/login", superAdminController.login);

/* ===========================
   PROTECTED (super_admin only)
=========================== */
router.use(authenticate);
router.use(authorize("super_admin"));

router.get("/me", superAdminController.me);

/* =======================================================================
   🧩 DASHBOARD (Super Admin)
======================================================================= */
router.get("/dashboard", superAdminController.getAdminDashboard);

/* =======================================================================
   🖥️ SERVER SPECS (Super Admin)
======================================================================= */
router.get("/server-specs", superAdminController.getServerSpecs);

/* =======================================================================
   🧩 ROLES & SETTINGS (Super Admin)
======================================================================= */
router.get("/roles", superAdminController.getRoles);

router.get("/settings", superAdminController.getSettings);
router.patch("/settings/:key", superAdminController.updateSetting);

/* =======================================================================
   👥 USER MANAGEMENT (Super Admin)
======================================================================= */
router.post("/users", superAdminController.createUser);
router.get("/users", superAdminController.listUsers);
router.get("/users/:id", superAdminController.getUserById);
router.get("/users/:id/picture", superAdminController.getUserProfilePicture);
router.patch("/users/:id/status", superAdminController.banOrUnbanUser);
router.delete("/users/:id", superAdminController.deleteUser);

/* =======================================================================
   🔑 LICENSE KEYS (Super Admin)
======================================================================= */
router.get("/license-keys", superAdminController.getLicenseKeys);
router.post("/license-keys", superAdminController.createLicenseKey);
router.patch("/license-keys/:id", superAdminController.updateLicenseKey);
router.patch("/license-keys/:id/toggle", superAdminController.toggleLicenseKey);
router.delete("/license-keys/:id", superAdminController.deleteLicenseKey);

/* =======================================================================
   📋 APPLICATIONS (Super Admin)
======================================================================= */

// list all applications
router.get("/applications", superAdminController.getApplications);

// applications for a user
router.get(
  "/applications/user/:userId",
  superAdminController.getApplicationsByUser,
);

// update application (with file uploads)
router.patch(
  "/applications/:id",
  upload.fields([
    { name: "biosecurity", maxCount: 1 },
    { name: "vaccination", maxCount: 1 },
    { name: "emergency", maxCount: 1 },
    { name: "food_safety", maxCount: 1 },
    { name: "description", maxCount: 1 },
    { name: "farm_biosecurity", maxCount: 1 },
  ]),
  superAdminController.updateApplication,
);

// approve / reject application
router.post("/applications/:id/review", superAdminController.reviewApplication);

// final review (phase 2)
router.patch(
  "/applications/:id/final-review",
  superAdminController.finalizeApplicationReview,
);

/* =======================================================================
   🎫 TICKETS (Super Admin)  ✅ NEW
   Goal:
   - List all users that have tickets/messages
   - Click user -> list all tickets related to that user (all roles)
   - Click ticket -> full thread
======================================================================= */

/**
 * GET /superadmin/tickets/users?q=&page=&pageSize=
 * Users that have any ticket activity
 */
router.get(
  "/tickets/users",
  superAdminTicketsController.superAdminListTicketUsers,
);

/**
 * GET /superadmin/tickets/users/:userId/tickets?status=&q=&page=&pageSize=
 * All tickets related to a user across: user_id, created_by, assigned_to, recipients, replies
 */
router.get(
  "/tickets/users/:userId/tickets",
  superAdminTicketsController.superAdminListUserTickets,
);

/**
 * GET /superadmin/tickets/:ticketId/thread
 * Full thread: { ticket, replies, recipients }
 */
router.get(
  "/tickets/:ticketId/thread",
  superAdminTicketsController.superAdminGetTicketThread,
);

/* =======================================================================
   📋 Buyer Requests
======================================================================= */
router.get("/buyer-requests", superAdminController.listBuyerRequests);
router.post("/buyer-requests", superAdminController.createBuyerRequest);
router.get("/buyer-requests/:id", superAdminController.getBuyerRequest);
router.patch("/buyer-requests/:id", superAdminController.updateBuyerRequest);
router.delete("/buyer-requests/:id", superAdminController.deleteBuyerRequest);

/* Buyer Request -> Containers */
router.get(
  "/buyer-requests/:id/containers",
  superAdminController.listBuyerRequestContainers,
);
router.post(
  "/buyer-requests/:id/containers",
  superAdminController.createContainerForRequest,
);

/* =======================================================================
   📦 Containers (global list + single)
======================================================================= */
router.get("/containers", superAdminController.listContainers);
router.get("/containers/:id", superAdminController.getContainer);
router.patch("/containers/:id", superAdminController.updateContainer);
router.delete("/containers/:id", superAdminController.deleteContainer);

/* Container actions */
router.post("/containers/:id/transfer", superAdminController.transferContainer);
router.post(
  "/containers/:id/change-supplier",
  superAdminController.changeContainerSupplier,
);

/* =======================================================================
   🚚 Tracking statuses (container_tracking_statuses)
======================================================================= */
router.get(
  "/containers/:id/tracking-statuses",
  superAdminController.listContainerTrackingStatuses,
);
router.post(
  "/containers/:id/tracking-statuses",
  superAdminController.createContainerTrackingStatus,
);
router.patch(
  "/tracking-statuses/:id",
  superAdminController.updateContainerTrackingStatus,
);
router.delete(
  "/tracking-statuses/:id",
  superAdminController.deleteContainerTrackingStatus,
);

/* =======================================================================
   🧪 External QC report (external_qc_reports)
======================================================================= */
router.patch(
  "/containers/:id/external-qc",
  superAdminController.upsertExternalQcReport,
);
router.delete(
  "/containers/:id/external-qc",
  superAdminController.deleteExternalQcReport,
);

/* =======================================================================
   🧯 Hold resolutions (internal_qc_hold_resolutions)
======================================================================= */
router.post(
  "/containers/:id/hold-resolutions",
  superAdminController.createHoldResolution,
);
router.delete(
  "/hold-resolutions/:id",
  superAdminController.deleteHoldResolution,
);

/* =======================================================================
   📎 Files (farmer_plan_files)
======================================================================= */
router.patch("/files/:id", superAdminController.updatePlanFile);
router.delete("/files/:id", superAdminController.deletePlanFile);

export default router;
