import * as qcService from "../../services/QC/qc.service.js";

export const getProfile = async (req, res) => {
  try {
    const profile = await qcService.getProfile({
      userId: req.user.id,
      licenseId: req.user.licenseId,
    });

    // roles are already inside req.user.roles from JWT
    res.json({
      ...profile,
      roles: req.user.roles || [],
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ---------------- UPDATE PROFILE ---------------- */
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email, mobile } = req.body;

    const updated = await qcService.updateProfile(userId, {
      name,
      email,
      mobile,
    });

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ---------------- GET CONTAINERS ---------------- */

export const getQcContainers = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      page = 1,
      limit = 20,
      qc_status,
      container_no,
      supplier_name,
      sort_by,
      sort_direction,
      start_date,
      end_date,
    } = req.query;

    const result = await qcService.getQcContainers({
      userId,
      page: Number(page),
      limit: Number(limit),
      qc_status,
      container_no,
      supplier_name,
      sort_by,
      sort_direction,
      start_date,
      end_date,
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({
      error: err.message || "Failed to load QC containers",
    });
  }
};
/* ---------------- GET SINGLE CONTAINER ---------------- */

export const getQcContainerById = async (req, res) => {
  try {
    const userId = req.user.id;
    const containerId = Number(req.params.id);

    if (!containerId) {
      return res.status(400).json({ error: "Invalid container id" });
    }

    const container = await qcService.getQcContainerById({
      userId,
      containerId,
    });

    res.json(container);
  } catch (err) {
    res.status(404).json({
      error: err.message || "Container not found",
    });
  }
};
export const getArrivedContainers = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, qc_status } = req.query;

    const ALLOWED_STATUSES = ["arrived", "qc_submitted", "approved", "held"];

    const finalStatus = qc_status || "arrived";

    if (!ALLOWED_STATUSES.includes(finalStatus)) {
      return res.status(400).json({
        error: "Invalid qc_status",
      });
    }

    const result = await qcService.getQcContainersByStatus({
      userId,
      qc_status: finalStatus,
      page: Number(page),
      limit: Number(limit),
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getHeldContainers = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const result = await qcService.getQcContainersByStatus({
      userId,
      qc_status: "held",
      page: Number(page),
      limit: Number(limit),
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getApprovedContainers = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const result = await qcService.getQcContainersByStatus({
      userId,
      qc_status: "approved",
      page: Number(page),
      limit: Number(limit),
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ================= MARK ARRIVED ================= */
export const markArrived = async (req, res) => {
  try {
    const { id } = req.params;
    const { arrived_at, arrival_place } = req.body;
    const userId = req.user.id;

    if (!arrived_at || !arrival_place) {
      return res.status(400).json({
        error: "Arrival time and place are required",
      });
    }

    const result = await qcService.markArrived({
      containerId: id,
      arrived_at,
      arrival_place,
      userId,
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
/* ================= QC in progress ================= */

export const startQcInspection = async (req, res) => {
  try {
    const containerId = Number(req.params.id);
    const userId = req.user.id;

    const inspectionData = req.body;

    if (!inspectionData?.actual_carton_count) {
      return res.status(400).json({ error: "Inspection data is required" });
    }

    const result = await qcService.startQcInspection({
      userId,
      containerId,
      inspectionData,
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ================= CLEAR ================= */
export const clearContainer = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await qcService.clearContainer({
      containerId: id,
      userId,
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* ================= HOLD ================= */
export const holdContainer = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, details } = req.body;
    const userId = req.user.id;

    if (!reason) {
      return res.status(400).json({
        error: "Hold reason is required",
      });
    }

    const result = await qcService.holdContainer({
      containerId: id,
      reason,
      details,
      userId,
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
