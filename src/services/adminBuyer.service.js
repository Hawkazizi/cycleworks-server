// services/adminBuyer.service.js
import db from "../db/knex.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

/* -------------------- Buyer Requests -------------------- */
export async function getBuyerRequests() {
  const rows = await db("buyer_requests as br")
    .leftJoin("users as u", "br.buyer_id", "u.id")
    .leftJoin("users as s", "br.preferred_supplier_id", "s.id")
    .select(
      "br.*", // includes deadline_date already
      "u.name as buyer_name",
      "u.email as buyer_email",
      "u.mobile as buyer_mobile",
      "s.name as supplier_name",
      "s.mobile as supplier_mobile"
    )
    .orderBy("br.created_at", "desc");

  const results = [];
  for (const row of rows) {
    const normalized = normalizeRequest(row);
    normalized.farmer_plans = await getPlansWithContainers(row.id);
    normalized.assigned_suppliers = await getAssignedSuppliers(row.id);
    results.push(normalized);
  }

  return results;
}

export async function getBuyerRequestById(id) {
  const row = await db("buyer_requests as br")
    .leftJoin("users as u", "br.buyer_id", "u.id")
    .leftJoin("users as s", "br.preferred_supplier_id", "s.id")
    .select(
      "br.*", // includes deadline_date already
      "u.name as buyer_name",
      "u.email as buyer_email",
      "u.mobile as buyer_mobile",
      "s.name as supplier_name",
      "s.mobile as supplier_mobile"
    )
    .where("br.id", id)
    .first();

  if (!row) return null;

  const normalized = normalizeRequest(row);
  normalized.farmer_plans = await getPlansWithContainers(row.id);
  normalized.assigned_suppliers = await getAssignedSuppliers(row.id);
  return normalized;
}

export async function reviewBuyerRequest(id, { status, reviewerId }) {
  const [updated] = await db("buyer_requests")
    .where({ id })
    .update({
      status,
      reviewed_by: reviewerId,
      reviewed_at: db.fn.now(),
    })
    .returning("*");

  return updated ? normalizeRequest(updated) : null;
}

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
  const farmerDocs = safeParseJSON(row.farmer_docs, []);
  const adminDocs = safeParseJSON(row.admin_docs, []);
  const farmerPlan = safeParseJSON(row.farmer_plan, {});

  return {
    ...row,
    farmer_plan: farmerPlan,
    farmer_docs: farmerDocs.map((doc) => ({
      ...doc,
      path: doc.path?.startsWith("http") ? doc.path : `${BASE_URL}${doc.path}`,
    })),
    admin_docs: adminDocs.map((doc) => ({
      ...doc,
      path: doc.path?.startsWith("http") ? doc.path : `${BASE_URL}${doc.path}`,
    })),
  };
}

/* -------------------- Hydration: Plans → Containers → Files -------------------- */
async function getPlansWithContainers(requestId) {
  const plans = await db("farmer_plans as fp")
    .leftJoin("users as f", "fp.farmer_id", "f.id")
    .select("fp.*", "f.name as farmer_name", "f.mobile as farmer_mobile")
    .where("fp.request_id", requestId)
    .orderBy("fp.plan_date", "asc");

  for (const plan of plans) {
    // load containers
    plan.containers = await db("farmer_plan_containers as c")
      .where("c.plan_id", plan.id)
      .orderBy("c.container_no", "asc");

    // load files for each container
    for (const container of plan.containers) {
      const files = await db("farmer_plan_files")
        .where({ container_id: container.id })
        .orderBy("created_at", "asc");

      container.files = files.map((f) => ({
        ...f,
        path: f.path?.startsWith("http") ? f.path : `${BASE_URL}${f.path}`,
      }));
    }
  }

  return plans;
}

/* -------------------- Assign Suppliers -------------------- */
export async function assignSuppliersToRequest(
  requestId,
  supplierIds,
  reviewerId
) {
  if (!Array.isArray(supplierIds) || supplierIds.length === 0) {
    throw new Error("لیست تامین‌کنندگان الزامی است.");
  }

  // ✅ validate request exists
  const request = await db("buyer_requests").where({ id: requestId }).first();
  if (!request) throw new Error("درخواست یافت نشد.");

  // ✅ validate suppliers
  const validSuppliers = await db("users")
    .whereIn("id", supplierIds)
    .andWhere("status", "active");

  if (validSuppliers.length !== supplierIds.length) {
    throw new Error("برخی از تامین‌کنندگان معتبر یا فعال نیستند.");
  }

  // ✅ clear old mappings
  await db("buyer_request_suppliers")
    .where({ buyer_request_id: requestId })
    .del();

  // ✅ insert new mappings
  const inserted = await db("buyer_request_suppliers")
    .insert(
      supplierIds.map((sid) => ({
        buyer_request_id: requestId,
        supplier_id: sid,
        assigned_by: reviewerId,
      }))
    )
    .returning("*");

  // ✅ update preferred supplier as first in list (for backward compatibility)
  await db("buyer_requests").where({ id: requestId }).update({
    preferred_supplier_id: supplierIds[0],
    updated_at: db.fn.now(),
  });

  return inserted;
}

/* -------------------- Fetch Assigned Suppliers -------------------- */
export async function getAssignedSuppliers(requestId) {
  const rows = await db("buyer_request_suppliers as brs")
    .leftJoin("users as u", "brs.supplier_id", "u.id")
    .select(
      "brs.*",
      "u.name as supplier_name",
      "u.email as supplier_email",
      "u.mobile as supplier_mobile"
    )
    .where("brs.buyer_request_id", requestId)
    .orderBy("brs.id", "asc");

  return rows;
}

/* -------------------- Update deadline -------------------- */

export async function updateBuyerRequestDeadline(
  requestId,
  newDate,
  updatedBy
) {
  const request = await db("buyer_requests").where({ id: requestId }).first();
  if (!request) throw new Error("Buyer request not found");

  if (["accepted", "rejected"].includes(request.status)) {
    throw new Error("Cannot change deadline after review");
  }

  const [updated] = await db("buyer_requests").where({ id: requestId }).update(
    {
      deadline_date: newDate,
      updated_at: db.fn.now(),
    },
    "*"
  );

  return updated;
}
