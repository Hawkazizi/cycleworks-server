import db from "../db/knex.js";
import jwt from "jsonwebtoken";

// Admin Login
export const loginWithLicense = async (licenseKey) => {
  // Find active license and its assigned user
  const license = await db("admin_license_keys")
    .where({ key: licenseKey, is_active: true })
    .first();

  if (!license) {
    throw new Error("Invalid or inactive license key");
  }

  if (!license.assigned_to) {
    throw new Error("License not assigned to any user");
  }

  // Fetch the admin user linked to this license and verify role
  const adminUser = await db("users")
    .join("user_roles", "users.id", "user_roles.user_id")
    .join("roles", "user_roles.role_id", "roles.id")
    .where("users.id", license.assigned_to)
    .andWhere("users.status", "active")
    .andWhere("roles.name", "admin")
    .select("users.id", "users.email")
    .first();

  if (!adminUser) {
    throw new Error("No active admin user found for this license");
  }

  // Generate JWT
  const token = jwt.sign(
    {
      role: "admin",
      id: adminUser.id,
      licenseId: license.id,
    },
    process.env.JWT_SECRET || "secret",
    { expiresIn: "1d" }
  );

  return token;
};

// Get admin profile
export const getAdminProfile = async (userId) => {
  // Fetch user info + role
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
    .andWhere("roles.name", "admin")
    .first();

  if (!admin) {
    throw new Error("Admin not found");
  }

  // Fetch the license assigned to this user
  const license = await db("admin_license_keys")
    .where("assigned_to", userId)
    .andWhere("is_active", true)
    .first();

  // Merge license info into admin profile
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

// Get all user applications
export const getApplications = async () => {
  return db("user_applications")
    .join("users", "user_applications.user_id", "users.id")
    .select(
      "user_applications.id",
      "users.name",
      "users.email",
      "user_applications.reason",
      "user_applications.status",
      "user_applications.created_at"
    )
    .orderBy("user_applications.created_at", "desc");
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

// Get all pending export permit requests (for manager/admin)
export const getPermitRequests = async (statusFilter = "Requested") => {
  return db("export_permit_requests")
    .join(
      "packing_units",
      "export_permit_requests.packing_unit_id",
      "packing_units.id"
    )
    .join("users", "packing_units.user_id", "users.id")
    .select(
      "export_permit_requests.id",
      "export_permit_requests.destination_country",
      "export_permit_requests.status",
      "export_permit_requests.created_at",
      "packing_units.name as unit_name",
      "users.name as farmer_name"
    )
    .where("export_permit_requests.status", statusFilter)
    .orderBy("export_permit_requests.created_at", "desc");
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

export const getWeeklyLoadingPlans = async (statusFilter = "Submitted") => {
  return db("weekly_loading_plans")
    .join(
      "export_permit_requests",
      "weekly_loading_plans.export_permit_request_id",
      "export_permit_requests.id"
    )
    .join(
      "packing_units",
      "export_permit_requests.packing_unit_id",
      "packing_units.id"
    )
    .join("users", "packing_units.user_id", "users.id")
    .select(
      "weekly_loading_plans.id",
      "weekly_loading_plans.week_start_date",
      "weekly_loading_plans.status",
      "weekly_loading_plans.submitted_at",
      "export_permit_requests.id as permit_id",
      "packing_units.name as unit_name",
      "users.name as farmer_name"
    )
    .where("weekly_loading_plans.status", statusFilter)
    .orderBy("weekly_loading_plans.submitted_at", "desc");
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
    updated_at: db.fn.now(),
  };

  if (status === "Rejected") {
    if (!rejection_reason) {
      throw new Error("Rejection reason required");
    }
    updates.rejection_reason = rejection_reason;
  } else {
    // Check global weekly tonnage limit
    const weekStartDate = plan.week_start_date;
    const totalTonnageThisWeek = await db("loading_plan_details")
      .join(
        "weekly_loading_plans",
        "loading_plan_details.weekly_loading_plan_id",
        "weekly_loading_plans.id"
      )
      .where("weekly_loading_plans.week_start_date", weekStartDate)
      .where("weekly_loading_plans.status", "Approved") // Only count approved plans
      .sum("loading_plan_details.amount_tonnage as total")
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

export const getQcQueue = async (status = "Submitted") => {
  return db("qc_pre_productions")
    .join(
      "export_permit_requests",
      "qc_pre_productions.export_permit_request_id",
      "export_permit_requests.id"
    )
    .join(
      "packing_units",
      "export_permit_requests.packing_unit_id",
      "packing_units.id"
    )
    .join("users", "packing_units.user_id", "users.id")
    .select(
      "qc_pre_productions.id",
      "qc_pre_productions.submitted_at",
      "qc_pre_productions.status",
      "export_permit_requests.id as permit_id",
      "packing_units.name as unit_name",
      "users.name as farmer_name"
    )
    .where("qc_pre_productions.status", status)
    .orderBy("qc_pre_productions.submitted_at", "desc");
};

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
export const getExportDocs = async (status = "Submitted") => {
  return db("export_documents")
    .join(
      "export_permit_requests",
      "export_documents.export_permit_request_id",
      "export_permit_requests.id"
    )
    .join(
      "packing_units",
      "export_permit_requests.packing_unit_id",
      "packing_units.id"
    )
    .join("users", "packing_units.user_id", "users.id")
    .select(
      "export_documents.id",
      "export_documents.status",
      "export_documents.submitted_at",
      "export_documents.sent_to_sales_at",
      "export_documents.forwarded_to_customs_at",
      "export_documents.import_permit_document",
      "export_permit_requests.id as permit_id",
      "packing_units.name as unit_name",
      "users.name as farmer_name"
    )
    .where("export_documents.status", status)
    .orderBy("export_documents.submitted_at", "desc");
};

export const sendExportDocsToSales = async (id, reviewerId) => {
  const doc = await db("export_documents").where({ id }).first();
  if (!doc) throw new Error("Export documents not found");
  const [updated] = await db("export_documents")
    .where({ id })
    .update({
      status: "Sent_To_Sales",
      sent_to_sales_at: db.fn.now(),
      reviewed_by: reviewerId,
    })
    .returning("*");
  return updated;
};

export const recordImportPermit = async (
  id,
  import_permit_document,
  reviewerId
) => {
  if (!import_permit_document)
    throw new Error("import_permit_document required");
  const doc = await db("export_documents").where({ id }).first();
  if (!doc) throw new Error("Export documents not found");
  const [updated] = await db("export_documents")
    .where({ id })
    .update({
      status: "Import_Permit_Received",
      import_permit_document,
      reviewed_by: reviewerId,
    })
    .returning("*");
  return updated;
};

export const forwardDocsToCustoms = async (id, reviewerId) => {
  const doc = await db("export_documents").where({ id }).first();
  if (!doc) throw new Error("Export documents not found");
  const [updated] = await db("export_documents")
    .where({ id })
    .update({
      status: "Forwarded_To_Customs",
      forwarded_to_customs_at: db.fn.now(),
      reviewed_by: reviewerId,
    })
    .returning("*");
  return updated;
};

// ---- Final Documents review/closure
export const getFinalDocs = async (status = "Submitted") => {
  return db("final_documents")
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
    .where("final_documents.status", status)
    .orderBy("final_documents.submitted_at", "desc");
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
