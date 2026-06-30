import db from "../../common/db/knex.js";
import { NotificationService } from "../notification/notification.service.js";
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
  // 1️⃣ Check for existing record (by container_id + tracking_code)
  const existing = await db("container_tracking_statuses")
    .where({ container_id: containerId, tracking_code: tracking_code || null })
    .first();

  let actionType = "created";

  if (existing) {
    await db("container_tracking_statuses").where({ id: existing.id }).update({
      status,
      note,
      updated_at: db.fn.now(),
    });

    actionType = "updated";
  } else {
    await db("container_tracking_statuses").insert({
      container_id: containerId,
      status,
      note,
      tracking_code: tracking_code || null,
      created_by: userId,
    });
  }

  // 2️⃣ Fetch related info
  const container = await db("farmer_plan_containers as c")
    .leftJoin("farmer_plans as p", "p.id", "c.plan_id")
    .leftJoin("buyer_requests as br", "br.id", "p.request_id")
    .leftJoin("users as u", "c.supplier_id", "u.id")
    .where("c.id", containerId)
    .select(
      "c.id as container_id",
      "c.supplier_id",
      "u.name as supplier_name",
      "br.buyer_id",
    )
    .first();

  if (!container) {
    return { message: "Tracking saved, but container info not found" };
  }

  // 3️⃣ Build readable Persian status
  let readableStatus = "به‌روزرسانی‌شده";
  if (status === "in_progress") readableStatus = "در حال انجام";
  else if (status === "completed") readableStatus = "خاتمه یافته";
  else if (status === "rejected") readableStatus = "رد شده";
  else if (status === "submitted") readableStatus = "ارسال شده برای بررسی";

  // 4️⃣ Prepare notification data
  const data = {
    containerId,
    supplierName: container.supplier_name || "تأمین‌کننده ناشناس",
    status,
    readableStatus,
    note: note || null,
    tracking_code: tracking_code || null,
  };

  // 5️⃣ Find all active admins/managers
  const adminManagers = await db("users")
    .join("user_roles", "users.id", "user_roles.user_id")
    .join("roles", "user_roles.role_id", "roles.id")
    .whereRaw("LOWER(roles.name) IN ('admin','manager')")
    .where("users.status", "active")
    .distinct()
    .select("users.id");

  // 6️⃣ Send notifications
  const promises = [];

  // 🔔 Notify admins/managers
  for (const am of adminManagers) {
    promises.push(
      NotificationService.create(
        am.id,
        "container_tracking_status_changed",
        containerId,
        data,
      ),
    );
  }

  // 🚚 Optionally notify buyer
  if (container.buyer_id) {
    promises.push(
      NotificationService.create(
        container.buyer_id,
        "container_tracking_update",
        containerId,
        data,
      ),
    );
  }

  await Promise.allSettled(promises);

  // 7️⃣ Return response
  return {
    [actionType]: true,
    message:
      actionType === "updated"
        ? `وضعیت رهگیری با کد "${tracking_code}" با موفقیت به‌روزرسانی شد.`
        : "وضعیت جدید برای کانتینر با موفقیت ثبت شد.",
  };
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
  // ✅ 1. Add a history record in tracking statuses
  await db("container_tracking_statuses")
    .insert({
      container_id: containerId,
      status: "TY Number Assigned",
      tracking_code: tyNumber,
      created_by: userId,
    })
    .onConflict(["container_id", "tracking_code"])
    .ignore();

  // ✅ 2. Update main tracking_code and metadata (both ty_number & tracking_code)
  await db("farmer_plan_containers")
    .where({ id: containerId })
    .update({
      tracking_code: tyNumber, // main column
      metadata: db.raw(
        `
        jsonb_set(
          jsonb_set(
            jsonb_set(
              coalesce(metadata, '{}'::jsonb),
              '{ty_number}', to_jsonb(?::text)
            ),
            '{tracking_code}', to_jsonb(?::text)
          ),
          '{updated_at}', to_jsonb(now()::text)
        )
      `,
        [tyNumber, tyNumber],
      ),
      updated_at: db.fn.now(),
    });

  return {
    success: true,
    message: "TY number and tracking code updated successfully",
  };
}

/* =======================================================================
   ✏️ CONTAINER WORKFLOW
======================================================================= */

export const resolveContainerWorkflow = async (containerId) => {
  /* --------------------------------------------------
     1. Base container (ROOT OF TRUTH)
  -------------------------------------------------- */
  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();

  if (!container) return null;

  /* --------------------------------------------------
     2. Admin review (initial)
  -------------------------------------------------- */
  if (container.is_rejected) {
    return response(containerId, "ADMIN_REJECTED", "ADMIN", "REJECTED");
  }

  // if (!container.reviewed_at) {
  //   return response(containerId, "ADMIN_REVIEW", "ADMIN", "PENDING");
  // }

  /* --------------------------------------------------
     3. Supplier decision
  -------------------------------------------------- */
  if (!container.supplier_id) {
    return response(containerId, "SUPPLIER_DECISION", "SUPPLIER", "PENDING");
  }

  if (container.farmer_status === "rejected") {
    return response(containerId, "SUPPLIER_REJECTED", "SUPPLIER", "REJECTED");
  }

  /* --------------------------------------------------
     4. Supplier files
  -------------------------------------------------- */
  const files = await db("farmer_plan_files").where({
    container_id: containerId,
  });

  if (!files.length) {
    return response(containerId, "SUPPLIER_FILES", "SUPPLIER", "PENDING");
  }

  const unreviewedFiles = files.some((f) => f.status === "submitted");

  if (unreviewedFiles) {
    return response(containerId, "ADMIN_FILES_REVIEW", "ADMIN", "PENDING");
  }

  /* --------------------------------------------------
     5. Internal QC
  -------------------------------------------------- */
  if (container.qc_status === "pending") {
    return response(containerId, "INTERNAL_QC", "INTERNAL_QC", "PENDING");
  }

  if (container.qc_status === "hold") {
    const holdCount = await db("internal_qc_hold_resolutions")
      .where({ container_id: containerId })
      .count("id as count")
      .first();

    return response(containerId, "INTERNAL_QC_HOLD", "ADMIN", "HOLD", {
      reason: container.qc_hold_reason,
      details: container.qc_hold_details,
      loop_count: Number(holdCount.count),
    });
  }

  /* --------------------------------------------------
     6. External QC
  -------------------------------------------------- */
  const externalQc = await db("external_qc_reports")
    .where({ container_id: containerId })
    .first();

  if (!externalQc) {
    return response(containerId, "EXTERNAL_QC", "EXTERNAL_QC", "PENDING");
  }

  /* --------------------------------------------------
     7. Completed
  -------------------------------------------------- */
  return response(containerId, "COMPLETED", "EXTERNAL_QC", "REPORTED", {
    reported_at: externalQc.confirmed_at,
  });
};

/* --------------------------------------------------
   Helper
-------------------------------------------------- */
const response = (containerId, stage, actor, status, details = {}) => ({
  container_id: containerId,
  stage,
  actor,
  status,
  details,
});
