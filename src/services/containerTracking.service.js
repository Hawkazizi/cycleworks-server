// services/containerTracking.service.js
import db from "../db/knex.js";

/* =======================================================================
   🔢 HELPER: Generate Unique Tracking Code
======================================================================= */
export async function generateTrackingCode(containerId) {
  const info = await db("farmer_plan_containers as c")
    .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
    .leftJoin("buyer_requests as br", "p.request_id", "br.id")
    .select("br.import_country", "c.metadata")
    .where("c.id", containerId)
    .first();

  if (!info) throw new Error("Container or buyer request not found");

  const prefixMap = { Qatar: "Q12-", Oman: "O12-", Bahrain: "B12-" };
  const prefix = prefixMap[info.import_country] || "X12-";
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();

  return `${prefix}${randomPart}`;
}

/* =======================================================================
   🧭 ADD TRACKING STATUS
======================================================================= */
export async function addTracking(
  containerId,
  userId,
  status,
  tracking_code,
  note,
) {
  // Check for existing record
  const existing = await db("container_tracking_statuses")
    .where({ container_id: containerId, tracking_code: tracking_code || null })
    .first();

  if (existing) {
    await db("container_tracking_statuses").where({ id: existing.id }).update({
      status,
      note,
      updated_at: db.fn.now(),
    });

    return {
      updated: true,
      message: `Tracking code "${tracking_code}" updated successfully`,
    };
  }

  // Insert new tracking record
  await db("container_tracking_statuses").insert({
    container_id: containerId,
    status,
    note,
    tracking_code: tracking_code || null,
    created_by: userId,
  });

  return { created: true, message: "Tracking status added successfully" };
}

/* =======================================================================
   📋 LIST TRACKING HISTORY
======================================================================= */
export async function listTracking(containerId) {
  return db("container_tracking_statuses")
    .where({ container_id: containerId })
    .orderBy("created_at", "desc");
}

/* =======================================================================
   🔍 FIND BY TY CODE
======================================================================= */
export async function findByTrackingCode(code) {
  const row = await db("container_tracking_statuses as t")
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
      "u.name as supplier_user_name",
    )
    .leftJoin("farmer_plan_containers as c", "t.container_id", "c.id")
    .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
    .leftJoin("buyer_requests as br", "p.request_id", "br.id")
    .leftJoin("users as u", "br.preferred_supplier_id", "u.id")
    .whereRaw("LOWER(t.tracking_code) = LOWER(?)", [code])
    .first();

  if (!row) return null;

  return {
    ...row,
    supplier_name: row.supplier_name || row.supplier_user_name || null,
    tracking_info: {
      code: row.tracking_code,
      status: row.status,
      note: row.note,
      created_at: row.created_at,
    },
  };
}

/* =======================================================================
   ✏️ UPDATE TY NUMBER (pure DB logic)
======================================================================= */
export async function updateTyNumber(containerId, tyNumber, userId) {
  // Ensure unique constraint handled properly
  await db("container_tracking_statuses")
    .insert({
      container_id: containerId,
      status: "TY Number Assigned",
      tracking_code: tyNumber,
      created_by: userId,
    })
    .onConflict(["container_id", "tracking_code"])
    .ignore();

  // Update metadata in farmer_plan_containers
  await db("farmer_plan_containers")
    .where({ id: containerId })
    .update({
      metadata: db.raw("jsonb_set(metadata, '{tracking_code}', ?::jsonb)", [
        `"${tyNumber}"`,
      ]),
    });

  return { success: true, message: "TY number recorded successfully" };
}
