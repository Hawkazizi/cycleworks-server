import express from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import * as qcController from "../../controllers/QC/qc.controller.js";

const router = express.Router();

/* =======================================================================
   ✅ QC (Internal + External)
======================================================================= */

/* ================= PROFILE ================= */

router.get(
  "/profile",
  authenticate,
  authorize("qc_internal", "qc_external"),
  qcController.getProfile,
);

router.patch(
  "/profile",
  authenticate,
  authorize("qc_internal", "qc_external"),
  qcController.updateProfile,
);

/* ================= FILTERED LISTS (MUST BE FIRST) ================= */

router.get(
  "/containers/arrived",
  authenticate,
  authorize("qc_internal", "qc_external"),
  qcController.getArrivedContainers,
);

router.get(
  "/containers/held",
  authenticate,
  authorize("qc_internal", "qc_external"),
  qcController.getHeldContainers,
);

router.get(
  "/containers/approved",
  authenticate,
  authorize("qc_internal", "qc_external"),
  qcController.getApprovedContainers,
);

/* ================= GENERAL LIST ================= */

router.get(
  "/containers",
  authenticate,
  authorize("qc_internal", "qc_external"),
  qcController.getQcContainers,
);

/* ================= ACTION ROUTES ================= */

router.post(
  "/containers/:id/arrive",
  authenticate,
  authorize("qc_internal", "qc_external"),
  qcController.markArrived,
);

router.post(
  "/containers/:id/start-qc",
  authenticate,
  authorize("qc_internal", "qc_external"),
  qcController.startQcInspection,
);

router.post(
  "/containers/:id/clear",
  authenticate,
  authorize("qc_internal", "qc_external"),
  qcController.clearContainer,
);

router.post(
  "/containers/:id/hold",
  authenticate,
  authorize("qc_internal", "qc_external"),
  qcController.holdContainer,
);

/* ================= SINGLE CONTAINER (LAST) ================= */

router.get(
  "/containers/:id",
  authenticate,
  authorize("qc_internal", "qc_external"),
  qcController.getQcContainerById,
);

export default router;
