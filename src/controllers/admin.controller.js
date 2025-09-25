import fs from "fs";
import path from "path";
import * as adminService from "../services/admin.service.js";
import * as adminBuyerService from "../services/adminBuyer.service.js";
import db from "../db/knex.js";
// Admin/Manager login
export const loginWithLicense = async (req, res) => {
  try {
    const { licenseKey, role } = req.body;
    if (!licenseKey) {
      return res.status(400).json({ error: "licenseKey is required" });
    }

    const { token, user, roles } = await adminService.loginWithLicense(
      licenseKey,
      role
    );

    res.json({ token, roles, user });
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

// get user by id for all

export async function getUserById(req, res) {
  try {
    const { id } = req.params;
    const user = await db("users")
      .select("id", "name", "email", "status")
      .where({ id })
      .first();

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Get pending applications (for admins)
export const getApplications = async (req, res) => {
  try {
    const apps = await adminService.getApplications();
    res.json(apps);
  } catch (err) {
    console.error("❌ getApplications error:", err);
    res.status(500).json({ error: err.message });
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

// List all license keys
export const getLicenseKeys = async (req, res) => {
  try {
    const keys = await adminService.getAllLicenseKeys();
    res.json({ keys });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create new license key
export const createLicenseKey = async (req, res) => {
  try {
    const { key, role_id, assigned_to } = req.body;
    const newKey = await adminService.createLicenseKey({
      key,
      role_id,
      assigned_to,
    });
    res.status(201).json({ key: newKey });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Toggle active/inactive
export const toggleLicenseKey = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await adminService.toggleLicenseKey(id);
    res.json({ key: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete license key
export const deleteLicenseKey = async (req, res) => {
  try {
    const { id } = req.params;
    await adminService.deleteLicenseKey(id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}; // List all roles
export const getRoles = async (req, res) => {
  try {
    const roles = await adminService.getAllRoles();
    res.json({ roles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getPackingUnits = async (req, res) => {
  try {
    const { status } = req.query; // optional
    const units = await adminService.getPackingUnits(status || null);
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

// Get permit requests
export const getPermitRequests = async (req, res) => {
  try {
    const { status } = req.query; // Optional filter
    const requests = await adminService.getPermitRequests(status || null);
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
export const reviewPermitRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, max_tonnage, rejection_reason } = req.body;
    const reviewerId = req.user.id;

    let permitDocumentPath = null;

    // If file uploaded, move it to final dir
    if (req.file) {
      const permitDir = path.join("uploads", "permits", String(id));
      fs.mkdirSync(permitDir, { recursive: true });
      const newPath = path.join(permitDir, req.file.filename);
      fs.renameSync(req.file.path, newPath);
      permitDocumentPath = "/" + newPath.replace(/\\/g, "/");
    }

    const updated = await adminService.reviewPermitRequest(
      id,
      {
        status,
        max_tonnage,
        permit_document: permitDocumentPath, // will be null if not provided
        rejection_reason,
      },
      reviewerId
    );

    res.json({ permit: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// controllers/admin.controller.js
export async function getWeeklyPlans(req, res) {
  try {
    const { status } = req.query; // optional
    const plans = await adminService.getWeeklyLoadingPlans(status || null);
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

// List QC pre-production submissions
export const getQcPreProductions = async (req, res) => {
  try {
    const { status } = req.query;
    const items = await adminService.getQcQueue(status || null);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// Review QC pre-production
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
    const items = await adminService.getFinalDocs(status || null);
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

/// buyer part

export async function getBuyerRequests(req, res) {
  const requests = await adminBuyerService.getBuyerRequests();
  res.json(requests);
}
export async function getBuyerRequestById(req, res) {
  try {
    const { id } = req.params;
    const request = await adminBuyerService.getBuyerRequestById(id);

    if (!request) {
      return res.status(404).json({ error: "Buyer request not found" });
    }

    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function reviewBuyerRequest(req, res) {
  try {
    const updated = await adminBuyerService.reviewBuyerRequest(req.params.id, {
      status: req.body.status,
      reviewerId: req.user.licenseId,
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
export async function getAllOffers(req, res) {
  try {
    const offers = await adminBuyerService.getAllOffers();
    res.json(offers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
// controllers/admin.controller.js
export async function getOffersForRequest(req, res) {
  try {
    const offerId = req.params.id;
    const offers = await adminBuyerService.getOffersForRequest(offerId);

    if (!offers || offers.length === 0) {
      return res.status(404).json({ error: "Offer not found" });
    }

    res.json(offers[0]); // since now it’s a single offer by ID
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function reviewOffer(req, res) {
  try {
    const updated = await adminBuyerService.reviewOffer(req.params.offerId, {
      status: req.body.status,
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
