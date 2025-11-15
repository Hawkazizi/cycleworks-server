import db from "../db/knex.js";
import { NotificationService } from "./notification.service.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

/* =======================================================================
   📦 BUYER REQUEST MANAGEMENT (ADMIN / MANAGER)
======================================================================= */
/** 📋 Get all buyer requests (with supplier + plans + assigned suppliers + creator) */
export async function getBuyerRequests() {
  const rows = await db("buyer_requests as br")
    // 🔹 Join buyer (assigned customer)
    .leftJoin("users as buyer", "br.buyer_id", "buyer.id")
    // 🔹 Join creator (operator)
    .leftJoin("users as creator", "br.creator_id", "creator.id")
    // 🔹 Join preferred supplier
    .leftJoin("users as supplier", "br.preferred_supplier_id", "supplier.id")
    .select(
      "br.id",
      "br.status",
      "br.expiration_date",
      "br.expiration_days",
      "br.deadline_start",
      "br.deadline_end",
      "br.transport_type",
      "br.product_type",
      "br.import_country",
      "br.entry_border",
      "br.exit_border",
      "br.packaging",
      "br.egg_type",
      "br.cartons",
      "br.container_amount",
      "br.description",
      "br.created_at",

      // 🔹 Buyer (assigned customer)
      "buyer.id as buyer_id",
      "buyer.name as buyer_name",
      "buyer.email as buyer_email",
      "buyer.mobile as buyer_mobile",

      // 🔹 Creator (operator)
      "creator.id as creator_id",
      "creator.name as creator_name",
      "creator.email as creator_email",
      "creator.mobile as creator_mobile",

      // 🔹 Supplier
      "supplier.id as supplier_id",
      "supplier.name as supplier_name",
      "supplier.mobile as supplier_mobile",
    )
    .orderBy("br.created_at", "desc");

  const results = [];
  for (const row of rows) {
    // Normalize the request
    const normalized = normalizeRequest(row);

    // Attach related data
    normalized.farmer_plans = await getPlansWithContainers(row.id);
    normalized.assigned_suppliers = await getAssignedSuppliers(row.id);

    // 🔹 Optional: clear distinction between creator and buyer
    normalized.creator = {
      id: row.creator_id,
      name: row.creator_name,
      email: row.creator_email,
      mobile: row.creator_mobile,
    };
    normalized.buyer = {
      id: row.buyer_id,
      name: row.buyer_name,
      email: row.buyer_email,
      mobile: row.buyer_mobile,
    };
    normalized.supplier = {
      id: row.supplier_id,
      name: row.supplier_name,
      mobile: row.supplier_mobile,
    };

    results.push(normalized);
  }

  return results;
}

/** 🔍 Get a single buyer request by ID (with all details) */
export async function getBuyerRequestById(id) {
  const row = await db("buyer_requests as br")
    .leftJoin("users as buyer", "br.buyer_id", "buyer.id")
    .leftJoin("users as supplier", "br.preferred_supplier_id", "supplier.id")
    .leftJoin("users as creator", "br.creator_id", "creator.id")
    .select(
      "br.*",
      "buyer.name as buyer_name",
      "buyer.email as buyer_email",
      "buyer.mobile as buyer_mobile",
      "supplier.name as supplier_name",
      "supplier.mobile as supplier_mobile",
      "creator.id as created_by_user_id",
      "creator.name as created_by_name",
      "creator.email as created_by_email",
      "creator.mobile as created_by_mobile",
    )
    .where("br.id", id)
    .first();

  if (!row) return null;

  const normalized = normalizeRequest(row);
  normalized.farmer_plans = await getPlansWithContainers(row.id);
  normalized.assigned_suppliers = await getAssignedSuppliers(row.id);

  return normalized;
}

