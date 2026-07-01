import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import db from "../../common/db/knex.js";
import { sendVerificationCode } from "../sms/smsService.js";
import { sendMail } from "../../common/config/mailer.js"; // ✅ ADDED FOR EMAIL VERIFICATION
import { NotificationService } from "../notification/notification.service.js";
import { JWT_SECRET } from "../../common/config/jwt.js";

const SALT_ROUNDS = 10;

/* =======================================================================
   🧍 USER REGISTRATION & AUTHENTICATION
======================================================================= */

export const registerUser = async ({
  name,
  mobile,
  email,
  password,
  reason,
  supplier_name,
  role,
}) => {
  // 1. Validate Mobile if provided
  if (mobile) {
    const cleanMobile = mobile.trim();
    const existingMobile = await db("users")
      .whereRaw("mobile = ?", [cleanMobile])
      .first();
    if (existingMobile) throw new Error("این شماره موبایل قبلاً ثبت شده است");
  }

  // 2. Validate Email if provided
  if (email) {
    const cleanEmail = email.trim().toLowerCase();
    const existingEmail = await db("users")
      .whereRaw("LOWER(email) = ?", [cleanEmail])
      .first();
    if (existingEmail) throw new Error("این ایمیل قبلاً ثبت شده است");
  }

  if (!mobile && !email) {
    throw new Error("Mobile or email is required");
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  // ✅ CHANGED: Initial status is now 'pending_verification'
  const insertData = { name, password_hash, status: "pending_verification" };
  if (mobile) insertData.mobile = mobile.trim();
  if (email) insertData.email = email.trim().toLowerCase();

  const [user] = await db("users").insert(insertData).returning("*");

  let application = null;
  if (reason || supplier_name) {
    // ✅ CHANGED: Application status is also 'pending_verification'
    [application] = await db("user_applications")
      .insert({
        user_id: user.id,
        reason,
        supplier_name,
        status: "pending_verification",
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

  // ✅ GENERATE & SEND VERIFICATION CODE (Instead of notifying admins)
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

  await db("user_verification_codes").insert({
    user_id: user.id,
    mobile: mobile || email,
    code,
    expires_at: expires,
  });

  if (email) {
    await sendMail({
      to: email,
      subject: "Verification Code / کد تایید حساب",
      html: `<h2>Your Verification Code</h2><p style="font-size:24px;font-weight:bold;">${code}</p>`,
    });
  } else if (mobile) {
    await sendVerificationCode(mobile, code);
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      status: user.status,
    },
    application,
    message: "کد تایید ارسال شد",
  };
};

/**
 * ✅ NEW: Verify registration code and notify admins
 */
export const verifyRegistrationCode = async (identifier, code) => {
  let user = await db("users").where({ mobile: identifier }).first();
  if (!user) {
    user = await db("users")
      .whereRaw("LOWER(email) = LOWER(?)", [identifier])
      .first();
  }
  if (!user) throw new Error("کاربری با این مشخصات یافت نشد");

  if (user.status !== "pending_verification") {
    throw new Error("این حساب قبلا تایید شده یا نیاز به تایید ندارد");
  }

  const record = await db("user_verification_codes")
    .where({ user_id: user.id, used: false })
    .andWhere("expires_at", ">", db.fn.now())
    .orderBy("created_at", "desc")
    .first();

  if (!record || record.code !== code) {
    throw new Error("کد وارد شده نامعتبر یا منقضی شده است");
  }

  // 1️⃣ Update user & application status to 'pending' (Admin Review)
  await db("users")
    .where({ id: user.id })
    .update({
      status: "pending",
      email_verified: user.email ? true : false,
      updated_at: db.fn.now(),
    });

  await db("user_applications")
    .where({ user_id: user.id })
    .update({ status: "pending" });

  // 2️⃣ Mark code as used
  await db("user_verification_codes")
    .where({ id: record.id })
    .update({ used: true });

  // 3️⃣ NOW notify admins/managers (Moved from registerUser)
  const application = await db("user_applications")
    .where({ user_id: user.id })
    .first();
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
        "application_submitted",
        application.id,
        {
          application_id: application.id,
          user_name: user.name,
          mobile: user.mobile || "N/A",
          email: user.email || "N/A",
        },
      );
    }
  }

  return { message: "حساب تایید و برای بررسی مدیر ارسال شد" };
};

/**
 * User login via Mobile OR Email.
 * Returns Access Token (short) and Refresh Token (long).
 */
