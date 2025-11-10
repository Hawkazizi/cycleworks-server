import db from "../db/knex.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/jwt.js";
import { NotificationService } from "./notification.service.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

/* =======================================================================
   🔐 AUTHENTICATION
======================================================================= */

/**
 * Login using admin/manager license key.
 * @param {string} licenseKey - License key string
 * @param {"admin"|"manager"} role - Optional expected role
 */
export const loginWithLicense = async (licenseKey, role) => {
  const license = await db("admin_license_keys")
    .where({ key: licenseKey, is_active: true })
    .first();

  if (!license) throw new Error("Invalid or inactive license key");
  if (!license.assigned_to) throw new Error("License not assigned to any user");

  const roleRow = await db("roles").where("id", license.role_id).first();
  if (!roleRow) throw new Error("Role not found for this license");

  const licenseRole = roleRow.name.toLowerCase();
  if (role && licenseRole !== role.toLowerCase())
    throw new Error("Role mismatch for this license");

  const user = await db("users")
    .where({ id: license.assigned_to, status: "active" })
    .first();

  if (!user)
    throw new Error(`No active ${licenseRole} user found for this license`);

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

/* =======================================================================
   👤 PROFILE MANAGEMENT
======================================================================= */

export const getAdminProfile = async (userId) => {
  const admin = await db("users")
    .leftJoin("user_roles", "users.id", "user_roles.user_id")
    .leftJoin("roles", "user_roles.role_id", "roles.id")
    .select(
      "users.id as userId",
      "users.name",
      "users.email",
      "users.mobile",
      "users.status",
      "users.created_at",
      "roles.name as role",
    )
    .where({ "users.id": userId, "users.status": "active" })
    .first();

  if (!admin) throw new Error("Admin/Manager not found");

  const license = await db("admin_license_keys")
    .where({ assigned_to: userId, is_active: true })
    .first();

  return {
    ...admin,
    licenseId: license?.id || null,
    licenseKey: license?.key || null,
    licenseActive: license?.is_active || false,
    licenseCreatedAt: license?.created_at || null,
  };
};

export const updateAdminProfile = async (userId, data) => {
  const { email, mobile, name } = data;

  // Uniqueness checks
  if (email) {
    const existingEmail = await db("users")
      .where({ email })
      .andWhereNot("id", userId)
      .first();
    if (existingEmail)
      throw new Error("این ایمیل قبلاً توسط کاربر دیگری استفاده شده است.");
  }

  if (mobile) {
    const existingMobile = await db("users")
      .where({ mobile })
      .andWhereNot("id", userId)
      .first();
    if (existingMobile)
      throw new Error(
        "این شماره موبایل قبلاً توسط کاربر دیگری استفاده شده است.",
      );
  }

  const [updated] = await db("users")
    .where({ id: userId })
    .update(
      {
        ...(name && { name }),
        ...(email && { email }),
        ...(mobile && { mobile }),
        updated_at: db.fn.now(),
      },
      ["id", "name", "email", "mobile", "status", "created_at", "updated_at"],
    );

  if (!updated) throw new Error("Profile update failed");
  return updated;
};

/* =======================================================================
   👥 USER MANAGEMENT
======================================================================= */

export const createUserWithRole = async ({
  name,
  email,
  password,
  role_id,
}) => {
  return db.transaction(async (trx) => {
    const exists = await trx("users").where({ email }).first();
    if (exists) throw new Error("ایمیل قبلاً استفاده شده است.");

    const password_hash = await bcrypt.hash(password, 10);

    const [user] = await trx("users")
      .insert({ name, email, password_hash, status: "active" })
      .returning(["id", "name", "email", "status", "created_at"]);

    if (role_id) {
      await trx("user_roles").insert({ user_id: user.id, role_id });
    }

    return user;
  });
};

export const getAllUsers = async () => {
  return db("users as u")
    .leftJoin("user_roles as ur", "u.id", "ur.user_id")
    .leftJoin("roles as r", "ur.role_id", "r.id")
    .leftJoin("farmer_plan_containers as c", "c.supplier_id", "u.id")
    .groupBy("u.id", "r.name")
    .select(
      "u.id",
      "u.name",
      "u.email",
      "u.status",
      "u.created_at",
      "r.name as role_name",
      db.raw("COUNT(c.id) AS containers_count"),
    )
    .orderBy("u.id", "asc");
};

export const toggleUserStatus = async (targetUserId, action, adminId) => {
  if (targetUserId === adminId) throw new Error("Admins cannot ban themselves");

  const user = await db("users")
    .select("id", "status", "name", "email", "created_at")
    .where({ id: targetUserId })
    .first();

  if (!user) throw new Error("User not found");

  if (action === "ban" && user.status === "inactive")
    throw new Error("User is already inactive");
  if (action === "unban" && user.status === "active")
    throw new Error("User is already active");

  const newStatus = action === "ban" ? "inactive" : "active";
  const [updated] = await db("users")
    .where({ id: targetUserId })
    .update({ status: newStatus })
    .returning(["id", "name", "email", "status", "created_at"]);

  return updated;
};

export const deleteUser = async (userId) => {
  return db.transaction(async (trx) => {
    await trx("user_roles").where({ user_id: userId }).del();
    await trx("user_applications").where({ user_id: userId }).del();
    await trx("admin_license_keys")
      .where({ assigned_to: userId })
      .update({ assigned_to: null });

    const deleted = await trx("users").where({ id: userId }).del();
    if (!deleted) throw new Error("User not found");
    return true;
  });
};

/* =======================================================================
   🧾 APPLICATIONS
======================================================================= */

/** 🗂️ Get all user applications (with attached files and review info) */
export const getApplications = async () => {
  const rows = await baseApplicationQuery();
  return rows.map(enrichApplicationFiles);
};

/** 🧍 Get applications belonging to a single user */
export const getApplicationsByUser = async (userId) => {
  const rows = await baseApplicationQuery().where(
    "user_applications.user_id",
    userId,
  );
  return rows.map(enrichApplicationFiles);
};

/** 🔧 Update application (by admin or user) */
export const updateApplication = async (id, updates, userId, role) => {
  const existing = await db("user_applications").where({ id }).first();
  if (!existing) throw new Error("Application not found");

  const userEditable = [
    "reason",
    "supplier_name",
    "biosecurity",
    "vaccination",
    "emergency",
    "food_safety",
    "description",
    "farm_biosecurity",
  ];

  const adminEditable = [
    "status",
    "reviewed_by",
    "reviewed_at",
    "notes",
    "admin_comment",
    "final_approved",
    "final_admin_comment",
  ];

  let allowed = [];
  if (["admin", "manager"].includes(role))
    allowed = [...userEditable, ...adminEditable];
  else if (["user", "farmer"].includes(role)) allowed = [...userEditable];

  const updateData = Object.fromEntries(
    Object.entries(updates).filter(([key]) => allowed.includes(key)),
  );

  if (!Object.keys(updateData).length)
    throw new Error("No valid fields to update");

  // Phase 1: Status approval
  if (updateData.status && ["admin", "manager"].includes(role)) {
    const userStatus = updateData.status === "approved" ? "active" : "pending";
    await db("users")
      .where({ id: existing.user_id })
      .update({ status: userStatus });
  }

  // Phase 2: Final review
  if ("final_approved" in updates && ["admin", "manager"].includes(role)) {
    updateData.final_reviewed_by = userId;
    updateData.final_reviewed_at = db.fn.now();

    const message = updates.final_approved
      ? "Your application has been fully approved."
      : "Your application requires further changes.";

    try {
      await NotificationService.create({
        user_id: existing.user_id,
        title: "Final Application Review",
        message,
      });
    } catch (err) {
      console.warn("Notification failed:", err.message);
    }
  }

  const [updated] = await db("user_applications")
    .where({ id })
    .update(
      {
        ...updateData,
        ...(role !== "user"
          ? { reviewed_by: userId, reviewed_at: db.fn.now() }
          : {}),
      },
      "*",
    );

  return { message: "Application updated", application: updated };
};

/* -------------------- Internal: Base Application Query -------------------- */
function baseApplicationQuery() {
  return db("user_applications")
    .join("users", "user_applications.user_id", "users.id")
    .leftJoin(
      "users as reviewer",
      "user_applications.reviewed_by",
      "reviewer.id",
    )
    .leftJoin(
      "users as final_reviewer",
      "user_applications.final_reviewed_by",
      "final_reviewer.id",
    )
    .select(
      "user_applications.*",
      "users.name",
      "users.email",
      "users.mobile",
      "users.status as user_status",
      db.raw("reviewer.name as reviewed_by_name"),
      db.raw("final_reviewer.name as final_reviewed_by_name"),
    )
    .orderBy("user_applications.created_at", "desc");
}

function enrichApplicationFiles(row) {
  const fileFields = [
    "biosecurity",
    "vaccination",
    "emergency",
    "food_safety",
    "description",
    "farm_biosecurity",
  ];
  const files = {};
  for (const field of fileFields) {
    if (row[field]) {
      try {
        const parsed =
          typeof row[field] === "string" ? JSON.parse(row[field]) : row[field];
        files[field] = {
          ...parsed,
          url: parsed?.path
            ? `${BASE_URL}${parsed.path.startsWith("/") ? parsed.path : `/${parsed.path}`}`
            : null,
        };
      } catch {
        files[field] = null;
      }
    } else files[field] = null;
  }
  return { ...row, files };
}

/* =======================================================================
   ⚙️ SETTINGS
======================================================================= */

export const getAllSettings = async () => db("settings").select("*");

export const updateSetting = async (key, value) => {
  const existing = await db("settings").where({ key }).first();
  if (!existing) throw new Error("Setting not found");

  const [updated] = await db("settings")
    .where({ key })
    .update({ value, updated_at: db.fn.now() })
    .returning("*");

  return updated;
};

/* =======================================================================
   🪪 LICENSE KEYS
======================================================================= */

export const getAllLicenseKeys = async () => {
  return db("admin_license_keys as alk")
    .leftJoin("roles as r", "alk.role_id", "r.id")
    .leftJoin("users as u", "alk.assigned_to", "u.id")
    .select(
      "alk.*",
      "r.name as role_name",
      "u.name as assigned_user_name",
      "u.email as assigned_user_email",
    )
    .orderBy("alk.created_at", "desc");
};

export const createLicenseKey = async ({ key, role_id, assigned_to, user }) => {
  let userId = assigned_to;

  // Auto-create user if not provided
  if (user?.name) {
    const random = Math.floor(Math.random() * 1000000);
    const fakeEmail = `admin_${random}@system.local`;
    const fakeMobile = `09${random}`.padEnd(11, "0");
    const fakePassword = crypto.randomBytes(8).toString("hex");
    const passwordHash = await bcrypt.hash(fakePassword, 10);

    const [newUser] = await db("users")
      .insert({
        name: user.name,
        email: fakeEmail,
        mobile: fakeMobile,
        password_hash: passwordHash,
        status: "active",
      })
      .returning("*");

    userId = newUser.id;
    await db("user_roles").where({ user_id: userId }).del();
    await db("user_roles").insert({ user_id: userId, role_id });
  }

  const [created] = await db("admin_license_keys")
    .insert({ key, role_id, assigned_to: userId })
    .returning("*");

  return created;
};

export const updateLicenseKey = async ({ id, key, role_id, assigned_to }) => {
  const [updated] = await db("admin_license_keys")
    .where({ id })
    .update({ key, role_id, assigned_to })
    .returning("*");

  if (!updated) throw new Error("License key not found");

  if (assigned_to && role_id) {
    await db("user_roles").where({ user_id: assigned_to }).del();
    await db("user_roles").insert({ user_id: assigned_to, role_id });
  }

  return updated;
};

export const toggleLicenseKey = async (id) => {
  const existing = await db("admin_license_keys").where({ id }).first();
  if (!existing) throw new Error("License key not found");

  const [updated] = await db("admin_license_keys")
    .where({ id })
    .update({ is_active: !existing.is_active })
    .returning("*");

  return updated;
};

export const deleteLicenseKey = async (id) => {
  const deleted = await db("admin_license_keys").where({ id }).del();
  if (!deleted) throw new Error("License key not found");
  return true;
};

/* =======================================================================
   🧱 ROLES
======================================================================= */

export const getAllRoles = async () => {
  return db("roles").select("id", "name").orderBy("id", "asc");
};

/* =======================================================================
   🏁 REQUEST COMPLETION TOGGLE
======================================================================= */

export async function toggleRequestCompletion(requestId, adminId) {
  const existing = await db("buyer_requests").where({ id: requestId }).first();
  if (!existing) throw new Error("Buyer request not found");

  const newStatus = !existing.is_completed;

  await db("buyer_requests")
    .where({ id: requestId })
    .update({
      is_completed: newStatus,
      completed_at: newStatus ? db.fn.now() : null,
      updated_at: db.fn.now(),
    });

  await NotificationService.create(
    existing.buyer_id,
    "buyer_request_toggle_completion",
    existing.id,
    JSON.stringify({
      title: newStatus
        ? "درخواست شما خاتمه یافت"
        : "درخواست شما از حالت خاتمه یافته خارج شد",
      message: newStatus
        ? "درخواست شما با موفقیت خاتمه یافته است."
        : "درخواست شما مجدداً فعال شده است.",
      is_completed: newStatus,
    }),
  );

  return {
    success: true,
    message: newStatus
      ? "Request marked as completed."
      : "Request marked as active again.",
    is_completed: newStatus,
    completed_at: newStatus ? new Date().toISOString() : null,
  };
}

/* -------------------- Toggle In Progress -------------------- */
export async function toggleInProgress(containerId, adminId) {
  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();
  if (!container) throw new Error("Container not found");

  const newState = !container.in_progress;

  await db("farmer_plan_containers").where({ id: containerId }).update({
    in_progress: newState,
    updated_at: db.fn.now(),
  });

  return {
    message: `Container progress ${newState ? "started" : "stopped"}`,
    in_progress: newState,
  };
}

/* -------------------- ADMIN: Mark Container as Completed -------------------- */
export async function markContainerCompleted(containerId, adminId) {
  if (!containerId) throw new Error("Container ID is required");

  // Fetch container with fields we need for notification
  const container = await db("farmer_plan_containers")
    .select(
      "id",
      "container_no",
      "status",
      "is_completed",
      "supplier_id",
      "buyer_request_id",
    )
    .where({ id: containerId })
    .first();

  if (!container) throw new Error("Container not found");
  if (container.is_completed) {
    return { message: "Container is already marked as completed" };
  }

  await db.transaction(async (trx) => {
    // Core updates
    await trx("farmer_plan_containers").where({ id: containerId }).update({
      is_completed: true,
      in_progress: false,
      status: "completed",
      updated_at: trx.fn.now(),
      completed_at: trx.fn.now(),
      admin_metadata_reviewed_by: adminId,
      admin_metadata_reviewed_at: trx.fn.now(),
    });

    // Tracking entry: delivered
    await trx("container_tracking_statuses").insert({
      container_id: containerId,
      status: "delivered",
      note: "کانتینر به مقصد تحویل داده شد",
      created_by: adminId || null,
      created_at: trx.fn.now(),
    });

    // Notification to supplier (farmer) — use existing service signature
    if (container.supplier_id) {
      await NotificationService.create(
        container.supplier_id, // userId (NUMBER) ✅
        "container_tracking_update", // type (already supported) ✅
        container.buyer_request_id || null, // relatedId (request id) ✅
        {
          status: "delivered",
          containerId: container.id,
          containerNo: container.container_no,
        },
        trx, // pass the KNEX trx ✅
      );
    }
  });

  return {
    message:
      "کانتینر با موفقیت تکمیل شد و وضعیت 'در مقصد' ثبت گردید و اعلان ارسال شد ✅",
  };
}
