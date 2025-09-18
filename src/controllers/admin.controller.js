import * as adminService from "../services/admin.service.js";

// Admin/Manager login
export const loginWithLicense = async (req, res) => {
  try {
    const { licenseKey, role } = req.body;
    if (!licenseKey) {
      return res.status(400).json({ error: "licenseKey is required" });
    }

    const token = await adminService.loginWithLicense(licenseKey, role);
    res.json({ token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get profile (admin or manager)
export const getProfile = async (req, res) => {
  try {
    const adminUserId = req.user.id;
    const admin = await adminService.getAdminProfile(adminUserId);
    res.json({ admin });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
};

//get all users
export const listUsers = async (req, res) => {
  try {
    const users = await adminService.getAllUsers();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get pending applications (for admins)
export const getApplications = async (req, res) => {
  try {
    const apps = await adminService.getApplications();
    res.json(apps);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch applications" });
  }
};

// Approve or reject application
export const reviewApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Use the logged-in user as reviewer
    const reviewerId = req.user.id;

    const result = await adminService.reviewApplication(id, status, reviewerId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

//ban / unban

export const banOrUnbanUser = async (req, res) => {
  try {
    const { id } = req.params; // target user id
    const { action } = req.body; // "ban" or "unban"
    const adminId = req.user.id; // logged-in admin from JWT
    const updatedUser = await adminService.toggleUserStatus(
      Number(id),
      action,
      adminId
    );

    res.json({ user: updatedUser });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get all settings
export const getSettings = async (req, res) => {
  try {
    const settings = await adminService.getAllSettings();
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update a setting
export const updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const updated = await adminService.updateSetting(key, value);
    res.json({ setting: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get permit requests
export const getPermitRequests = async (req, res) => {
  try {
    const { status } = req.query; // Optional filter, default 'Requested'
    const requests = await adminService.getPermitRequests(
      status || "Requested"
    );
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Review permit request
export const reviewPermitRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, max_tonnage, permit_document, rejection_reason } = req.body;
    const reviewerId = req.user.id;
    const updated = await adminService.reviewPermitRequest(
      id,
      { status, max_tonnage, permit_document, rejection_reason },
      reviewerId
    );
    res.json({ permit: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export async function getWeeklyPlans(req, res) {
  try {
    // optional query param ?status=Submitted|Approved|Rejected
    const statusFilter = req.query.status || "Submitted";
    const plans = await adminService.getWeeklyLoadingPlans(statusFilter);
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function reviewWeeklyPlan(req, res) {
  try {
    const { id } = req.params;
    const { decision, remarks } = req.body; // decision: "Approved" | "Rejected"

    const updated = await adminService.reviewWeeklyLoadingPlan(
      id,
      {
        status: decision,
        rejection_reason: decision === "Rejected" ? remarks : null,
      },
      req.user.id
    );

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export const getPackingUnits = async (req, res) => {
  try {
    const { status } = req.query;
    const units = await adminService.getPackingUnits(status || "Submitted");
    res.json({ units });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const reviewPackingUnit = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejection_reason } = req.body;
    const reviewerId = req.user.id;
    const updated = await adminService.reviewPackingUnit(
      id,
      { status, rejection_reason },
      reviewerId
    );
    res.json({ packing_unit: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getWeeklyLoadingPlans = async (req, res) => {
  try {
    const { status } = req.query; // Optional filter, default 'Submitted'
    const plans = await adminService.getWeeklyLoadingPlans(
      status || "Submitted"
    );
    res.json({ plans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Review weekly loading plan
export const reviewWeeklyLoadingPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejection_reason } = req.body;
    const reviewerId = req.user.id;
    const updated = await adminService.reviewWeeklyLoadingPlan(
      id,
      { status, rejection_reason },
      reviewerId
    );
    res.json({ plan: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getQcPreProductions = async (req, res) => {
  try {
    const { status } = req.query;
    const items = await adminService.getQcQueue(status || "Submitted");
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const reviewQcPreProduction = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejection_reason } = req.body;
    const reviewerId = req.user.id;
    const updated = await adminService.reviewQcPre(
      id,
      { status, rejection_reason },
      reviewerId
    );
    res.json({ qc: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Export docs flow
export const listExportDocs = async (req, res) => {
  try {
    const { status } = req.query;
    const items = await adminService.getExportDocs(status || "Submitted");
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const sendDocsToSales = async (req, res) => {
  try {
    const { id } = req.params;
    const reviewerId = req.user.id;
    const updated = await adminService.sendExportDocsToSales(id, reviewerId);
    res.json({ export_docs: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const recordImportPermitDoc = async (req, res) => {
  try {
    const { id } = req.params;
    const { import_permit_document } = req.body;
    const reviewerId = req.user.id;
    const updated = await adminService.recordImportPermit(
      id,
      import_permit_document,
      reviewerId
    );
    res.json({ export_docs: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const forwardToCustoms = async (req, res) => {
  try {
    const { id } = req.params;
    const reviewerId = req.user.id;
    const updated = await adminService.forwardDocsToCustoms(id, reviewerId);
    res.json({ export_docs: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Final docs
export const listFinalDocs = async (req, res) => {
  try {
    const { status } = req.query;
    const items = await adminService.getFinalDocs(status || "Submitted");
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const reviewFinalDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejection_reason } = req.body;
    const reviewerId = req.user.id;
    const updated = await adminService.reviewFinalDocs(
      id,
      { status, rejection_reason },
      reviewerId
    );
    res.json({ final_docs: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
