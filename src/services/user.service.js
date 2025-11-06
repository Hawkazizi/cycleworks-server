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
    const adminManagers = await db("user_roles")
      .join("roles", "roles.id", "user_roles.role_id")
      .whereRaw("LOWER(roles.name) IN ('admin', 'manager')")
      .select("user_id as id")
      .distinct();

    for (const am of adminManagers) {
      await NotificationService.create(am.id, "new_application", null, {
        user_name: name,
        mobile,
      });
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

/** Update user profile (name, email, password) */
export async function updateProfileById(userId, data) {
  const update = {};

  if (data.name) update.name = data.name.trim();
  if (data.email) update.email = data.email.trim();

  if (data.password) {
    update.password_hash = await bcrypt.hash(data.password, 10);
  }

  if (Object.keys(update).length === 0)
    throw new Error("No valid fields to update");

  await db("users").where({ id: userId }).update(update);
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
