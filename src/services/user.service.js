// services/user.service.js
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "../db/knex.js";
import { sendVerificationCode } from "./SMS/smsService.js";
import { NotificationService } from "./notification.service.js";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/jwt.js";

const SALT_ROUNDS = 10;

/* =======================================================================
   🧍 USER REGISTRATION & AUTHENTICATION
======================================================================= */

/**
 * Register a new user (typically a supplier/farmer).
 * Optionally creates a linked application record.
 */
export const registerUser = async ({
  name,
  mobile,
  password,
  reason,
  supplier_name,
  role,
}) => {
  const cleanMobile = mobile.trim();
  const existing = await db("users")
    .whereRaw("mobile = ?", [cleanMobile])
    .first();
  if (existing) throw new Error("این شماره موبایل قبلاً ثبت شده است");

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  const [user] = await db("users")
    .insert({ name, mobile, password_hash, status: "pending" })
    .returning("*");

  let application = null;
  if (reason || supplier_name) {
    [application] = await db("user_applications")
      .insert({
        user_id: user.id,
        reason,
        supplier_name,
        status: "pending",
      })
      .returning("*");
  }

  // Assign role
  const roleRow = await db("roles")
    .whereRaw("LOWER(name) = LOWER(?)", [role || "user"])
    .first();
  if (!roleRow) throw new Error("نقش انتخاب‌شده در سیستم تعریف نشده است");

  await db("user_roles")
    .insert({ user_id: user.id, role_id: roleRow.id })
    .onConflict(["user_id", "role_id"])
    .ignore();
  // Notify admins/managers about new application
  if (application) {
    const adminManagers = await db("users as u")
      .join("user_roles as ur", "u.id", "ur.user_id")
      .join("roles as r", "r.id", "ur.role_id")
      .whereRaw("LOWER(r.name) IN ('admin','manager')")
      .andWhere("u.status", "active")
      .distinct()
      .pluck("u.id");

    for (const adminId of adminManagers) {
      await NotificationService.create(
        adminId,
        "application_submitted", // ✅ use the correct, UX-friendly type
        application.id, // relatedId = application id (not required, but useful)
        {
          application_id: application.id,
          user_name: name,
          mobile,
        },
      );
    }
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      status: user.status,
    },
    application,
    message: "درخواست ثبت شد، منتظر تأیید مدیر",
  };
};

/**
 * User login via mobile and password.
 * Rejects buyers (who must use license-key login).
 */
export const loginUser = async ({ mobile, password }) => {
  const user = await db("users").where({ mobile }).first();
  if (!user) throw new Error("کاربری با این شماره یافت نشد");
  if (user.status !== "active")
    throw new Error("حساب کاربری هنوز فعال نشده است");

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) throw new Error("شماره موبایل یا رمز عبور نادرست است");

  const roles = await db("user_roles")
    .join("roles", "roles.id", "user_roles.role_id")
    .where("user_roles.user_id", user.id)
    .select("roles.name");

  const roleNames = roles.map((r) => r.name.toLowerCase());
  if (roleNames.includes("buyer")) {
    throw new Error("خریداران باید با لایسنس‌کی وارد شوند");
  }

  const payload = { id: user.id, mobile: user.mobile, roles: roleNames };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  return {
    token,
    user: { id: user.id, mobile: user.mobile },
    roles: roleNames,
  };
};

/* =======================================================================
   👤 PROFILE MANAGEMENT
======================================================================= */

/** Get a single user profile */
export async function getProfileById(userId) {
  return db("users").where({ id: userId }).first();
}

/** Update user profile (name, email, password, mobile) */
export async function updateProfileById(userId, data) {
  const update = {};

  if (data.name) update.name = data.name.trim();
  if (data.email) update.email = data.email.trim();

  // 🔥 NEW: update mobile
  if (data.mobile) {
    const exists = await db("users").where({ mobile: data.mobile }).first();
    if (exists && exists.id !== userId) {
      throw new Error("این شماره موبایل قبلاً استفاده شده است");
    }
    update.mobile = data.mobile.trim();
  }

  if (data.password) {
    update.password_hash = await bcrypt.hash(data.password, 10);
  }

  if (Object.keys(update).length === 0)
    throw new Error("No valid fields to update");

  await db("users")
    .where({ id: userId })
    .update({
      ...update,
      updated_at: db.fn.now(),
    });

  return getProfileById(userId);
}

/** Delete user profile (for account deletion feature) */
export async function deleteProfileById(userId) {
  return db("users").where({ id: userId }).del();
}