export const loginUser = async ({ identifier, password }) => {
  let user;

  // Try finding by mobile first, then by email
  user = await db("users").where({ mobile: identifier }).first();
  if (!user) {
    user = await db("users")
      .whereRaw("LOWER(email) = LOWER(?)", [identifier])
      .first();
  }

  if (!user) throw new Error("کاربری با این مشخصات یافت نشد");

  // ✅ UPDATED STATUS CHECKS FOR NEW FLOW
  if (user.status === "pending_verification")
    throw new Error(
      "لطفاً ابتدا حساب خود را تایید کنید (Please verify your account first)",
    );
  if (user.status === "pending")
    throw new Error(
      "حساب شما در انتظار تایید مدیر است (Waiting for admin approval)",
    );
  if (user.status === "rejected")
    throw new Error("حساب کاربری شما رد شده است (Account rejected)");
  if (user.status !== "active")
    throw new Error("حساب کاربری هنوز فعال نشده است");

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) throw new Error("شماره موبایل/ایمیل یا رمز عبور نادرست است");

  const roles = await db("user_roles")
    .join("roles", "roles.id", "user_roles.role_id")
    .where("user_roles.user_id", user.id)
    .select("roles.name");

  const roleNames = roles.map((r) => r.name.toLowerCase());
  if (roleNames.includes("buyer")) {
    throw new Error("خریداران باید با لایسنس‌کی وارد شوند");
  }

  // 🔐 Generate Access Token (Short-lived: 15 minutes)
  const accessToken = jwt.sign(
    { id: user.id, mobile: user.mobile, email: user.email, roles: roleNames },
    JWT_SECRET,
    { expiresIn: "15m" },
  );

  // 🔑 Generate Refresh Token (Long-lived: 7 days)
  const refreshTokenStr = crypto.randomBytes(40).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Store refresh token in DB
  await db("refresh_tokens").insert({
    user_id: user.id,
    token: refreshTokenStr,
    expires_at: expiresAt,
  });

  return {
    accessToken,
    refreshToken: refreshTokenStr,
    user: { id: user.id, mobile: user.mobile, email: user.email },
    roles: roleNames,
  };
};

/**
 * Refresh the access token using a valid refresh token.
 */
