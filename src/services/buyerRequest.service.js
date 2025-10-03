// services/buyerRequest.service.js
import knex from "../db/knex.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

/* -------------------- Helpers -------------------- */
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

function normalizeRequest(row) {
  return {
    ...row,
    farmer_docs: safeParseJSON(row.farmer_docs, []).map((doc) => ({
      ...doc,
      filename: doc.filename || doc.original_name || "-", // ensure filename
      path: doc.path?.startsWith("http") ? doc.path : `${BASE_URL}${doc.path}`,
    })),
    admin_docs: safeParseJSON(row.admin_docs, []).map((doc) => ({
      ...doc,
      filename: doc.filename || doc.original_name || "-", // ensure filename
      path: doc.path?.startsWith("http") ? doc.path : `${BASE_URL}${doc.path}`,
    })),
    farmer_plan: safeParseJSON(row.farmer_plan, {}),
  };
}

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
        filename: f.original_name || f.file_key || "-", // add filename explicitly
        path: f.path?.startsWith("http") ? f.path : `${BASE_URL}${f.path}`,
      }));
    }
  }

  return plans;
}

/* -------------------- CRUD -------------------- */
export async function createRequest(userId, data) {
  const [req] = await knex("buyer_requests")
    .insert({
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
      deadline_date: data.deadline_date || null,
      transport_type: data.transport_type || null,
      import_country: data.import_country || null,
      entry_border: data.entry_border || null,
      exit_border: data.exit_border || null,
      preferred_supplier_name: data.preferred_supplier_name || null,
      preferred_supplier_id: data.preferred_supplier_id || null,
      status: "pending",
    })
    .returning("*");

  return normalizeRequest(req);
}

export async function getMyRequests(userId) {
  const rows = await knex("buyer_requests")
    .where({ buyer_id: userId })
    .orderBy("created_at", "desc");

  return Promise.all(
    rows.map(async (row) => {
      const normalized = normalizeRequest(row);
      normalized.farmer_plans = await hydratePlans(row.id);
      return normalized;
    })
  );
}

export async function getRequestById(userId, id) {
  const row = await knex("buyer_requests")
    .where({ id, buyer_id: userId })
    .first();

  if (!row) return null;

  const normalized = normalizeRequest(row);
  normalized.farmer_plans = await hydratePlans(row.id);
  return normalized;
}

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
      deadline_date: data.deadline_date ?? req.deadline_date,
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
    .update({
      status: "cancelled",
      updated_at: knex.fn.now(),
    })
    .returning("*");

  const normalized = normalizeRequest(updated);
  normalized.farmer_plans = await hydratePlans(updated.id);
  return normalized;
}

export async function getMyRequestHistory(userId) {
  const rows = await knex("buyer_requests")
    .where({ buyer_id: userId })
    .orderBy("created_at", "desc");

  return Promise.all(
    rows.map(async (row) => {
      const normalized = normalizeRequest(row);
      normalized.farmer_plans = await hydratePlans(row.id);
      return normalized;
    })
  );
}
