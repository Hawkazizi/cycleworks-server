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
  return db("buyer_requests")
    .where({ status: "accepted" }) // only admin-accepted requests
    .andWhere((qb) => {
      qb.whereNull("preferred_supplier_id").orWhere(
        "preferred_supplier_id",
        farmerId
      );
    })
    .orderBy("created_at", "desc");
};

export async function submitPlanAndDocs(userId, requestId, docs) {
  const reqRow = await db("buyer_requests")
    .where({ id: requestId, preferred_supplier_id: userId })
    .first();

  if (!reqRow) throw new Error("Request not found or not assigned to you");
  if (reqRow.farmer_status !== "accepted")
    throw new Error("Request must be accepted before submitting docs");

  const [updated] = await db("buyer_requests")
    .where({ id: requestId })
    .update({
      farmer_docs: JSON.stringify(docs),
      final_status: "submitted",
      updated_at: db.fn.now(),
    })
    .returning("*");

  return updated;
}
