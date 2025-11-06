// services/buyerRequest.service.js
import knex from "../db/knex.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { NotificationService } from "./notification.service.js";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/jwt.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

/* =======================================================================
   🧩 HELPERS
======================================================================= */

/** Safely parse JSON values from DB (handles text arrays or objects). */
function safeParseJSON(value, fallback) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** Normalize a buyer request row (hydrate doc URLs, etc.) */
function normalizeRequest(row) {
  return {
    ...row,
    size: safeParseJSON(row.size, []),
    certificates: safeParseJSON(row.certificates, []),
    farmer_docs: safeParseJSON(row.farmer_docs, []).map((doc) => ({
      ...doc,
      filename: doc.filename || doc.original_name || "-",
      path: doc.path?.startsWith("http") ? doc.path : `${BASE_URL}${doc.path}`,
    })),
    admin_docs: safeParseJSON(row.admin_docs, []).map((doc) => ({
      ...doc,
      filename: doc.filename || doc.original_name || "-",
      path: doc.path?.startsWith("http") ? doc.path : `${BASE_URL}${doc.path}`,
    })),
    farmer_plan: safeParseJSON(row.farmer_plan, {}),
  };
}

/** Hydrate all farmer plans and containers for a buyer request. */
async function hydratePlans(requestId) {
  const plans = await knex("farmer_plans as fp")
    .select("fp.*")
    .where("fp.request_id", requestId)
    .orderBy("fp.plan_date", "asc");

  for (const plan of plans) {
    plan.containers = await knex("farmer_plan_containers as c")
      .select("c.*")
      .where("c.plan_id", plan.id)
      .orderBy("c.container_no", "asc");

    for (const container of plan.containers) {
      const files = await knex("farmer_plan_files")
        .where({ container_id: container.id })
        .orderBy("created_at", "asc");

      container.files = files.map((f) => ({
        ...f,
        filename: f.original_name || f.file_key || "-",
        path: f.path?.startsWith("http") ? f.path : `${BASE_URL}${f.path}`,
      }));
    }
  }

  return plans;
}

/* =======================================================================
   🧾 MASTER BUYER FLOW: Create Request (with optional new Buyer)
======================================================================= */

/**
 * Create a buyer request — supports both existing and newly created buyers.
 * Automatically assigns roles, generates a license key, and issues notifications.
 */