/* =======================================================================
   ✅ REVIEW / APPROVAL
======================================================================= */
/** ✏️ Review a buyer request (status, final status, farmer status) */
export async function reviewBuyerRequest(
  id,
  { status, final_status, farmer_status, reviewerId },
) {
  // 1️⃣ Validate request
  const oldRequest = await db("buyer_requests").where("id", id).first();
  if (!oldRequest) throw new Error("Request not found");

  // 2️⃣ Update request status
  const [updated] = await db("buyer_requests")
    .where({ id })
    .update({
      status,
      reviewed_by: reviewerId,
      reviewed_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
    .returning("*");

  if (!updated) return null;

  const normalized = normalizeRequest(updated);

  // 3️⃣ Notify the related buyer (customer)
  try {
    const buyerId = updated.buyer_id;
    if (buyerId) {
      const readableStatus = (() => {
        switch (status) {
          case "approved":
          case "accepted":
            return "تأیید شده";
          case "rejected":
            return "رد شده";
          case "completed":
            return "خاتمه یافته";
          case "pending":
            return "در انتظار بررسی";
          default:
            return status || "به‌روزرسانی‌شده";
        }
      })();

      await NotificationService.create(
        buyerId,
        "request_status_changed", // ✅ already handled in NotificationService
        id, // related_request_id
        {
          status,
          final_status,
          readableStatus,
          reviewed_by: reviewerId,
        },
      );
    }
  } catch (notifyErr) {
    console.error("❌ Buyer notification error:", notifyErr.message);
  }

  // 4️⃣ Notify admins/managers (optional)
  try {
    const adminManagers = await db("users")
      .join("user_roles", "users.id", "user_roles.user_id")
      .join("roles", "user_roles.role_id", "roles.id")
      .whereRaw("LOWER(roles.name) IN ('admin','manager')")
      .where("users.status", "active")
      .distinct()
      .select("users.id");

    const promises = adminManagers.map((am) =>
      NotificationService.create(am.id, "buyer_request_reviewed", id, {
        buyer_id: updated.buyer_id,
        status,
        final_status,
        readableStatus: status,
      }),
    );

    await Promise.allSettled(promises);
  } catch (adminErr) {
    console.error("❌ Admin notification error:", adminErr.message);
  }

  return normalized;
}

/* =======================================================================
   🧑‍🤝‍🧑 SUPPLIER ASSIGNMENT
======================================================================= */

/** 🧭 Assign suppliers to a buyer request */
export async function assignSuppliersToRequest(
  requestId,
  supplierIds,
  reviewerId,
) {
  if (!Array.isArray(supplierIds) || supplierIds.length === 0)
    throw new Error("لیست تامین‌کنندگان الزامی است.");

  const request = await db("buyer_requests").where({ id: requestId }).first();
  if (!request) throw new Error("درخواست یافت نشد.");

  const validSuppliers = await db("users")
    .whereIn("id", supplierIds)
    .andWhere("status", "active");

  if (validSuppliers.length !== supplierIds.length)
    throw new Error("برخی از تامین‌کنندگان معتبر یا فعال نیستند.");

  await db("buyer_request_suppliers")
    .where({ buyer_request_id: requestId })
    .del();

  const inserted = [];
  for (const sid of supplierIds) {
    const [record] = await db("buyer_request_suppliers")
      .insert({
        buyer_request_id: requestId,
        supplier_id: sid,
        assigned_by: reviewerId,
        assigned_at: new Date(),
      })
      .onConflict(["buyer_request_id", "supplier_id"])
      .merge(["assigned_by", "assigned_at"])
      .returning("*");
    inserted.push(record);
  }

  await db("buyer_requests").where({ id: requestId }).update({
    preferred_supplier_id: supplierIds[0],
    updated_at: db.fn.now(),
  });

  // 🔔 Notify suppliers, buyer, and managers
  await notifyAssignments(requestId, request.buyer_id, supplierIds);

  return inserted;
}

/* =======================================================================
   🚚 CONTAINER ASSIGNMENT
======================================================================= */

export async function assignContainersToSuppliers(
  requestId,
  assignments,
  adminId,
) {
  if (!Array.isArray(assignments) || assignments.length === 0)
    throw new Error("لیست تخصیص کانتینر الزامی است.");

  return db.transaction(async (trx) => {
    const request = await trx("buyer_requests")
      .where({ id: requestId })
      .first();
    if (!request) throw new Error("درخواست یافت نشد.");

    // ✅ Filter out invalid/null supplier assignments
    const validAssignments = assignments.filter(
      (a) => a.supplier_id && a.container_id,
    );

    if (validAssignments.length === 0)
      throw new Error("هیچ کانتینر معتبری برای تخصیص وجود ندارد.");

    const supplierIds = [
      ...new Set(validAssignments.map((a) => a.supplier_id)),
    ];

    // ✅ Check that all suppliers are valid/active
    const validSuppliers = await trx("users")
      .whereIn("id", supplierIds)
      .andWhere("status", "active");

    if (validSuppliers.length !== supplierIds.length)
      throw new Error("برخی از تامین‌کنندگان معتبر یا فعال نیستند.");

    // ✅ Update containers and insert supplier history
    for (const { container_id, supplier_id } of validAssignments) {
      await trx("farmer_plan_containers")
        .where({ id: container_id })
        .update({ supplier_id, updated_at: db.fn.now() });

      await trx("buyer_request_suppliers")
        .insert({
          buyer_request_id: requestId,
          supplier_id,
          container_id,
          assigned_by: adminId,
          assigned_at: new Date(),
        })
        .onConflict(["buyer_request_id", "supplier_id", "container_id"])
        .merge({ assigned_by: adminId, assigned_at: new Date() });
    }

    // ✅ Remove any history rows with supplier_id = NULL (cleanup)
    await trx("buyer_request_suppliers")
      .where({ buyer_request_id: requestId })
      .whereNull("supplier_id")
      .del();

    // 🔔 Notify active suppliers
    for (const sid of supplierIds) {
      await NotificationService.create(
        sid,
        "container_assigned",
        requestId,
        {
          message: `تعدادی کانتینر جدید از درخواست #${requestId} به شما تخصیص یافت.`,
        },
        trx,
      );
    }

    return {
      success: true,
      message: "تخصیص کانتینرها با موفقیت انجام شد (بدون مقادیر NULL).",
    };
  });
}

/* =======================================================================
   ⏰ DEADLINE MANAGEMENT
======================================================================= */

/** 🗓️ Update buyer request deadlines */
export async function updateBuyerRequestDeadline(requestId, data, updatedBy) {
  const { new_deadline_start, new_deadline_end, new_deadline_date } = data;

  if (!new_deadline_start && !new_deadline_end && !new_deadline_date)
    throw new Error("حداقل یکی از تاریخ‌های جدید الزامی است.");

  const request = await db("buyer_requests").where({ id: requestId }).first();
  if (!request) throw new Error("Buyer request not found");
  if (["accepted", "rejected"].includes(request.status))
    throw new Error("Cannot change deadline after review");

  const updateData = { updated_at: db.fn.now() };
  if (new_deadline_start) updateData.deadline_start = new_deadline_start;
  if (new_deadline_end) updateData.deadline_end = new_deadline_end;
  if (new_deadline_date && !new_deadline_start && !new_deadline_end)
    updateData.deadline_start = new_deadline_date; // legacy fallback

  const [updated] = await db("buyer_requests")
    .where({ id: requestId })
    .update(updateData)
    .returning("*");

  if (!updated) throw new Error("Update failed");

  return updated;
}

/* =======================================================================
   📤 HELPERS
======================================================================= */

async function getAssignedSuppliers(requestId) {
  return db("buyer_request_suppliers as brs")
    .leftJoin("users as u", "brs.supplier_id", "u.id")
    .select(
      "brs.*",
      "u.name as supplier_name",
      "u.email as supplier_email",
      "u.mobile as supplier_mobile",
    )
    .where("brs.buyer_request_id", requestId)
    .orderBy("brs.id", "asc");
}

function safeParseJSON(value, fallback = []) {
  if (!value) return fallback;
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

/** 🔄 Hydrate plans → containers → files */
async function getPlansWithContainers(requestId) {
  // 🔹 Fetch plans — no more join with users
  const plans = await db("farmer_plans as fp")
    .select("fp.*")
    .where("fp.request_id", requestId)
    .orderBy("fp.plan_date", "asc");

  for (const plan of plans) {
    // ✅ Include buyer_requests (br) join through farmer_plans (fp)
    plan.containers = await db("farmer_plan_containers as c")
      .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
      .leftJoin("buyer_requests as br", "p.request_id", "br.id")
      .leftJoin("users as s", "c.supplier_id", "s.id") // supplier replaces farmer
      .select(
        "c.*",
        "s.name as supplier_name",
        "s.email as supplier_email",
        // ✅ Access buyer request fields
        "br.import_country",
        "br.egg_type",
        "br.cartons",
        "br.container_amount",
        // ✅ Optional admin metadata
        "c.admin_metadata",
        "c.admin_metadata_status",
        "c.admin_metadata_review_note",
      )
      .where("c.plan_id", plan.id)
      .orderBy("c.container_no", "asc");

    // 🔁 Attach file URLs to each container
    for (const container of plan.containers) {
      const files = await db("farmer_plan_files")
        .where({ container_id: container.id })
        .orderBy("created_at", "asc");

      container.files = files.map((f) => ({
        ...f,
        path:
          f.path?.startsWith("http") || !f.path
            ? f.path
            : `${BASE_URL}${f.path}`,
      }));
    }
  }

  return plans;
}

/* =======================================================================
   🔔 NOTIFICATION HELPERS
======================================================================= */

async function handleBuyerRequestNotifications(
  id,
  oldRequest,
  updated,
  normalized,
  status,
  final_status,
) {
  // 1️⃣ Request accepted
  if (status === "accepted" && oldRequest.status !== "accepted") {
    const supplierId = updated.preferred_supplier_id;

    if (supplierId)
      await NotificationService.create(supplierId, "request_accepted", id, {
        buyerName: normalized.buyer_name || "Buyer",
      });

    if (updated.buyer_id)
      await NotificationService.create(updated.buyer_id, "status_updated", id, {
        status: "accepted",
        message: `درخواست شما با شناسه ${id} توسط ادمین تأیید شد ✅`,
      });

    const managers = await getActiveManagers();
    for (const m of managers) {
      await NotificationService.create(m.id, "status_updated", id, {
        status: "accepted",
        message: `درخواست #${id} توسط ادمین تأیید و به تامین‌کننده ارسال شد.`,
      });
    }
  }

  // 2️⃣ Request completed
  if (status === "completed" && oldRequest.status !== "completed") {
    const notificationData = {
      final_status: "completed",
      message: `درخواست با شناسه ${id} با موفقیت تکمیل شد ✅`,
    };

    if (updated.buyer_id)
      await NotificationService.create(
        updated.buyer_id,
        "status_updated",
        id,
        notificationData,
      );

    const managers = await getActiveManagers();
    for (const m of managers) {
      await NotificationService.create(
        m.id,
        "status_updated",
        id,
        notificationData,
      );
    }
  }
}

async function notifyAssignments(requestId, buyerId, supplierIds) {
  // Suppliers
  for (const sid of supplierIds) {
    await NotificationService.create(sid, "buyer_request_assigned", requestId, {
      message: `درخواست جدیدی (#${requestId}) به شما تخصیص داده شد.`,
    });
  }

  // Buyer
  if (buyerId) {
    await NotificationService.create(
      buyerId,
      "buyer_request_updated",
      requestId,
      {
        message: `درخواست شما (#${requestId}) به تامین‌کنندگان تخصیص داده شد.`,
      },
    );
  }

  // Managers
  const managers = await getActiveManagers();
  for (const m of managers) {
    await NotificationService.create(m.id, "status_updated", requestId, {
      message: `درخواست #${requestId} توسط ادمین به تامین‌کنندگان تخصیص داده شد.`,
    });
  }
}

async function getActiveManagers() {
  return db("users")
    .join("user_roles", "users.id", "user_roles.user_id")
    .join("roles", "user_roles.role_id", "roles.id")
    .whereRaw("LOWER(roles.name) = 'manager'")
    .where("users.status", "active")
    .select("users.id");
}