/* =======================================================================
   📧 EMAIL VERIFICATION
======================================================================= */

/** Request verification code for a user email */
export async function requestEmailVerification(userId, email) {
  try {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 min validity

    await db("users").where({ id: userId }).update({
      email,
      email_verified: false,
      email_verification_code: code,
      email_verification_expires: expires,
    });

    return { code, email, expires };
  } catch (err) {
    if (err.code === "23505" && err.detail?.includes("users_email_unique")) {
      throw new Error("این ایمیل قبلاً ثبت شده است.");
    }
    throw err;
  }
}

/** Verify email with provided code */
export async function verifyEmailCode(userId, code) {
  const user = await db("users").where({ id: userId }).first();
  if (!user) throw new Error("User not found");
  if (!user.email_verification_code || !user.email_verification_expires)
    throw new Error("Verification not requested");
  if (user.email_verification_expires < new Date())
    throw new Error("Code expired");
  if (user.email_verification_code !== code) throw new Error("Invalid code");

  await db("users").where({ id: userId }).update({
    email_verified: true,
    email_verification_code: null,
    email_verification_expires: null,
  });

  return db("users").where({ id: userId }).first();
}

/* =======================================================================
   🔐 PASSWORD MANAGEMENT
======================================================================= */

/**
 * Change user password securely.
 */
export async function changePassword(userId, currentPassword, newPassword) {
  const user = await db("users").where({ id: userId }).first();
  if (!user) throw new Error("کاربر یافت نشد");

  const match = await bcrypt.compare(currentPassword, user.password_hash);
  if (!match) throw new Error("رمز عبور فعلی صحیح نیست");

  const newHash = await bcrypt.hash(newPassword, 10);
  await db("users").where({ id: userId }).update({ password_hash: newHash });

  return true;
}

/* =======================================================================
   📲 SMS VERIFICATION
======================================================================= */

/**
 * Generate a new SMS verification code and send it to user's mobile.
 */
