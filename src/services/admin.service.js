import db from "../db/knex.js";
import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/jwt.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { NotificationService } from "./notification.service.js";
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

/* -------------------- Auth -------------------- */
export const loginWithLicense = async (licenseKey, role) => {
  const license = await db("admin_license_keys")
    .where({ key: licenseKey, is_active: true })
    .first();

  if (!license) throw new Error("Invalid or inactive license key");
  if (!license.assigned_to) throw new Error("License not assigned to any user");

  const roleRow = await db("roles").where("id", license.role_id).first();
  if (!roleRow) throw new Error("Role not found for this license");

  const licenseRole = roleRow.name.toLowerCase(); // "admin" | "manager"

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

/* -------------------- Profile -------------------- */
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

export const updateAdminProfile = async (userId, data) => {
  // 🧩 Extract fields
  const { email, mobile, name } = data;

  // 🛑 Check for duplicate email
  if (email) {
    const existingEmail = await db("users")
      .where("email", email)
      .andWhereNot("id", userId)
      .first();

    if (existingEmail) {
      throw new Error("این ایمیل قبلاً توسط کاربر دیگری استفاده شده است.");
    }
  }

  // 🛑 Optional: also check duplicate mobile (if needed)
  if (mobile) {
    const existingMobile = await db("users")
      .where("mobile", mobile)
      .andWhereNot("id", userId)
      .first();

    if (existingMobile) {
      throw new Error(
        "این شماره موبایل قبلاً توسط کاربر دیگری استفاده شده است.",
      );
    }
  }

  // ✅ Proceed to update safely
  const [updated] = await db("users")
    .where("id", userId)
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

/* -------------------- Users -------------------- */
export const createUserWithRole = async ({
  name,
  email,
  password,
  role_id,
}) => {
  return db.transaction(async (trx) => {
    // check if email already exists
    const exists = await trx("users").where({ email }).first();
    if (exists) throw new Error("ایمیل قبلاً استفاده شده است.");

    // hash password
    const password_hash = await bcrypt.hash(password, 10);

    // create user
    const [user] = await trx("users")
      .insert({
        name,
        email,
        password_hash,
        status: "active",
      })
      .returning(["id", "name", "email", "status", "created_at"]);

    // assign role
    if (role_id) {
      await trx("user_roles").insert({
        user_id: user.id,
        role_id,
      });
    }

    return user;
  });
};
export const getAllUsers = async () => {
  return db("users as u")
    .leftJoin("user_roles as ur", "u.id", "ur.user_id")
    .leftJoin("roles as r", "ur.role_id", "r.id")
    .leftJoin("farmer_plans as fp", "fp.farmer_id", "u.id") // 👈 Link user → farmer plans
    .leftJoin("farmer_plan_containers as c", "c.plan_id", "fp.id") // 👈 Link plans → containers
    .groupBy("u.id", "r.name") // 👈 Needed for aggregate queries
    .select(
      "u.id",
      "u.name",
      "u.email",
      "u.status",
      "u.created_at",
      "r.name as role_name",
      db.raw("COUNT(c.id) AS containers_count"), // 👈 Add container count
    )
    .orderBy("u.id", "asc");
};

export const toggleUserStatus = async (targetUserId, action, adminId) => {
  if (targetUserId === adminId) {
    throw new Error("Admins cannot ban themselves");
  }

  const user = await db("users")
    .select("id", "status", "name", "email", "created_at")
    .where({ id: targetUserId })
    .first();

  if (!user) throw new Error("User not found");

  if (action === "ban" && user.status === "inactive") {
    throw new Error("User is already inactive");
  }
  if (action === "unban" && user.status === "active") {
    throw new Error("User is already active");
  }

  const status = action === "ban" ? "inactive" : "active";
  const [updatedUser] = await db("users")
    .where({ id: targetUserId })
    .update({ status }, ["id", "name", "email", "status", "created_at"]);

  return updatedUser;
};

export const deleteUser = async (userId) => {
  return db.transaction(async (trx) => {
    // Delete from user_roles
    await trx("user_roles").where({ user_id: userId }).del();

    // Delete from user_applications
    await trx("user_applications").where({ user_id: userId }).del();

    // Unassign from license keys
    await trx("admin_license_keys")
      .where({ assigned_to: userId })
      .update({ assigned_to: null });

    // Finally delete the user
    const deleted = await trx("users").where({ id: userId }).del();

    if (!deleted) throw new Error("User not found");
    return true;
  });
};
/* -------------------- Applications -------------------- */
/* -------------------- Applications (All) -------------------- */
export const getApplications = async () => {
  const rows = await db("user_applications")
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
      "user_applications.id",
      "users.name",
      "users.email",
      "users.mobile",
      "user_applications.reason",
      "user_applications.status",
      "user_applications.biosecurity",
      "user_applications.vaccination",
      "user_applications.emergency",
      "user_applications.food_safety",
      "user_applications.description",
      "user_applications.farm_biosecurity",
      "user_applications.created_at",
      "user_applications.supplier_name",

      // 🆕 Second phase fields
      "user_applications.final_approved",
      "user_applications.final_admin_comment",
      "user_applications.final_reviewed_by",
      "user_applications.final_reviewed_at",
      db.raw("reviewer.name as reviewed_by_name"),
      db.raw("final_reviewer.name as final_reviewed_by_name"),
    )
    .orderBy("user_applications.created_at", "desc");

  const fileFields = [
    "biosecurity",
    "vaccination",
    "emergency",
    "food_safety",
    "description",
    "farm_biosecurity",
  ];

  return rows.map((row) => {
    const files = {};
    fileFields.forEach((field) => {
      if (row[field]) {
        try {
          const parsed =
            typeof row[field] === "string"
              ? JSON.parse(row[field])
              : row[field];
          files[field] = {
            ...parsed,
            url: parsed?.path
              ? `${BASE_URL}${parsed.path.startsWith("/") ? parsed.path : `/${parsed.path}`}`
              : null,
          };
        } catch {
          files[field] = null;
        }
      } else {
        files[field] = null;
      }
    });

    return {
      ...row,
      files,
    };
  });
};

/* -------------------- Applications by User -------------------- */
export const getApplicationsByUser = async (userId) => {
  const rows = await db("user_applications")
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

      // 🆕 Second phase fields
      "user_applications.final_approved",
      "user_applications.final_admin_comment",
      "user_applications.final_reviewed_by",
      "user_applications.final_reviewed_at",
      db.raw("reviewer.name as reviewed_by_name"),
      db.raw("final_reviewer.name as final_reviewed_by_name"),
    )
    .where("user_applications.user_id", userId)
    .orderBy("user_applications.created_at", "desc");

  const fileFields = [
    "biosecurity",
    "vaccination",
    "emergency",
    "food_safety",
    "description",
    "farm_biosecurity",
  ];

  return rows.map((row) => {
    const files = {};
    fileFields.forEach((field) => {
      if (row[field]) {
        try {
          const parsed =
            typeof row[field] === "string"
              ? JSON.parse(row[field])
              : row[field];
          files[field] = {
            ...parsed,
            url: parsed?.path
              ? `${BASE_URL}${parsed.path.startsWith("/") ? parsed.path : `/${parsed.path}`}`
              : null,
          };
        } catch {
          files[field] = null;
        }
      } else {
        files[field] = null;
      }
    });

    return {
      ...row,
      files,
    };
  });
};

