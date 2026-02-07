import express from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import * as externalQcController from "../../controllers/QC/externalQc.controller.js";

const router = express.Router();

/* =========================================================
   🌍 External QC
========================================================= */

router.get(
  "/containers/approved",
  authenticate,
  authorize("qc_external"),
  externalQcController.getApprovedContainers,
);

router.post(
  "/containers/:id/report",
  authenticate,
  authorize("qc_external"),
  externalQcController.submitReport,
);

/* ================= REPORTED CONTAINERS ================= */

router.get(
  "/containers/reported",
  authenticate,
  authorize("qc_external"),
  externalQcController.getReportedContainers,
);

export default router;
