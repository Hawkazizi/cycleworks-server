// services/admin.service.js
import db from "../db/knex.js";
import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/jwt.js";
import bcrypt from "bcrypt";
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
    .select(
      "u.id",
      "u.name",
      "u.email",
      "u.status",
      "u.created_at",
      "r.name as role_name"
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
      url: `${BASE_URL}${f.path}`,
    })),
  }));
};

export const reviewApplication = async (id, status, reviewerId) => {
  if (!["approved", "rejected"].includes(status)) {
    throw new Error("Invalid status");
  }

  const [app] = await db("user_applications")
    .where({ id })
    .update({
      status,
      reviewed_by: reviewerId,
      reviewed_at: db.fn.now(),
    })
    .returning("*");

  if (!app) throw new Error("Application not found");

  const userStatus = status === "approved" ? "active" : "pending";
  await db("users").where({ id: app.user_id }).update({ status: userStatus });

  return { message: `Application ${status}`, application: app };
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
      "u.email as assigned_user_email"
    )
    .orderBy("alk.created_at", "desc");
};

export const createLicenseKey = async ({ key, role_id, assigned_to }) => {
  const [created] = await db("admin_license_keys")
    .insert({ key, role_id, assigned_to })
    .returning("*");

  if (assigned_to && role_id) {
    // enforce single role per user
    await db("user_roles").where({ user_id: assigned_to }).del();
    await db("user_roles").insert({
      user_id: assigned_to,
      role_id,
    });
  }

  return created;
};

export const updateLicenseKey = async ({ id, key, role_id, assigned_to }) => {
  const [updated] = await db("admin_license_keys")
    .where({ id })
    .update({ key, role_id, assigned_to }) // ✅ removed updated_at
    .returning("*");

  if (!updated) throw new Error("License key not found");

  if (assigned_to && role_id) {
    // enforce single role per user
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
