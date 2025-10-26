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

/* -------------------- Create Tracking Record + Notify -------------------- */
export async function addTracking({
  containerId,
  status,
  note,
  createdBy,
  tracking_code, // user-provided TY number
}) {
  // ✅ Use TY number if provided, otherwise fallback to generated code (optional)
  const finalTrackingCode =
    tracking_code && tracking_code.trim() !== ""
      ? tracking_code.trim()
      : await generateTrackingCode(containerId);

  // ✅ Prevent duplicate TY numbers
  const existing = await db("container_tracking_statuses")
    .where({ tracking_code: finalTrackingCode })
    .first();

  if (existing)
    throw new Error("This tracking code (TY number) already exists");

  // ✅ Insert tracking record
  const [inserted] = await db("container_tracking_statuses")
    .insert({
      container_id: containerId,
      status,
      note,
      created_by: createdBy,
      tracking_code: finalTrackingCode,
    })
    .returning("*");

  // ✅ Find related buyer request ID for notification context
  const related = await db("farmer_plan_containers as c")
    .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
    .leftJoin("buyer_requests as br", "p.request_id", "br.id")
    .select("br.id as request_id", "br.buyer_id")
    .where("c.id", containerId)
    .first();

  const relatedRequestId = related?.request_id || null;
  const buyerId = related?.buyer_id || null;

  // ✅ Notify Admins & Managers
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

  // 🟢 Notify Admins & Managers
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

  // 🟡 Notify Buyer (optional but useful)
  if (buyerId) {
    notificationPromises.push(
      NotificationService.create(buyerId, "status_updated", relatedRequestId, {
        ...notificationData,
        message: `وضعیت کانتینر جدید برای درخواست شما (#${relatedRequestId}) ثبت شد.`,
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
