// services/adminBuyer.service.js
import db from "../db/knex.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

/* -------------------- Buyer Requests -------------------- */
export async function getBuyerRequests() {
  const rows = await db("buyer_requests as br")
    .leftJoin("users as u", "br.buyer_id", "u.id")
    .select(
      "br.*",
      "u.name as buyer_name",
      "u.email as buyer_email",
      "u.mobile as buyer_mobile"
    )
    .orderBy("br.created_at", "desc");

  return rows.map(normalizeRequest);
}

export async function getBuyerRequestById(id) {
  const row = await db("buyer_requests as br")
    .leftJoin("users as u", "br.buyer_id", "u.id")
    .select(
      "br.*",
      "u.name as buyer_name",
      "u.email as buyer_email",
      "u.mobile as buyer_mobile"
    )
    .where("br.id", id)
    .first();

  return row ? normalizeRequest(row) : null;
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
  if (Array.isArray(value)) return value; // already array
  if (typeof value === "object") return value; // already parsed object
  try {
    return JSON.parse(value); // parse string
  } catch {
    return fallback;
  }
}

function normalizeRequest(row) {
  const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

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
