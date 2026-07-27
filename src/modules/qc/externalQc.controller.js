// controllers/QC/externalQc.controller.js
import * as externalQcService from "./externalQc.service.js";
import fs from "fs"; // ✅ Added
import path from "path"; // ✅ Added
import upload from "../../common/middleware/upload.js";
export const getApprovedContainers = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const result = await externalQcService.getApprovedContainersForExternalQc({
      userId,
      page: Number(page),
      limit: Number(limit),
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const submitReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const containerId = Number(req.params.id);

    const {
      actual_quantity,
      quality_condition,
      packaging_condition,
      discrepancies,
    } = req.body;

    if (!actual_quantity) {
      return res.status(400).json({
        error: req.t("validation.quantity_required"),
      });
    }

    // ✅ Handle File Uploads
    let attachments = [];
    if (req.files && req.files.length > 0) {
      const uploadDir = path.join(
        process.cwd(),
        "uploads",
        "external_qc_reports",
        String(containerId),
      );
      fs.mkdirSync(uploadDir, { recursive: true });

      attachments = req.files.map((file) => {
        const uniqueName = `${Date.now()}-${file.originalname}`;
        const newPath = path.join(uploadDir, uniqueName);
        fs.renameSync(file.path, newPath);

        // Extract clean web path (e.g., /uploads/external_qc_reports/123/1690000000-file.png)
        const match = newPath.match(/\/uploads\/.*/);
        return match
          ? match[0].replace(/\\/g, "/")
          : `/uploads/external_qc_reports/${containerId}/${uniqueName}`.replace(
              /\\/g,
              "/",
            );
      });
    }

    const result = await externalQcService.submitExternalQcReport({
      userId,
      containerId,
      actual_quantity,
      quality_condition,
      packaging_condition,
      discrepancies,
      attachments, // ✅ Pass to service
    });

    res.json({
      message: req.t("qc.report_submitted"),
      ...result,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getReportedContainers = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const result = await externalQcService.getExternalQcReportedContainers({
      userId,
      page: Number(page),
      limit: Number(limit),
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ================= GET SINGLE CONTAINER DETAILS (NEW) ================= */
export const getContainerDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const containerId = Number(req.params.id);

    if (!containerId) {
      return res.status(400).json({ error: req.t("validation.invalid_id") });
    }

    const container = await externalQcService.getExternalQcContainerById({
      userId,
      containerId,
    });

    res.json(container);
  } catch (err) {
    res.status(404).json({
      error: err.message || req.t("container.not_found"),
    });
  }
};
