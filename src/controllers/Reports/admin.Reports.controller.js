import * as ReportsService from "../../services/Reports/Reports.service.js";

/* =========================================================
   GET FULL QC REPORT FOR A CONTAINER
========================================================= */

export const getContainerQcReport = async (req, res) => {
  try {
    const containerId = Number(req.params.containerId);

    if (!containerId) {
      return res.status(400).json({ error: "Invalid container id" });
    }

    const report = await ReportsService.getContainerQcReport(containerId);

    res.json(report);
  } catch (err) {
    res.status(404).json({
      error: err.message || "QC report not found",
    });
  }
};
