import express from "express";
import * as trackingCtrl from "./containerTracking.controller.js";
import { authenticate } from "../../common/middleware/authenticate.js";
import { authorize } from "../../common/middleware/authorize.js";

const router = express.Router();

/* =======================================================================
   🚚 CONTAINER TRACKING
======================================================================= */

// ➕ Add a new tracking update for a container
router.post(
  "/:id/tracking",
  authenticate,
  authorize("user", "admin", "manager"),
  trackingCtrl.addTracking,
);

// 📜 List all tracking records for a container
router.get(
  "/:id/tracking",
  authenticate,
  authorize("user", "admin", "manager"),
  trackingCtrl.listTracking,
);

/* =======================================================================
   📦 CONTAINER OVERVIEWS
======================================================================= */

// 🧾 Get all containers (for current user / manager / admin) with tracking
router.get(
  "/my-containers-with-tracking",
  authenticate,
  authorize("user", "manager", "admin"),
  trackingCtrl.myContainersWithTracking,
);

/* =======================================================================
   🆔 TY NUMBER MANAGEMENT
======================================================================= */

// ✏️ Update TY (tracking code) number for a container
router.patch(
  "/:id/ty-number",
  authenticate,
  authorize("user", "admin", "manager"),
  trackingCtrl.updateTyNumber,
);

/* =======================================================================
   conainer workflow
======================================================================= */

router.get(
  "/:id/workflow",
  authenticate,
  authorize("user", "admin", "manager"),
  trackingCtrl.getContainerWorkflow,
);
export default router;
