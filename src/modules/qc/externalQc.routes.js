import express from "express";
import { authenticate } from "../../common/middleware/authenticate.js";
import { authorize } from "../../common/middleware/authorize.js";
import upload from "../../common/middleware/upload.js";
import * as externalQcController from "./externalQc.controller.js";

const router = express.Router();

/* =========================================================
   🌍 External QC
========================================================= */

// ✅ 1. SPECIFIC STRING ROUTES MUST COME FIRST!
router.get(
  "/containers/approved",
  authenticate,
  authorize("qc_external"),
  externalQcController.getApprovedContainers,
);

router.get(
  "/containers/reported",
  authenticate,
  authorize("qc_external"),
  externalQcController.getReportedContainers,
);

// ✅ 2. PARAMETERIZED ROUTES COME AFTER
router.get(
  "/containers/:id",
  authenticate,
  authorize("qc_external"),
  externalQcController.getContainerDetails,
);

router.post(
  "/containers/:id/report",
  authenticate,
  authorize("qc_external"),
  upload.array("attachments", 5),
  externalQcController.submitReport,
);
export default router;
