// services/farmerBuyer.service.js
import db from "../db/knex.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

/* -------------------- Get Farmer's Buyer Requests -------------------- */
export async function getFarmerRequests(farmerId) {
  const rows = await db("buyer_requests as br")
    .leftJoin("users as u", "br.buyer_id", "u.id")
    .select(
      "br.*",
      "u.name as buyer_name",
      "u.mobile as buyer_mobile",
      "u.email as buyer_email"
    )
    .where("br.preferred_supplier_id", farmerId)
    .orWhereIn(
      "br.id",
      db("buyer_request_suppliers")
        .select("buyer_request_id")
        .where("supplier_id", farmerId)
    )
    .orderBy("br.created_at", "desc");

  const results = [];
  for (const row of rows) {
    const normalized = normalizeRequest(row);
    normalized.farmer_plans = await getPlansWithContainers(row.id, farmerId);
    results.push(normalized);
  }
  return results;
}

/* -------------------- Get Single Buyer Request -------------------- */
export async function getFarmerRequestById(farmerId, requestId) {
  const row = await db("buyer_requests as br")
    .leftJoin("users as u", "br.buyer_id", "u.id")
    .select(
      "br.*",
      "u.name as buyer_name",
      "u.mobile as buyer_mobile",
      "u.email as buyer_email"
    )
    .where("br.id", requestId)
    .andWhere(function () {
      this.where("br.preferred_supplier_id", farmerId).orWhereIn(
        "br.id",
        db("buyer_request_suppliers")
          .select("buyer_request_id")
          .where("supplier_id", farmerId)
      );
    })
    .first();

  if (!row) return null;

  const normalized = normalizeRequest(row);
  normalized.farmer_plans = await getPlansWithContainers(requestId, farmerId);
  return normalized;
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
async function getPlansWithContainers(requestId, farmerId) {
  const plans = await db("farmer_plans as fp")
    .select("fp.*")
    .where({ request_id: requestId, farmer_id: farmerId })
    .orderBy("fp.plan_date", "asc");

  for (const plan of plans) {
    plan.containers = await db("farmer_plan_containers as c")
      .where("c.plan_id", plan.id)
      .orderBy("c.container_no", "asc");

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

export async function updateFarmerRequestStatus(farmerId, requestId, status) {
  const valid = ["accepted", "rejected"];
  if (!valid.includes(status)) throw new Error("Invalid status.");

  const req = await db("buyer_requests").where({ id: requestId }).first();
  if (!req) throw new Error("Request not found.");

  // ✅ Ownership check (preferred OR assigned)
  const isAssigned = await db("buyer_request_suppliers")
    .where({ buyer_request_id: requestId, supplier_id: farmerId })
    .first();
  if (req.preferred_supplier_id !== farmerId && !isAssigned)
    throw new Error("Not authorized to update this request.");

  // ✅ Must be approved by admin
  if (req.status !== "accepted")
    throw new Error("Request not yet approved by admin.");

  // ✅ Final status check
  if (req.final_status === "completed")
    throw new Error("Request already completed.");

  // ✅ Prevent multiple responses
  if (["accepted", "rejected"].includes(req.farmer_status))
    throw new Error("Farmer has already responded to this request.");

  const updateData = {
    farmer_status: status,
    updated_at: db.fn.now(),
  };

  if (status === "rejected") {
    updateData.final_status = "rejected";
  }

  const [updated] = await db("buyer_requests")
    .where({ id: requestId })
    .update(updateData)
    .returning("*");

  return updated;
}
