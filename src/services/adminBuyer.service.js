import db from "../db/knex.js";
import { NotificationService } from "./notification.service.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

/* -------------------- Buyer Requests -------------------- */
export async function getBuyerRequests() {
  const rows = await db("buyer_requests as br")
    .leftJoin("users as u", "br.buyer_id", "u.id")
    .leftJoin("users as s", "br.preferred_supplier_id", "s.id")
    .select(
      "br.*",
      "u.name as buyer_name",
      "u.email as buyer_email",
      "u.mobile as buyer_mobile",
      "s.name as supplier_name",
      "s.mobile as supplier_mobile",
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
    // Buyer of the request
    .leftJoin("users as u", "br.buyer_id", "u.id")
    // Preferred supplier (optional)
    .leftJoin("users as s", "br.preferred_supplier_id", "s.id")
    // ✅ Creator of the request (admin/manager/user who created it)
    .leftJoin("users as c", "br.creator_id", "c.id")
    .select(
      "br.*",

      // Buyer (request owner)
      "u.name as buyer_name",
      "u.email as buyer_email",
      "u.mobile as buyer_mobile",

      // Preferred supplier
      "s.name as supplier_name",
      "s.mobile as supplier_mobile",

      // ✅ Creator fields
      "c.id as created_by_user_id",
      "c.name as created_by_name",
      "c.email as created_by_email",
      "c.mobile as created_by_mobile",
    )
    .where("br.id", id)
    .first();

  if (!row) return null;

  const normalized = normalizeRequest(row);
  normalized.farmer_plans = await getPlansWithContainers(row.id);
  normalized.assigned_suppliers = await getAssignedSuppliers(row.id);

  return normalized;
}

/* -------------------- Review Buyer Request -------------------- */
export async function reviewBuyerRequest(
  id,
  { status, final_status, farmer_status, reviewerId },
) {
  const oldRequest = await db("buyer_requests").where("id", id).first();
  if (!oldRequest) throw new Error("Request not found");

  const [updated] = await db("buyer_requests")
    .where({ id })
    .update({
      status,
      final_status: final_status ?? oldRequest.final_status,
      farmer_status: farmer_status ?? oldRequest.farmer_status,
      reviewed_by: reviewerId,
      reviewed_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
    .returning("*");

  if (!updated) return null;

  const normalized = normalizeRequest(updated);

  /* -------------------- 🔔 NOTIFICATION LOGIC -------------------- */

  // 1️⃣ If status → 'accepted' → Notify supplier + buyer + managers
  if (status === "accepted" && oldRequest.status !== "accepted") {
    const supplierId = updated.preferred_supplier_id;

    // ✅ Notify supplier
    if (supplierId) {
      await NotificationService.create(supplierId, "request_accepted", id, {
        buyerName: normalized.buyer_name || "Buyer",
      });
    }

    // ✅ Notify buyer
    if (updated.buyer_id) {
      await NotificationService.create(updated.buyer_id, "status_updated", id, {
        status: "accepted",
        message: `درخواست شما با شناسه ${id} توسط ادمین تأیید شد ✅`,
      });
    }

    // ✅ Notify all managers
    const managers = await db("users")
      .join("user_roles", "users.id", "user_roles.user_id")
      .join("roles", "user_roles.role_id", "roles.id")
      .whereRaw("LOWER(roles.name) = 'manager'")
      .where("users.status", "active")
      .select("users.id");

    for (const m of managers) {
      await NotificationService.create(m.id, "status_updated", id, {
        status: "accepted",
        message: `درخواست #${id} توسط ادمین تأیید و به تامین‌کننده ارسال شد.`,
      });
    }
  }

  // 2️⃣ If final_status → 'completed' → Notify buyer + manager
  if (final_status === "completed" && oldRequest.final_status !== "completed") {
    const notificationData = {
      final_status: "completed",
      message: `درخواست با شناسه ${id} با موفقیت تکمیل شد ✅`,
    };

    // ✅ Notify Buyer
    if (updated.buyer_id) {
      await NotificationService.create(
        updated.buyer_id,
        "status_updated",
        id,
        notificationData,
      );
    }

    // ✅ Notify Managers
    const managers = await db("users")
      .join("user_roles", "users.id", "user_roles.user_id")
      .join("roles", "user_roles.role_id", "roles.id")
      .whereRaw("LOWER(roles.name) = 'manager'")
      .where("users.status", "active")
      .select("users.id");

    for (const m of managers) {
      await NotificationService.create(
        m.id,
        "status_updated",
        id,
        notificationData,
      );
    }
  }

  return normalized;
}

/* -------------------- Assign Suppliers -------------------- */
export async function assignSuppliersToRequest(
  requestId,
  supplierIds,
  reviewerId,
) {
  if (!Array.isArray(supplierIds) || supplierIds.length === 0) {
    throw new Error("لیست تامین‌کنندگان الزامی است.");
  }

  const request = await db("buyer_requests").where({ id: requestId }).first();
  if (!request) throw new Error("درخواست یافت نشد.");

  const validSuppliers = await db("users")
    .whereIn("id", supplierIds)
    .andWhere("status", "active");

  if (validSuppliers.length !== supplierIds.length) {
    throw new Error("برخی از تامین‌کنندگان معتبر یا فعال نیستند.");
  }

  await db("buyer_request_suppliers")
    .where({ buyer_request_id: requestId })
    .del();

  const inserted = await db("buyer_request_suppliers")
    .insert(
      supplierIds.map((sid) => ({
        buyer_request_id: requestId,
        supplier_id: sid,
        assigned_by: reviewerId,
      })),
    )
    .returning("*");

  await db("buyer_requests").where({ id: requestId }).update({
    preferred_supplier_id: supplierIds[0],
    updated_at: db.fn.now(),
  });

  // 🔔 Notify newly assigned suppliers
  for (const sid of supplierIds) {
    await NotificationService.create(sid, "new_request", requestId, {
      message: `درخواست جدیدی (#${requestId}) به شما تخصیص داده شد.`,
    });
  }

  // 🔔 Notify buyer
  if (request.buyer_id) {
    await NotificationService.create(
      request.buyer_id,
      "status_updated",
      requestId,
      {
        message: `درخواست شما (#${requestId}) به تامین‌کنندگان تخصیص داده شد.`,
      },
    );
  }

  // 🔔 Notify managers
  const managers = await db("users")
    .join("user_roles", "users.id", "user_roles.user_id")
    .join("roles", "user_roles.role_id", "roles.id")
    .whereRaw("LOWER(roles.name) = 'manager'")
    .where("users.status", "active")
    .select("users.id");

  for (const m of managers) {
    await NotificationService.create(m.id, "status_updated", requestId, {
      message: `درخواست #${requestId} توسط ادمین به تامین‌کنندگان تخصیص داده شد.`,
    });
  }

  return inserted;
}

/* -------------------- Update deadline -------------------- */
/* -------------------- Update deadline (supports start/end) -------------------- */
export async function updateBuyerRequestDeadline(requestId, data, updatedBy) {
  const { new_deadline_start, new_deadline_end, new_deadline_date } = data;

  // 🧩 Validate input
  if (!new_deadline_start && !new_deadline_end && !new_deadline_date) {
    throw new Error("حداقل یکی از تاریخ‌های جدید الزامی است.");
  }

  const request = await db("buyer_requests").where({ id: requestId }).first();
  if (!request) throw new Error("Buyer request not found");

  if (["accepted", "rejected"].includes(request.status)) {
    throw new Error("Cannot change deadline after review");
  }

  // 🧠 Build update object dynamically
  const updateData = {
    updated_at: db.fn.now(),
  };

  if (new_deadline_start) updateData.deadline_start_date = new_deadline_start;
  if (new_deadline_end) updateData.deadline_end_date = new_deadline_end;

  // 🧱 Backward compatibility: legacy field
  if (new_deadline_date && !new_deadline_start && !new_deadline_end) {
    updateData.deadline_date = new_deadline_date;
  }

  // ⚙️ Update database
  const [updated] = await db("buyer_requests")
    .where({ id: requestId })
    .update(updateData)
    .returning("*");

  if (!updated) throw new Error("Update failed");

  // 🔔 Notifications
  const notifications = [];

  const readableDates = [];
  if (updateData.deadline_start_date)
    readableDates.push(`شروع: ${updateData.deadline_start_date}`);
  if (updateData.deadline_end_date)
    readableDates.push(`پایان: ${updateData.deadline_end_date}`);

  const formattedMsg =
    readableDates.length > 0
      ? `بازه تحویل جدید (${readableDates.join(" / ")}) تنظیم شد.`
      : `تاریخ تحویل جدید (${new_deadline_date}) تنظیم شد.`;

  if (request.buyer_id) {
    notifications.push(
      NotificationService.create(
        request.buyer_id,
        "status_updated",
        requestId,
        { message: formattedMsg },
      ),
    );
  }

  if (request.preferred_supplier_id) {
    notifications.push(
      NotificationService.create(
        request.preferred_supplier_id,
        "status_updated",
        requestId,
        { message: formattedMsg },
      ),
    );
  }

  const managers = await db("users")
    .join("user_roles", "users.id", "user_roles.user_id")
    .join("roles", "user_roles.role_id", "roles.id")
    .whereRaw("LOWER(roles.name) = 'manager'")
    .where("users.status", "active")
    .select("users.id");

  for (const m of managers) {
    notifications.push(
      NotificationService.create(m.id, "status_updated", requestId, {
        message: `ادمین بازه تحویل درخواست #${requestId} را تغییر داد: ${formattedMsg}`,
      }),
    );
  }

  await Promise.allSettled(notifications);

  return updated;
}

/* -------------------- Fetch Assigned Suppliers -------------------- */
export async function getAssignedSuppliers(requestId) {
  const rows = await db("buyer_request_suppliers as brs")
    .leftJoin("users as u", "brs.supplier_id", "u.id")
    .select(
      "brs.*",
      "u.name as supplier_name",
      "u.email as supplier_email",
      "u.mobile as supplier_mobile",
    )
    .where("brs.buyer_request_id", requestId)
    .orderBy("brs.id", "asc");

  return rows;
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
