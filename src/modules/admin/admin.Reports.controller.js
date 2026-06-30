// controllers/Reports/admin.Reports.controller.js
import * as ReportsService from "./Reports.service.js";

export const getContainerQcReport = async (req, res) => {
  try {
    const containerId = Number(req.params.containerId);

    if (!containerId) {
      return res.status(400).json({ error: req.t("validation.invalid_id") });
    }

    const report = await ReportsService.getContainerQcReport(containerId);
    res.json(report);
  } catch (err) {
    res.status(404).json({
      error: err.message || req.t("report.qc_not_found"),
    });
  }
};