export async function createRequestWithBuyerAndLicense({
  creatorId,
  existingBuyerId,
  newBuyer,
  requestData,
}) {
  // If neither existingBuyerId nor newBuyer provided, fallback to normal buyer flow
  if (!existingBuyerId && !newBuyer)
    return await createRequest(creatorId, requestData);

  return knex.transaction(async (trx) => {
    let buyerId = existingBuyerId;

    /* ---------- 1️⃣ Create new buyer if necessary ---------- */
    if (!buyerId && newBuyer?.name) {
      const random = crypto.randomBytes(4).toString("hex");
      const randomEmail = `buyer_${random}@auto.local`;
      const randomMobile = `09${Math.floor(100000000 + Math.random() * 900000000)}`;
      const randomPassword = crypto.randomBytes(8).toString("hex");
      const passwordHash = await bcrypt.hash(randomPassword, 10);

      const [buyer] = await trx("users")
        .insert({
          name: newBuyer.name,
          email: randomEmail,
          mobile: randomMobile,
          password_hash: passwordHash,
          status: "active",
        })
        .returning("*");

      buyerId = buyer.id;

      // Assign buyer role
      const buyerRole = await trx("roles").where({ name: "buyer" }).first("id");
      if (!buyerRole) throw new Error("Buyer role not found");

      await trx("user_roles").insert({
        user_id: buyerId,
        role_id: buyerRole.id,
      });

      // Generate license key
      const licenseKey = `BUY-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
      const [license] = await trx("admin_license_keys")
        .insert({
          key: licenseKey,
          role_id: buyerRole.id,
          assigned_to: buyerId,
          is_active: true,
        })
        .returning("*");

      // Optional: create a JWT for immediate access
      const tokenPayload = {
        id: buyerId,
        email: buyer.email,
        licenseId: license.id,
        roles: ["buyer"],
      };
      const token = jwt.sign(tokenPayload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
      });

      newBuyer.generatedLicense = licenseKey;
      newBuyer.generatedToken = token;
    }

    if (!buyerId) throw new Error("You must choose or create a buyer.");

    /* ---------- 2️⃣ Create the buyer request ---------- */
    const [req] = await trx("buyer_requests")
      .insert({
        buyer_id: buyerId, // Assigned customer
        creator_id: creatorId || buyerId, // Creator is the operator (fallback if direct buyer created)
        product_type: requestData.product_type || "eggs",
        packaging: requestData.packaging || null,
        egg_type: requestData.egg_type || null,
        expiration_days: requestData.expiration_days
          ? parseInt(requestData.expiration_days, 10)
          : null,
        certificates:
          typeof requestData.certificates === "string"
            ? JSON.parse(requestData.certificates || "[]")
            : Array.isArray(requestData.certificates)
              ? requestData.certificates
              : [],
        size:
          typeof requestData.size === "string"
            ? JSON.parse(requestData.size || "[]")
            : Array.isArray(requestData.size)
              ? requestData.size
              : [],
        container_amount: requestData.container_amount || null,
        cartons: requestData.cartons ? parseInt(requestData.cartons, 10) : null,

        // ✅ FIXED HERE
        deadline_start: requestData.deadline_start_date || null,
        deadline_end: requestData.deadline_end_date || null,

        transport_type: requestData.transport_type || null,
        import_country: requestData.import_country || null,
        entry_border: requestData.entry_border || null,
        exit_border: requestData.exit_border || null,
        preferred_supplier_name: requestData.preferred_supplier_name || null,
        preferred_supplier_id: requestData.preferred_supplier_id || null,
        description: requestData.description,
        status: "pending",
      })
      .returning("*");

    /* ---------- 3️⃣ Notify all active admins/managers ---------- */
    const adminManagers = await trx("users")
      .join("user_roles", "users.id", "user_roles.user_id")
      .join("roles", "user_roles.role_id", "roles.id")
      .whereIn("roles.name", ["admin", "manager"])
      .where("users.status", "active")
      .select("users.id");

    for (const u of adminManagers) {
      await NotificationService.create(
        u.id,
        "new_request",
        req.id,
        { buyerName: newBuyer?.name || "Existing Buyer" },
        trx,
      );
    }

    /* ---------- 4️⃣ Return enriched response ---------- */
    return {
      request: normalizeRequest(req),
      newBuyer: newBuyer?.name
        ? {
            id: buyerId,
            name: newBuyer.name,
            licenseKey: newBuyer.generatedLicense,
            token: newBuyer.generatedToken,
          }
        : null,
    };
  });
}

/* =======================================================================
   📦 INDIVIDUAL BUYER CRUD FLOW
======================================================================= */

/** Create a new request (single buyer mode). */
export async function createRequest(userId, data) {
  const [req] = await knex("buyer_requests")
    .insert({
      creator_id: userId,
      buyer_id: userId,
      product_type: data.product_type || "eggs",
      packaging: data.packaging || null,
      size: Array.isArray(data.size) ? data.size : [],
      egg_type: data.egg_type || null,
      expiration_days: data.expiration_days
        ? parseInt(data.expiration_days, 10)
        : null,
      certificates: Array.isArray(data.certificates) ? data.certificates : [],
      container_amount: data.container_amount || null,
      cartons: data.cartons ? parseInt(data.cartons, 10) : null,

      // ✅ FIXED HERE
      deadline_start: data.deadline_start_date || null,
      deadline_end: data.deadline_end_date || null,

      transport_type: data.transport_type || null,
      import_country: data.import_country || null,
      entry_border: data.entry_border || null,
      exit_border: data.exit_border || null,
      preferred_supplier_name: data.preferred_supplier_name || null,
      preferred_supplier_id: data.preferred_supplier_id || null,
      description: data.description,
      status: "pending",
    })
    .returning("*");

  const adminManagers = await knex("users")
    .join("user_roles", "users.id", "user_roles.user_id")
    .join("roles", "user_roles.role_id", "roles.id")
    .whereIn("roles.name", ["admin", "manager"])
    .where("users.status", "active")
    .select("users.id");

  for (const u of adminManagers) {
    await NotificationService.create(u.id, "new_request", req.id, {
      buyerName: "Buyer",
    });
  }

  return normalizeRequest(req);
}

/* =======================================================================
   📜 BUYER REQUEST HISTORY & RETRIEVAL
======================================================================= */

/** List all requests created or owned by a buyer (with optional search). */
export async function getMyRequests(userId, search = "", roles = []) {
  const query = knex("buyer_requests as br")
    .join("users as u", "br.buyer_id", "u.id")
    .select(
      "br.*",
      "u.name as buyer_name",
      "u.email as buyer_email",
      "u.mobile as buyer_mobile",
    )
    .orderBy("br.created_at", "desc");

  if (roles.includes("buyer")) {
    query.where((builder) => {
      builder.where("br.creator_id", userId).orWhere("br.buyer_id", userId);
    });
  }

  if (search) {
    query.andWhere((builder) => {
      builder
        .whereILike("u.name", `%${search}%`)
        .orWhereILike("br.product_type", `%${search}%`)
        .orWhereILike("br.import_country", `%${search}%`);
    });
  }

  const rows = await query;

  return Promise.all(
    rows.map(async (row) => {
      const normalized = normalizeRequest(row);
      normalized.farmer_plans = await hydratePlans(row.id);
      return normalized;
    }),
  );
}

/** Get one specific buyer request (authorized to user). */
export async function getRequestById(userId, id) {
  const row = await knex("buyer_requests")
    .where("id", id)
    .andWhere((b) => b.where("buyer_id", userId).orWhere("creator_id", userId))
    .first();

  if (!row) return null;

  const normalized = normalizeRequest(row);
  normalized.farmer_plans = await hydratePlans(row.id);
  return normalized;
}

/* =======================================================================
   ✏️ BUYER REQUEST UPDATE / CANCEL
======================================================================= */

export async function updateRequest(userId, requestId, data) {
  const req = await knex("buyer_requests")
    .where({ id: requestId, buyer_id: userId })
    .first();
  if (!req) throw new Error("Request not found");
  if (req.status !== "pending")
    throw new Error("Only pending requests can be updated");
  const [updated] = await knex("buyer_requests")
    .where({ id: requestId })
    .update({
      packaging: data.packaging ?? req.packaging,
      size: data.size ?? req.size,
      egg_type: data.egg_type ?? req.egg_type,
      expiration_days: data.expiration_days ?? req.expiration_days,
      certificates: data.certificates ?? req.certificates,
      container_amount: data.container_amount ?? req.container_amount,

      // ✅ FIXED HERE
      deadline_start: data.deadline_start_date ?? req.deadline_start,
      deadline_end: data.deadline_end_date ?? req.deadline_end,

      transport_type: data.transport_type ?? req.transport_type,
      import_country: data.import_country ?? req.import_country,
      entry_border: data.entry_border ?? req.entry_border,
      exit_border: data.exit_border ?? req.exit_border,
      preferred_supplier_name:
        data.preferred_supplier_name ?? req.preferred_supplier_name,
      preferred_supplier_id:
        data.preferred_supplier_id ?? req.preferred_supplier_id,
      updated_at: knex.fn.now(),
    })
    .returning("*");

  const normalized = normalizeRequest(updated);
  normalized.farmer_plans = await hydratePlans(updated.id);
  return normalized;
}

export async function cancelRequest(userId, requestId) {
  const req = await knex("buyer_requests")
    .where({ id: requestId, buyer_id: userId })
    .first();
  if (!req) throw new Error("Request not found");
  if (req.status !== "pending")
    throw new Error("Only pending requests can be cancelled");

  const [updated] = await knex("buyer_requests")
    .where({ id: requestId })
    .update({ status: "cancelled", updated_at: knex.fn.now() })
    .returning("*");

  const normalized = normalizeRequest(updated);
  normalized.farmer_plans = await hydratePlans(updated.id);
  return normalized;
}

/* =======================================================================
   🛠️ ADMIN REQUEST MANAGEMENT
======================================================================= */

/**
 * Update or review a buyer request (admin or manager).
 * Handles approval, rejection, and supplier notifications.
 */
export async function adminUpdateRequest(requestId, updateData, reviewerId) {
  const oldRequest = await knex("buyer_requests")
    .where("id", requestId)
    .first();
  if (!oldRequest) throw new Error("Request not found");

  const [updatedRequest] = await knex("buyer_requests")
    .where("id", requestId)
    .update({
      ...updateData,
      reviewed_by: reviewerId,
      reviewed_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    })
    .returning("*");

  // Notify supplier if newly accepted
  if (updateData.status === "accepted" && oldRequest.status !== "accepted") {
    const supplierId =
      updateData.preferred_supplier_id || updatedRequest.preferred_supplier_id;
    if (supplierId) {
      await NotificationService.create(
        supplierId,
        "request_accepted",
        requestId,
        {
          buyerName: "Buyer",
        },
      );
    }
  }

  // Notify buyer if status changed
  if (updateData.status && updateData.status !== oldRequest.status) {
    await NotificationService.create(
      updatedRequest.buyer_id,
      "status_updated",
      requestId,
      { status: updateData.status },
    );
  }

  return normalizeRequest(updatedRequest);
}
