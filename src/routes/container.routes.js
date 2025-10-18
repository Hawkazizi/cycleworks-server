import express from "express";
import * as trackingCtrl from "../controllers/containerTracking.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";

const router = express.Router();

/* -------------------- USER & ADMIN -------------------- */
router.post(
  "/:id/tracking",
  authenticate,
  authorize("user", "admin"),
  trackingCtrl.addTracking,
);

router.get(
  "/:id/tracking",
  authenticate,
  authorize("user", "admin", "manager"),
  trackingCtrl.listTracking,
);

router.get(
  "/my-containers-with-tracking",
  authenticate,
  authorize("user", "manager"),
  trackingCtrl.myContainersWithTracking,
);

export default router;