export async function createCode(mobile, userId) {
  const code = Math.floor(10000 + Math.random() * 90000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min validity

  await db("user_verification_codes").insert({
    user_id: userId,
    mobile,
    code,
    expires_at: expiresAt,
  });

  await sendVerificationCode(mobile, code);
  return { code, expiresAt };
}

/**
 * Verify an SMS code sent to the user's mobile.
 */
export async function verifyUserCode(mobile, inputCode) {
  const record = await db("user_verification_codes")
    .where({ mobile, used: false })
    .andWhere("expires_at", ">", db.fn.now())
    .orderBy("created_at", "desc")
    .first();

  if (!record) throw new Error("کدی برای این شماره پیدا نشد یا منقضی شده است.");
  if (record.code !== inputCode) throw new Error("کد وارد شده نامعتبر است.");

  await db("user_verification_codes")
    .where({ id: record.id })
    .update({ used: true });

  return record;
}

/* =======================================================================
   🧾 PROFILE & REQUEST STATUS
======================================================================= */

/**
 * Get extended user profile including supplier name.
 */
export const getUserProfile = async (userId) => {
  const user = await db("users as u")
    .leftJoin("user_applications as ua", "u.id", "ua.user_id")
    .select(
      "u.id",
      "u.name",
      "u.email",
      "u.mobile", // 🔥 ADD THIS
      "u.status",
      "u.created_at",
      "ua.supplier_name",
    )
    .where("u.id", userId)
    .first();

  if (!user) throw new Error("کاربر یافت نشد");
  return user;
};

/**
 * Update farmer/supplier response to buyer request (accept/reject).
 * Triggers notifications to admins, managers, and buyer.
 */
export async function updateFarmerRequestStatus(
  userId,
  requestId,
  farmer_status,
) {
  const oldRequest = await db("buyer_requests").where("id", requestId).first();
  if (!oldRequest) throw new Error("Request not found");

  // Validate supplier authorization
  const isAssigned = await db("buyer_request_suppliers")
    .where({ buyer_request_id: requestId, supplier_id: userId })
    .first();
  const isPreferred = oldRequest.preferred_supplier_id === userId;
  if (!isAssigned && !isPreferred) throw new Error("Not authorized");

  const updateData = { status: farmer_status, updated_at: db.fn.now() };

  const [updated] = await db("buyer_requests")
    .where("id", requestId)
    .update(updateData)
    .returning("*");

  // Notify only on first acceptance
  if (farmer_status === "accepted" && oldRequest.status !== "accepted") {
    const adminManagers = await db("users")
      .join("user_roles", "users.id", "user_roles.user_id")
      .join("roles", "user_roles.role_id", "roles.id")
      .whereRaw("LOWER(roles.name) IN ('admin', 'manager')")
      .where("users.status", "active")
      .distinct()
      .select("users.id");

    // Notify all admins/managers
    for (const am of adminManagers) {
      await NotificationService.create(
        am.id,
        "farmer_request_update",
        requestId,
        {
          status: "accepted",
          from_user_id: userId,
          message: `تامین‌کننده درخواست #${requestId} را پذیرفت و فرآیند آغاز شد.`,
        },
      );
    }

    // Notify buyer
    if (updated.buyer_id) {
      await NotificationService.create(
        updated.buyer_id,
        "status_updated",
        requestId,
        {
          farmer_status: "accepted",
          message: `تامین‌کننده درخواست شما (شناسه ${requestId}) را پذیرفت و درخواست در حال اجرا است 🚚.`,
        },
      );
    }
  }

  return updated;
}

/**
 * Fetch minimal active users filtered by role (e.g., suppliers only).
 */
export async function getMinimalUsers(roleName) {
  let query = db("users")
    .select("users.id", "users.name", "users.mobile", "users.email")
    .where("users.status", "active");

  if (roleName) {
    query = query
      .join("user_roles", "users.id", "user_roles.user_id")
      .join("roles", "user_roles.role_id", "roles.id")
      .where("roles.name", roleName);
  }

  return query.orderBy("users.name", "asc");
}
/**
 * Fetch detailed info for a single container owned by the logged-in supplier (farmer user).
 */
export async function getContainerDetails(containerId, userId) {
  // --- 1️⃣ Fetch container and all linked info
  const container = await db("farmer_plan_containers as c")
    .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
    .leftJoin("buyer_requests as br", "p.request_id", "br.id")
    .leftJoin("users as buyer", "br.buyer_id", "buyer.id")
    .leftJoin("users as supplier", "c.supplier_id", "supplier.id") // ✅ use supplier_id for ownership
    .select(
      "c.id as container_id",
      "c.tracking_code",
      "c.metadata",
      "c.is_completed",
      "c.in_progress",
      "c.metadata_status as container_status",
      "c.farmer_status", // ✅ ADDED
      "c.supplier_id",
      "c.created_at as container_created_at",
      "c.updated_at as container_updated_at",
      "p.id as plan_id",

      // Buyer Request Details
      "br.id as request_id",
      "br.status as request_status",
      "br.import_country",
      "br.entry_border",
      "br.exit_border",
      "br.packaging",
      "br.egg_type",
      "br.product_type",
      "br.transport_type",
      "br.size",
      "br.certificates",
      "br.cartons",
      "br.container_amount",
      "br.expiration_date",
      "br.expiration_days",
      "br.description as buyer_description",
      "br.preferred_supplier_name",
      "br.deadline_start as buyer_deadline_start",
      "br.deadline_end as buyer_deadline_end",

      // Buyer + Supplier Info
      "buyer.name as buyer_name",
      "buyer.mobile as buyer_mobile",
      "supplier.name as supplier_name",
      "supplier.mobile as supplier_mobile",
    )
    .where("c.id", containerId)
    .first();

  if (!container) throw new Error("Container not found");

  // --- 2️⃣ Authorization: check supplier ownership
  if (Number(container.supplier_id) !== Number(userId)) {
    throw new Error("Unauthorized access to this container");
  }

  // --- 5️⃣ Normalize arrays and JSON fields safely
  const normalized = {
    ...container,

    // Normalize statuses
    farmer_status: container.farmer_status
      ? String(container.farmer_status).toLowerCase()
      : "pending",

    container_status: container.container_status
      ? String(container.container_status).toLowerCase()
      : "pending",

    // Parse metadata JSON
    metadata:
      typeof container.metadata === "string"
        ? JSON.parse(container.metadata)
        : container.metadata || {},

    // Parse arrays
    size: Array.isArray(container.size)
      ? container.size
      : safeParseArray(container.size),

    certificates: Array.isArray(container.certificates)
      ? container.certificates
      : safeParseArray(container.certificates),
  };

  return normalized;
}

// Helper to safely parse Postgres arrays
function safeParseArray(val) {
  if (!val) return [];
  try {
    if (typeof val === "string") {
      if (val.startsWith("[") && val.endsWith("]")) return JSON.parse(val);
      return val
        .replace(/[{}]/g, "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    }
    return Array.isArray(val) ? val : [];
  } catch {
    return [];
  }
}
