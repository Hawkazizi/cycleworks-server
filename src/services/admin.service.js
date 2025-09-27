import db from "../db/knex.js";
import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/jwt.js";
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

export const loginWithLicense = async (licenseKey, role) => {
  const license = await db("admin_license_keys")
    .where({ key: licenseKey, is_active: true })
    .first();

  if (!license) throw new Error("Invalid or inactive license key");
  if (!license.assigned_to) throw new Error("License not assigned to any user");

  const roleRow = await db("roles").where("id", license.role_id).first();
  if (!roleRow) throw new Error("Role not found for this license");

  const licenseRole = roleRow.name.toLowerCase(); // "admin" | "manager" | "buyer"

  if (role && licenseRole !== role.toLowerCase()) {
    throw new Error("Role mismatch for this license");
  }

  const user = await db("users")
    .where("id", license.assigned_to)
    .andWhere("status", "active")
    .first();

  if (!user) {
    throw new Error(`No active ${licenseRole} user found for this license`);
  }

  const payload = {
    id: user.id,
    email: user.email || null,
    licenseId: license.id,
    roles: [licenseRole],
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  return {
    token,
    user: { id: user.id, email: user.email },
    roles: [licenseRole],
  };
};

// Get admin/manager profile
export const getAdminProfile = async (userId) => {
  const admin = await db("users")
    .leftJoin("user_roles", "users.id", "user_roles.user_id")
    .leftJoin("roles", "user_roles.role_id", "roles.id")
    .select(
      "users.id as userId",
      "users.name",
      "users.email",
      "users.status",
      "users.created_at",
      "roles.name as role"
    )
    .where("users.id", userId)
    .andWhere("users.status", "active")
    .first();

  if (!admin) {
    throw new Error("Admin/Manager not found");
  }

  const license = await db("admin_license_keys")
    .where("assigned_to", userId)
    .andWhere("is_active", true)
    .first();

  return {
    ...admin,
    licenseId: license?.id || null,
    licenseKey: license?.key || null,
    licenseActive: license?.is_active || false,
    licenseCreatedAt: license?.created_at || null,
  };
};

// Get all users
export const getAllUsers = async () => {
  const users = await db("users")
    .select("id", "name", "email", "status", "created_at")
    .orderBy("id", "asc");

  return users;
};

export const getApplications = async () => {
  const rows = await db("user_applications")
    .join("users", "user_applications.user_id", "users.id")
    .select(
      "user_applications.id",
      "users.name",
      "users.email",
      "user_applications.reason",
      "user_applications.status",
      "user_applications.files",
      "user_applications.created_at"
    )
    .orderBy("user_applications.created_at", "desc");

  return rows.map((row) => ({
    ...row,
    files: (row.files || []).map((f) => ({
      ...f,
      url: `${BASE_URL}${f.path}`, // prepend server URL
    })),
  }));
};

// Approve/Reject application
export const reviewApplication = async (id, status, reviewerId) => {
  if (!["approved", "rejected"].includes(status)) {
    throw new Error("Invalid status");
  }

  // Update application
  const [app] = await db("user_applications")
    .where({ id })
    .update({
      status,
      reviewed_by: reviewerId,
      reviewed_at: db.fn.now(),
    })
    .returning("*");

  if (!app) throw new Error("Application not found");

  // Update user status
  const userStatus = status === "approved" ? "active" : "pending";
  await db("users").where({ id: app.user_id }).update({ status: userStatus });

  return { message: `Application ${status}`, application: app };
};

// Ban/unban users
export const toggleUserStatus = async (targetUserId, action, adminId) => {
  // Prevent admin from banning themselves
  if (targetUserId === adminId) {
    throw new Error("Admins cannot ban themselves");
  }

  // Fetch current user status
  const user = await db("users")
    .select("id", "status", "name", "email", "created_at")
    .where({ id: targetUserId })
    .first();

  if (!user) {
    throw new Error("User not found");
  }

  // Validate requested action
  if (action === "ban" && user.status === "inactive") {
    throw new Error("User is already inactive");
  }
  if (action === "unban" && user.status === "active") {
    throw new Error("User is already active");
  }

  // Update status
  const status = action === "ban" ? "inactive" : "active";
  const updatedUser = await db("users")
    .where({ id: targetUserId })
    .update({ status }, ["id", "name", "email", "status", "created_at"]);

  return updatedUser[0];
};

export const getAllSettings = async () => {
  const settings = await db("settings").select("*");
  return settings;
};

// Update a setting by key (admin-only)
export const updateSetting = async (key, value) => {
  const existing = await db("settings").where({ key }).first();
  if (!existing) {
    throw new Error("Setting not found");
  }
  const [updated] = await db("settings")
    .where({ key })
    .update({ value, updated_at: db.fn.now() })
    .returning("*");
  return updated;
};

// Get all license keys with role + user info
export const getAllLicenseKeys = async () => {
  return await db("admin_license_keys as alk")
    .leftJoin("roles as r", "alk.role_id", "r.id")
    .leftJoin("users as u", "alk.assigned_to", "u.id")
    .select(
      "alk.*",
      "r.name as role_name",
      "u.name as assigned_user_name",
      "u.email as assigned_user_email"
    )
    .orderBy("alk.created_at", "desc");
};

// Create license key
export const createLicenseKey = async ({ key, role_id, assigned_to }) => {
  const [created] = await db("admin_license_keys")
    .insert({ key, role_id, assigned_to })
    .returning("*");
  return created;
};

// Toggle active status
export const toggleLicenseKey = async (id) => {
  const existing = await db("admin_license_keys").where({ id }).first();
  if (!existing) throw new Error("License key not found");

  const [updated] = await db("admin_license_keys")
    .where({ id })
    .update({ is_active: !existing.is_active })
    .returning("*");

  return updated;
};

// Delete license key
export const deleteLicenseKey = async (id) => {
  const deleted = await db("admin_license_keys").where({ id }).del();
  if (!deleted) throw new Error("License key not found");
  return true;
};

// Get all roles
export const getAllRoles = async () => {
  return await db("roles").select("id", "name").orderBy("id", "asc");
};

export const getPackingUnits = async (status = null) => {
  let query = db("packing_units")
    .join("users", "packing_units.user_id", "users.id")
    .select(
      "packing_units.id",
      "packing_units.name",
      "packing_units.address",
      "packing_units.status",
      "packing_units.rejection_reason",
      "packing_units.documents",
      "packing_units.created_at",
      "users.name as farmer_name",
      "users.email as farmer_email"
    )
    .orderBy("packing_units.created_at", "desc");

  // ✅ only filter if status is explicitly provided
  if (status) {
    query = query.where("packing_units.status", status);
  }

  const rows = await query;

  return rows.map((row) => ({
    ...row,
    documents: (row.documents || []).map((doc) => ({
      ...doc,
      url: `${BASE_URL}${doc.path}`,
    })),
  }));
};

export const reviewPackingUnit = async (
  id,
  { status, rejection_reason },
  reviewerId
) => {
  if (!["Approved", "Rejected"].includes(status)) {
    throw new Error("Invalid status: must be Approved or Rejected");
  }

  const unit = await db("packing_units").where({ id }).first();
  if (!unit) throw new Error("Packing unit not found");
  if (unit.status !== "Submitted")
    throw new Error("Packing unit is not in Submitted status");

  const updates = {
    status,
    reviewed_by: reviewerId,
    reviewed_at: db.fn.now(),
  };
  if (status === "Rejected") {
    if (!rejection_reason) throw new Error("Rejection reason required");
    updates.rejection_reason = rejection_reason;
  }

  const [updated] = await db("packing_units")
    .where({ id })
    .update(updates)
    .returning("*");
  return updated;
};

// services/admin.service.js

export const getPermitRequests = async (statusFilter = null) => {
  let query = db("export_permit_requests as epr")
    .join("packing_units as pu", "epr.packing_unit_id", "pu.id")
    .join("users as u", "pu.user_id", "u.id")
    .leftJoin("buyer_requests as br", "epr.buyer_request_id", "br.id")
    .leftJoin("users as bu", "br.buyer_id", "bu.id")
    .select(
      "epr.id",
      "epr.destination_country",
      "epr.max_tonnage",
      "epr.status",
      "epr.rejection_reason",
      "epr.permit_document",
      "epr.issued_at",
      "epr.timeline_start",
      "epr.timeline_end",
      "epr.reviewed_by",
      "epr.created_at",
      "epr.updated_at",
      "pu.name as unit_name",
      "u.name as farmer_name",
      "br.id as buyer_request_id",
      "br.quantity as buyer_quantity",
      "br.import_country",
      "bu.name as buyer_name"
    )
    .orderBy("epr.created_at", "desc");

  if (statusFilter) {
    query = query.where("epr.status", statusFilter);
  }

  return query;
};

// Review export permit request (approve/reject, set tonnage, activate timeline)
export const reviewPermitRequest = async (
  id,
  { status, max_tonnage, permit_document, rejection_reason },
  reviewerId
) => {
  if (!["Approved", "Rejected"].includes(status)) {
    throw new Error("Invalid status: must be Approved or Rejected");
  }

  const permit = await db("export_permit_requests").where({ id }).first();
  if (!permit) {
    throw new Error("Permit request not found");
  }
  if (permit.status !== "Requested") {
    throw new Error("Permit request is not in Requested status");
  }

  let updates = {
    status: status === "Approved" ? "Permit_Issued" : "Rejected",
    reviewed_by: reviewerId,
    updated_at: db.fn.now(),
  };

  if (status === "Approved") {
    if (!max_tonnage || max_tonnage <= 0) {
      throw new Error("Max tonnage must be provided and positive for approval");
    }
    if (!permit_document) {
      throw new Error("Permit document must be provided for approval");
    }
    // Fetch timeline_days from settings
    const timelineSetting = await db("settings")
      .where({ key: "timeline_days" })
      .first();
    const timelineDays = parseInt(timelineSetting?.value || "7", 10);

    updates.max_tonnage = max_tonnage;
    updates.permit_document = permit_document;
    updates.issued_at = db.fn.now();
    updates.timeline_start = db.fn.now();
    updates.timeline_end = db.raw(
      `CURRENT_TIMESTAMP + INTERVAL '${timelineDays} days'`
    );
    updates.status = "Timeline_Active"; // Directly to active after issuance
  } else {
    if (!rejection_reason) {
      throw new Error("Rejection reason required");
    }
    updates.rejection_reason = rejection_reason;
  }

  // Update in transaction for safety
  return db.transaction(async (trx) => {
    const [updatedPermit] = await trx("export_permit_requests")
      .where({ id })
      .update(updates)
      .returning("*");
    return updatedPermit;
  });
};
// services/admin.service.js
export const getWeeklyLoadingPlans = async (statusFilter = null) => {
  let query = db("weekly_loading_plans as wlp")
    .join(
      "export_permit_requests as epr",
      "wlp.export_permit_request_id",
      "epr.id"
    )
    .join("packing_units as pu", "epr.packing_unit_id", "pu.id")
    .join("users as u", "pu.user_id", "u.id")
    .select(
      "wlp.id",
      "wlp.week_start_date",
      "wlp.status",
      "wlp.submitted_at",
      "wlp.updated_at",
      "wlp.reviewed_at",
      "wlp.reviewed_by",
      "wlp.rejection_reason",
      "epr.id as permit_id",
      "epr.destination_country",
      "pu.name as unit_name",
      "u.name as farmer_name"
    )
    .orderBy("wlp.submitted_at", "desc");

  if (statusFilter) {
    query = query.where("wlp.status", statusFilter);
  }

  return query;
};

// Review a weekly loading plan (approve/reject with global tonnage check)
export const reviewWeeklyLoadingPlan = async (
  id,
  { status, rejection_reason },
  reviewerId
) => {
  if (!["Approved", "Rejected"].includes(status)) {
    throw new Error("Invalid status: must be Approved or Rejected");
  }

  const plan = await db("weekly_loading_plans").where({ id }).first();
  if (!plan) {
    throw new Error("Weekly loading plan not found");
  }
  if (plan.status !== "Submitted") {
    throw new Error("Plan is not in Submitted status");
  }

  const permit = await db("export_permit_requests")
    .where({ id: plan.export_permit_request_id })
    .first();
  if (!permit || permit.status !== "Timeline_Active") {
    throw new Error("Associated permit is not active");
  }

  let updates = {
    status,
    reviewed_by: reviewerId,
    reviewed_at: db.fn.now(),
    updated_at: db.fn.now(),
    rejection_reason: null,
  };

  if (status === "Rejected") {
    if (!rejection_reason) {
      throw new Error("Rejection reason required");
    }
    updates.rejection_reason = rejection_reason;
  } else {
    // Check global weekly tonnage limit
    const weekStartDate = plan.week_start_date;

    const totalTonnageThisWeek = await db("loading_plan_details as lpd")
      .join(
        "weekly_loading_plans as wlp",
        "lpd.weekly_loading_plan_id",
        "wlp.id"
      )
      .where("wlp.week_start_date", weekStartDate)
      .where("wlp.status", "Approved") // Only count approved
      .sum("lpd.amount_tonnage as total")
      .first();

    const currentPlanTonnage = await db("loading_plan_details")
      .where({ weekly_loading_plan_id: id })
      .sum("amount_tonnage as total")
      .first();

    const weeklyLimitSetting = await db("settings")
      .where({ key: "weekly_tonnage_limit" })
      .first();
    const weeklyLimit = parseFloat(weeklyLimitSetting?.value || "1000.0");

    const totalProposedTonnage =
      parseFloat(totalTonnageThisWeek.total || 0) +
      parseFloat(currentPlanTonnage.total || 0);

    if (totalProposedTonnage > weeklyLimit) {
      throw new Error(
        `Total tonnage (${totalProposedTonnage.toFixed(
          2
        )}) exceeds global weekly limit (${weeklyLimit.toFixed(2)})`
      );
    }

    // Check permit-specific tonnage limit
    const planTonnage = parseFloat(currentPlanTonnage.total || 0);
    if (planTonnage > permit.max_tonnage) {
      throw new Error(
        `Plan tonnage (${planTonnage.toFixed(
          2
        )}) exceeds permit limit (${permit.max_tonnage.toFixed(2)})`
      );
    }
  }

  // Update in transaction
  return db.transaction(async (trx) => {
    const [updatedPlan] = await trx("weekly_loading_plans")
      .where({ id })
      .update(updates)
      .returning("*");
    return updatedPlan;
  });
};

// Get QC submissions (queue)
export const getQcQueue = async (status = null) => {
  let query = db("qc_pre_productions as qc")
    .join("weekly_loading_plans as wlp", "qc.weekly_loading_plan_id", "wlp.id")
    .join(
      "export_permit_requests as epr",
      "wlp.export_permit_request_id",
      "epr.id"
    )
    .join("packing_units as pu", "epr.packing_unit_id", "pu.id")
    .join("users as u", "pu.user_id", "u.id")
    .select(
      "qc.id",
      "qc.submitted_at",
      "qc.status",
      "qc.rejection_reason",
      "qc.carton_label",
      "qc.egg_image",
      "wlp.id as weekly_plan_id",
      "epr.id as permit_id",
      "pu.name as unit_name",
      "u.name as farmer_name"
    )
    .orderBy("qc.submitted_at", "desc");

  if (status) {
    query = query.where("qc.status", status);
  }

  return query;
};
// Review QC submission (approve/reject)
export const reviewQcPre = async (
  id,
  { status, rejection_reason },
  reviewerId
) => {
  if (!["Approved", "Rejected"].includes(status)) {
    throw new Error("Invalid status: must be Approved or Rejected");
  }

  const qc = await db("qc_pre_productions").where({ id }).first();
  if (!qc) throw new Error("QC record not found");

  const updates = {
    status,
    reviewed_by: reviewerId,
    reviewed_at: db.fn.now(),
    rejection_reason: null,
  };

  if (status === "Rejected") {
    if (!rejection_reason) throw new Error("Rejection reason required");
    updates.rejection_reason = rejection_reason;
  }

  const [updated] = await db("qc_pre_productions")
    .where({ id })
    .update(updates)
    .returning("*");

  return updated;
};

// ---- Export Documents workflow

export const getExportDocs = async () => {
  return db("export_documents as ed")
    .join(
      "export_permit_requests as epr",
      "ed.export_permit_request_id",
      "epr.id"
    )
    .join("packing_units as pu", "epr.packing_unit_id", "pu.id")
    .join("users as u", "pu.user_id", "u.id") // farmer
    .select(
      "ed.id",
      "ed.status",
      "ed.submitted_at",
      "ed.packing_list",
      "ed.invoice",
      "ed.veterinary_certificate",
      "epr.id as permit_id",
      "pu.name as unit_name",
      "u.name as farmer_name"
    )
    .orderBy("ed.submitted_at", "desc");
};

// services/adminExportDocs.service.js
export async function reviewExportDoc(
  id,
  { status, rejection_reason, reviewerId }
) {
  if (!["Approved", "Rejected"].includes(status)) {
    throw new Error("Invalid status");
  }

  const [updated] = await db("export_documents")
    .where({ id })
    .update({
      status,
      rejection_reason: status === "Rejected" ? rejection_reason : null,
      reviewed_by: reviewerId,
      reviewed_at: db.fn.now(),
    })
    .returning("*");

  return updated;
}

// ---- Final Documents review/closure
export const getFinalDocs = async (status = null) => {
  let query = db("final_documents")
    .join(
      "export_permit_requests",
      "final_documents.export_permit_request_id",
      "export_permit_requests.id"
    )
    .join(
      "packing_units",
      "export_permit_requests.packing_unit_id",
      "packing_units.id"
    )
    .join("users", "packing_units.user_id", "users.id")
    .select(
      "final_documents.id",
      "final_documents.status",
      "final_documents.submitted_at",
      "final_documents.reviewed_at",
      "final_documents.closed_at",
      "export_permit_requests.id as permit_id",
      "packing_units.name as unit_name",
      "users.name as farmer_name"
    )
    .orderBy("final_documents.submitted_at", "desc");

  if (status) {
    query = query.where("final_documents.status", status);
  }

  return query;
};

export const reviewFinalDocs = async (
  id,
  { status, rejection_reason },
  reviewerId
) => {
  if (!["Approved", "Rejected"].includes(status)) {
    throw new Error("Invalid status: must be Approved or Rejected");
  }
  const fd = await db("final_documents").where({ id }).first();
  if (!fd) throw new Error("Final documents not found");

  const updates = {
    status,
    reviewed_by: reviewerId,
    reviewed_at: db.fn.now(),
  };
  if (status === "Rejected") {
    if (!rejection_reason) throw new Error("Rejection reason required");
    updates.rejection_reason = rejection_reason;
  } else if (status === "Approved") {
    updates.closed_at = db.fn.now();
  }

  const [updated] = await db("final_documents")
    .where({ id })
    .update(updates)
    .returning("*");
  return updated;
};
