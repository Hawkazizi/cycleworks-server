import db from "../db/knex.js";
import { NotificationService } from "./notification.service.js";
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

/* -------------------- Add Tracking Status -------------------- */
export async function addTracking({
  containerId,
  status,
  note,
  createdBy,
  tracking_code,
}) {
  // 🔍 Step 1: Find existing TY code for this container (always reuse if exists)
  const existingRows = await db("container_tracking_statuses")
    .where({ container_id: containerId })
    .orderBy("created_at", "asc");

  let finalTrackingCode = tracking_code?.trim();

  if (existingRows.length > 0 && existingRows[0].tracking_code) {
    // ✅ Container already has a TY → always reuse it
    finalTrackingCode = existingRows[0].tracking_code;
  } else {
    // 🆕 First time — must have a TY provided or generate one
    if (!finalTrackingCode) {
      finalTrackingCode = await generateTrackingCode(containerId);
    }

    // 🚫 Ensure TY not already used by another container
    const conflict = await db("container_tracking_statuses")
      .where({ tracking_code: finalTrackingCode })
      .andWhereNot({ container_id: containerId })
      .first();

    if (conflict) {
      throw new Error("This TY number already belongs to another container");
    }
  }

  // 🔒 Step 2: Avoid inserting the exact same row again
  const duplicate = await db("container_tracking_statuses")
    .where({
      container_id: containerId,
      tracking_code: finalTrackingCode,
      status,
      note,
    })
    .first();

  if (duplicate) {
    console.log("⚠️ Duplicate tracking skipped:", duplicate.id);
    return duplicate;
  }

  // ✅ Step 3: Safe insert of the new tracking record
  const [inserted] = await db("container_tracking_statuses")
    .insert({
      container_id: containerId,
      status,
      note,
      created_by: createdBy,
      tracking_code: finalTrackingCode,
    })
    .returning("*");

  // 🧠 Step 4: Notify admins and buyer (same logic as before)
  const related = await db("farmer_plan_containers as c")
    .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
    .leftJoin("buyer_requests as br", "p.request_id", "br.id")
    .select("br.id as request_id", "br.buyer_id")
    .where("c.id", containerId)
    .first();

  const relatedRequestId = related?.request_id || null;
  const buyerId = related?.buyer_id || null;

  const adminManagers = await db("users")
    .join("user_roles", "users.id", "user_roles.user_id")
    .join("roles", "user_roles.role_id", "roles.id")
    .whereIn(db.raw("LOWER(roles.name)"), ["admin", "manager"])
    .where("users.status", "active")
    .distinct()
    .select("users.id");

  const notificationData = {
    containerId,
    tracking_code: finalTrackingCode,
    status,
    note,
  };

  const notificationPromises = [];

  for (const am of adminManagers) {
    notificationPromises.push(
      NotificationService.create(
        am.id,
        "status_updated",
        relatedRequestId,
        notificationData,
      ),
    );
  }

  if (buyerId) {
    notificationPromises.push(
      NotificationService.create(buyerId, "status_updated", relatedRequestId, {
        ...notificationData,
        message: `وضعیت جدید برای کانتینر درخواست شما (#${relatedRequestId}) ثبت شد.`,
      }),
    );
  }

  await Promise.allSettled(notificationPromises);

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
      "u.name as supplier_user_name", // 👈 get from users table too
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

/* -------------------- Update TY Number (User / Admin) -------------------- */
/* -------------------- Update TY Number (User / Admin / Manager) -------------------- */
export async function updateTyNumber(containerId, tyNumber, userId, role) {
  if (!containerId) throw new Error("Container ID is required");
  if (!tyNumber) throw new Error("TY number cannot be empty");

  // Validate container existence
  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();

  if (!container) throw new Error("Container not found");

  // Role check: if user, ensure they own the container
  if (role === "user") {
    const plan = await db("farmer_plans")
      .where({ id: container.plan_id, farmer_id: userId })
      .first();
    if (!plan) throw new Error("Unauthorized: container not owned by user");
  }

  // 🧠 Check if tracking already exists
  const existing = await db("container_tracking_statuses")
    .where({ container_id: containerId })
    .orderBy("created_at", "asc")
    .first();

  if (existing) {
    // ✅ Update the first tracking record’s code
    await db("container_tracking_statuses").where({ id: existing.id }).update({
      tracking_code: tyNumber,
      note: "TY number updated manually",
      created_at: db.fn.now(),
    });
  } else {
    // 🆕 Create a new tracking record if none exists
    await db("container_tracking_statuses").insert({
      container_id: containerId,
      status: "ty_assigned",
      note: "TY number assigned",
      tracking_code: tyNumber,
      created_by: userId,
    });
  }

  return { success: true, message: "TY number updated successfully" };
}
