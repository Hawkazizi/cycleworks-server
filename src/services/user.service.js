import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "../db/knex.js";
import { sendVerificationCode } from "./SMS/smsService.js";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/jwt.js";

const SALT_ROUNDS = 10;

/* -------------------- Registration & Auth -------------------- */
export const registerUser = async ({
  name,
  mobile,
  password,
  reason,
  role,
}) => {
  const existing = await db("users").where({ mobile }).first();
  if (existing) throw new Error("این شماره موبایل قبلاً ثبت شده است");

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  const [user] = await db("users")
    .insert({ name, mobile, password_hash, status: "pending" })
    .returning("*");

  let application = null;
  if (reason) {
    [application] = await db("user_applications")
      .insert({ user_id: user.id, reason, status: "pending" })
      .returning("*");
  }

  const roleRow = await db("roles").where({ name: role }).first();
  if (!roleRow) throw new Error("نقش انتخاب شده معتبر نیست");

  await db("user_roles")
    .insert({ user_id: user.id, role_id: roleRow.id })
    .onConflict(["user_id", "role_id"])
    .ignore();

  return { user, application, message: "درخواست ثبت شد، منتظر تأیید مدیر" };
};

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

export async function getProfileById(userId) {
  return db("users").where({ id: userId }).first();
}

export async function updateProfileById(userId, data) {
  const update = {};
  if (data.name) update.name = data.name;
  if (data.email) update.email = data.email;
  if (data.password) {
    update.password_hash = await bcrypt.hash(data.password, 10);
  }

  await db("users").where({ id: userId }).update(update);
  return getProfileById(userId);
}

export async function deleteProfileById(userId) {
  return db("users").where({ id: userId }).del();
}

/* -------------------- email Verification -------------------- */

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
    if (err.message.includes("users_email_unique")) {
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
/* -------------------- Change Password -------------------- */

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await db("users").where({ id: userId }).first();
  if (!user) throw new Error("کاربر یافت نشد");

  const match = await bcrypt.compare(currentPassword, user.password_hash);
  if (!match) throw new Error("رمز عبور فعلی صحیح نیست");

  const newHash = await bcrypt.hash(newPassword, 10);
  await db("users").where({ id: userId }).update({ password_hash: newHash });

  return true;
}

/* -------------------- SMS Verification -------------------- */
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
    .andWhere("expires_at", ">", new Date())
    .orderBy("created_at", "desc")
    .first();

  if (!record) throw new Error("کدی برای این شماره پیدا نشد یا منقضی شده است.");
  if (record.code !== inputCode) throw new Error("کد وارد شده نامعتبر است.");

  await db("user_verification_codes")
    .where({ id: record.id })
    .update({ used: true });
  return record;
}

/* -------------------- Profile -------------------- */
export const getUserProfile = async (userId) => {
  const user = await db("users")
    .select("id", "name", "email", "status", "created_at")
    .where({ id: userId })
    .first();

  if (!user) throw new Error("کاربر یافت نشد");
  return user;
};
/* -------------------- Buyer Requests (Farmer flow) -------------------- */
export const listBuyerRequestsForFarmer = async (farmerId) => {
  return db("buyer_requests as br")
    .leftJoin("users as u", "u.id", "br.buyer_id")
    .select(
      "br.id",
      "br.import_country",
      "br.container_amount",
      "br.egg_type",
      "br.product_type",
      "br.transport_type",
      "br.status",
      "br.farmer_status",
      "br.final_status",
      "br.farmer_plan",
      "br.farmer_docs",
      "br.admin_docs",
      "br.deadline_date", // ✅ now included
      "br.created_at",
      "u.name as buyer_name"
    )
    .where("br.status", "accepted")
    .andWhere((qb) => {
      qb.whereNull("br.preferred_supplier_id").orWhere(
        "br.preferred_supplier_id",
        farmerId
      );
    })
    .orderBy("br.created_at", "desc");
};

/**
 * Farmer submits daily plan → also accepts the request if not yet accepted
 */
export async function upsertDailyPlan(farmerId, requestId, planDays) {
  const reqRow = await db("buyer_requests").where({ id: requestId }).first();
  if (!reqRow) throw new Error("Request not found");

  // Assign this farmer if not already assigned
  if (!reqRow.preferred_supplier_id) {
    await db("buyer_requests").where({ id: requestId }).update({
      preferred_supplier_id: farmerId,
      farmer_status: "accepted",
      updated_at: db.fn.now(),
    });
  }

  if (
    reqRow.preferred_supplier_id &&
    reqRow.preferred_supplier_id !== farmerId
  ) {
    throw new Error("Request already assigned to another supplier");
  }

  // Wipe existing plans for this request
  await db("farmer_plans").where({ request_id: requestId }).del();

  // Insert daily plans
  const inserts = planDays.map((p) => ({
    request_id: requestId,
    farmer_id: farmerId,
    plan_date: p.date, // 🔑 must be YYYY-MM-DD
    container_amount: p.amount,
    created_at: db.fn.now(),
  }));

  if (inserts.length) {
    await db("farmer_plans").insert(inserts);
  }

  return { message: "Plan submitted and request accepted", plan: inserts };
}

/**
 * Get all plan rows with files for a request
 */
export async function getPlanByRequestForFarmer(farmerId, requestId) {
  const plans = await db("farmer_plans")
    .where({ request_id: requestId, farmer_id: farmerId })
    .select("*");

  const withFiles = await Promise.all(
    plans.map(async (plan) => {
      const files = await db("farmer_plan_files")
        .where({ plan_id: plan.id })
        .select("*");
      return { ...plan, files };
    })
  );

  return withFiles;
}

/**
 * Add file to a specific day plan
 */
export async function addFileToPlan(farmerId, planId, file) {
  const plan = await db("farmer_plans").where({ id: planId }).first();
  if (!plan) throw new Error("Plan not found");
  if (plan.farmer_id !== farmerId)
    throw new Error("You cannot upload for this plan");

  const [created] = await db("farmer_plan_files")
    .insert({
      plan_id: planId,
      file_key: file.file_key,
      original_name: file.original_name,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      path: file.path,
      status: "submitted",
      created_at: db.fn.now(),
    })
    .returning("*");

  return created;
}

/**
 * Replace a rejected file
 */
export async function replacePlanFile(farmerId, fileId, file) {
  const old = await db("farmer_plan_files as f")
    .join("farmer_plans as p", "p.id", "f.plan_id")
    .where("f.id", fileId)
    .select("f.*", "p.farmer_id")
    .first();

  if (!old) throw new Error("File not found");
  if (old.farmer_id !== farmerId)
    throw new Error("You cannot update this file");
  if (old.status !== "rejected")
    throw new Error("Only rejected files can be replaced");

  const [updated] = await db("farmer_plan_files").where({ id: fileId }).update(
    {
      original_name: file.original_name,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      path: file.path,
      status: "submitted",
      updated_at: db.fn.now(),
    },
    "*"
  );

  return updated;
}