export const refreshAccessToken = async (refreshTokenStr) => {
  const storedToken = await db("refresh_tokens")
    .where({ token: refreshTokenStr, is_revoked: false })
    .andWhere("expires_at", ">", db.fn.now())
    .first();

  if (!storedToken) {
    throw new Error("Invalid or expired refresh token");
  }

  const user = await db("users").where({ id: storedToken.user_id }).first();
  if (!user || user.status !== "active") {
    throw new Error("User not found or account is inactive");
  }

  const roles = await db("user_roles")
    .join("roles", "roles.id", "user_roles.role_id")
    .where("user_roles.user_id", user.id)
    .select("roles.name");
  const roleNames = roles.map((r) => r.name.toLowerCase());

  const newAccessToken = jwt.sign(
    { id: user.id, mobile: user.mobile, email: user.email, roles: roleNames },
    JWT_SECRET,
    { expiresIn: "15m" },
  );

  await db("refresh_tokens")
    .where({ token: refreshTokenStr })
    .update({ is_revoked: true });

  const newRefreshTokenStr = crypto.randomBytes(40).toString("hex");
  const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db("refresh_tokens").insert({
    user_id: user.id,
    token: newRefreshTokenStr,
    expires_at: newExpiresAt,
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshTokenStr,
  };
};

/**
 * Logout user by revoking their refresh token.
 */
export const logoutUser = async (refreshTokenStr) => {
  if (refreshTokenStr) {
    await db("refresh_tokens")
      .where({ token: refreshTokenStr })
      .update({ is_revoked: true });
  }
  return true;
};

/* =======================================================================
   🔄 FORGOT PASSWORD LOGIC
======================================================================= */

export const sendForgotPasswordCode = async (identifier) => {
  let user = await db("users").where({ mobile: identifier }).first();
  if (!user) {
    user = await db("users")
      .whereRaw("LOWER(email) = LOWER(?)", [identifier])
      .first();
  }
  if (!user) throw new Error("کاربری با این مشخصات یافت نشد");

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db("user_verification_codes").insert({
    user_id: user.id,
    mobile: identifier,
    code,
    expires_at: expiresAt,
    used: false,
  });

  if (user.mobile === identifier) {
    await sendVerificationCode(user.mobile, code);
  } else if (user.email) {
    await sendMail({
      to: user.email,
      subject: "Password Reset Code / کد بازیابی رمز عبور",
      html: `<h2>Your Password Reset Code</h2><p style="font-size:24px;font-weight:bold;letter-spacing:2px;">${code}</p><p>This code will expire in 15 minutes.</p>`,
    });
  } else {
    throw new Error(
      "این حساب هیچ ایمیل یا شماره موبایلی برای دریافت کد ندارد.",
    );
  }

  return { message: "کد ارسال شد" };
};

export const resetPasswordWithCode = async (identifier, code, newPassword) => {
  let user = await db("users").where({ mobile: identifier }).first();
  if (!user) {
    user = await db("users")
      .whereRaw("LOWER(email) = LOWER(?)", [identifier])
      .first();
  }
  if (!user) throw new Error("کاربری با این مشخصات یافت نشد");

  const record = await db("user_verification_codes")
    .where({ user_id: user.id, used: false })
    .andWhere("expires_at", ">", db.fn.now())
    .orderBy("created_at", "desc")
    .first();

  if (!record || record.code !== code) {
    throw new Error("کد وارد شده نامعتبر یا منقضی شده است");
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await db("users").where({ id: user.id }).update({ password_hash: newHash });

  await db("user_verification_codes")
    .where({ id: record.id })
    .update({ used: true });

  return { message: "رمز عبور با موفقیت تغییر کرد" };
};

/* =======================================================================
   👤 PROFILE MANAGEMENT
======================================================================= */

export async function getProfileById(userId) {
  return db("users").where({ id: userId }).first();
}

export async function updateProfileById(userId, data) {
  const update = {};

  if (data.name) update.name = data.name.trim();

  if (data.email) {
    const cleanEmail = data.email.trim().toLowerCase();
    const exists = await db("users")
      .whereRaw("LOWER(email) = ?", [cleanEmail])
      .first();
    if (exists && exists.id !== userId) {
      throw new Error("این ایمیل قبلاً استفاده شده است");
    }
    update.email = cleanEmail;
  }

  if (data.mobile) {
    const exists = await db("users")
      .where({ mobile: data.mobile.trim() })
      .first();
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
    .update({ ...update, updated_at: db.fn.now() });
  return getProfileById(userId);
}

export async function deleteProfileById(userId) {
  return db("users").where({ id: userId }).del();
}

/* =======================================================================
   📧 EMAIL VERIFICATION
======================================================================= */

export async function requestEmailVerification(userId, email) {
  try {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 15 * 60 * 1000);

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

export async function createCode(mobile, userId) {
  const code = Math.floor(10000 + Math.random() * 90000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db("user_verification_codes").insert({
    user_id: userId,
    mobile,
    code,
    expires_at: expiresAt,
  });

  await sendVerificationCode(mobile, code);
  return { code, expiresAt };
}

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

export const getUserProfile = async (userId) => {
  const user = await db("users as u")
    .leftJoin("user_applications as ua", "u.id", "ua.user_id")
    .select(
      "u.id",
      "u.name",
      "u.email",
      "u.mobile",
      "u.status",
      "u.created_at",
      "ua.supplier_name",
    )
    .where("u.id", userId)
    .first();

  if (!user) throw new Error("کاربر یافت نشد");
  return user;
};

export async function updateFarmerRequestStatus(
  userId,
  requestId,
  farmer_status,
) {
  const oldRequest = await db("buyer_requests").where("id", requestId).first();
  if (!oldRequest) throw new Error("Request not found");

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

  if (farmer_status === "accepted" && oldRequest.status !== "accepted") {
    const adminManagers = await db("users")
      .join("user_roles", "users.id", "user_roles.user_id")
      .join("roles", "user_roles.role_id", "roles.id")
      .whereRaw("LOWER(roles.name) IN ('admin', 'manager')")
      .where("users.status", "active")
      .distinct()
      .select("users.id");

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

export async function getContainerDetails(containerId, userId) {
  const container = await db("farmer_plan_containers as c")
    .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
    .leftJoin("buyer_requests as br", "p.request_id", "br.id")
    .leftJoin("users as buyer", "br.buyer_id", "buyer.id")
    .leftJoin("users as supplier", "c.supplier_id", "supplier.id")
    .select(
      "c.id as container_id",
      "c.tracking_code",
      "c.metadata",
      "c.is_completed",
      "c.in_progress",
      "c.metadata_status as container_status",
      "c.farmer_status",
      "c.supplier_id",
      "c.created_at as container_created_at",
      "c.updated_at as container_updated_at",
      "p.id as plan_id",
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
      "br.order_number",
      "buyer.name as buyer_name",
      "buyer.mobile as buyer_mobile",
      "supplier.name as supplier_name",
      "supplier.mobile as supplier_mobile",
    )
    .where("c.id", containerId)
    .first();

  if (!container) throw new Error("Container not found");

  if (Number(container.supplier_id) !== Number(userId)) {
    throw new Error("Unauthorized access to this container");
  }

  const normalized = {
    ...container,
    farmer_status: container.farmer_status
      ? String(container.farmer_status).toLowerCase()
      : "pending",
    container_status: container.container_status
      ? String(container.container_status).toLowerCase()
      : "pending",
    metadata:
      typeof container.metadata === "string"
        ? JSON.parse(container.metadata)
        : container.metadata || {},
    size: Array.isArray(container.size)
      ? container.size
      : safeParseArray(container.size),
    certificates: Array.isArray(container.certificates)
      ? container.certificates
      : safeParseArray(container.certificates),
  };

  return normalized;
}

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
