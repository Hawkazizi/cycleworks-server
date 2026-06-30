// controllers/QC/externalQc.controller.js
import * as externalQcService from "./externalQc.service.js";

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

    const result = await externalQcService.submitExternalQcReport({
      userId,
      containerId,
      actual_quantity,
      quality_condition,
      packaging_condition,
      discrepancies,
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