export const updateApplication = async (id, updates, userId, role) => {
  // Validate existence
  const existing = await db("user_applications").where({ id }).first();
  if (!existing) throw new Error("Application not found");

  // Fields users can update (their application details)
  const userEditableFields = [
    "reason",
    "supplier_name",
    "biosecurity",
    "vaccination",
    "emergency",
    "food_safety",
    "description",
    "farm_biosecurity",
  ];

  // Fields admins can update for reviews + approvals
  const adminOnlyFields = [
    "status",
    "reviewed_by",
    "reviewed_at",
    "notes",
    "admin_comment",
    "final_approved",
    "final_admin_comment",
  ];

  // ✅ Admins and managers can edit both sets of fields
  let allowedFields = [];
  if (role === "admin" || role === "manager") {
    allowedFields = [...userEditableFields, ...adminOnlyFields];
  } else if (role === "user" || role === "farmer") {
    allowedFields = [...userEditableFields];
  }

  // Filter only allowed fields
  const updateData = {};
  for (const key in updates) {
    if (allowedFields.includes(key)) {
      updateData[key] = updates[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error("No valid fields to update");
  }

  /* -------------------- First-Phase Approval -------------------- */
  if (updateData.status && (role === "admin" || role === "manager")) {
    const userStatus = updateData.status === "approved" ? "active" : "pending";
    await db("users")
      .where({ id: existing.user_id })
      .update({ status: userStatus });
  }

  /* -------------------- Second-Phase Review -------------------- */
  if (
    updates.final_approved !== undefined &&
    (role === "admin" || role === "manager")
  ) {
    updateData.final_reviewed_by = userId;
    updateData.final_reviewed_at = db.fn.now();

    const msg = updates.final_approved
      ? "Your application has been fully approved."
      : "Your application requires further changes.";

    // Optional notification (if you have NotificationService)
    try {
      await NotificationService.create({
        user_id: existing.user_id,
        title: "Final Application Review",
        message: msg,
      });
    } catch (err) {
      console.warn("Notification failed:", err.message);
    }
  }

  /* -------------------- Apply Update -------------------- */
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

/* -------------------- Settings -------------------- */
export const getAllSettings = async () => {
  return db("settings").select("*");
};

export const updateSetting = async (key, value) => {
  const existing = await db("settings").where({ key }).first();
  if (!existing) throw new Error("Setting not found");

  const [updated] = await db("settings")
    .where({ key })
    .update({ value, updated_at: db.fn.now() })
    .returning("*");

  return updated;
};

/* -------------------- License Keys -------------------- */
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

  if (user && user.name) {
    // Generate random safe values for required columns
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

    // enforce role
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
    await db("user_roles").insert({
      user_id: assigned_to,
      role_id,
    });
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

/* -------------------- Roles -------------------- */
export const getAllRoles = async () => {
  return db("roles").select("id", "name").orderBy("id", "asc");
};

/* -------------------- request completion -------------------- */

export async function toggleRequestCompletion(requestId, adminId) {
  const existing = await db("buyer_requests").where({ id: requestId }).first();
  if (!existing) throw new Error("Buyer request not found");

  const newStatus = !existing.is_completed;

  await db("buyer_requests")
    .where({ id: requestId })
    .update({
      is_completed: newStatus,
      completed_at: newStatus ? db.fn.now() : null, // ✅ timestamp logic
      updated_at: db.fn.now(),
    });

  // ✅ Send notification to buyer
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
