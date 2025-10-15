import db from "../db/knex.js";

/* -------------------- Helper: Generate tracking code -------------------- */
async function generateTrackingCode(containerId) {
  // find related buyer request and its import country
  const info = await db("farmer_plan_containers as c")
    .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
    .leftJoin("buyer_requests as br", "p.request_id", "br.id")
    .select("br.import_country")
    .where("c.id", containerId)
    .first();

  if (!info) throw new Error("Container or buyer request not found");

  const prefixMap = {
    Qatar: "Q12-",
    Oman: "O12-",
    Bahrain: "B12-",
  };

  const prefix = prefixMap[info.import_country] || "X12-";

  // generate random suffix (6 uppercase alphanumerics)
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();

  return `${prefix}${randomPart}`;
}

/* -------------------- Create Tracking Record -------------------- */
export async function addTracking({ containerId, status, note, createdBy }) {
  const tracking_code = await generateTrackingCode(containerId);

  const [inserted] = await db("container_tracking_statuses")
    .insert({
      container_id: containerId,
      status,
      note,
      created_by: createdBy,
      tracking_code,
    })
    .returning("*");

  return inserted;
}

/* -------------------- List All Tracking History -------------------- */
export async function listTracking(containerId) {
  return db("container_tracking_statuses")
    .where({ container_id: containerId })
    .orderBy("created_at", "desc");
}

/* -------------------- Find By Tracking Code (for admin search) -------------------- */
export async function findByTrackingCode(code) {
  return db("container_tracking_statuses as t")
    .select(
      "t.*",
      "c.container_no",
      "p.plan_date",
      "br.import_country",
      "br.entry_border",
      "br.exit_border",
      "br.packaging",
      "br.egg_type",
      "br.transport_type",
      "br.product_type",
      "br.container_amount",
      "br.cartons",
      "br.description",
      "br.preferred_supplier_name as supplier_name",
      "br.preferred_supplier_id as supplier_id",
      "u.name as supplier_user_name" // 👈 get from users table too
    )
    .leftJoin("farmer_plan_containers as c", "t.container_id", "c.id")
    .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
    .leftJoin("buyer_requests as br", "p.request_id", "br.id")
    .leftJoin("users as u", "br.preferred_supplier_id", "u.id")
    .where("t.tracking_code", code)
    .first()
    .then((row) => {
      if (!row) return null;
      return {
        ...row,
        supplier_name: row.supplier_name || row.supplier_user_name || null,
      };
    });
}
