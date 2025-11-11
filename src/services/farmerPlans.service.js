// services/farmerPlan.service.js
import db from "../db/knex.js";
import { NotificationService } from "../services/notification.service.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* =======================================================================
   🧾 FARMER PLANS
======================================================================= */

/**
 * Create a new farmer plan with N containers.
 * Validates request deadlines, container quotas, and replaces existing plan for same date.
 */
export async function createPlan({
  requestId,
  supplierId, // 🔹 renamed
  planDate,
  containerAmount,
}) {
  if (!DATE_RE.test(planDate))
    throw new Error("Invalid planDate format, must be YYYY-MM-DD");
  if (!containerAmount || containerAmount <= 0)
    throw new Error("Container amount must be positive");

  const buyerRequest = await db("buyer_requests")
    .where({ id: requestId })
    .first();
  if (!buyerRequest) throw new Error("Buyer request not found");

  return db.transaction(async (trx) => {
    // 1️⃣ Deadline window check
    let inWindow = true;
    if (buyerRequest.deadline_start_date && buyerRequest.deadline_end_date) {
      const [{ ok }] = await trx
        .raw(`SELECT (?::date BETWEEN ?::date AND ?::date) AS ok`, [
          planDate,
          buyerRequest.deadline_start_date,
          buyerRequest.deadline_end_date,
        ])
        .then((r) => r.rows);
      inWindow = ok;
    }
    if (!inWindow) throw new Error("Plan date is outside the allowed period");

    // 2️⃣ Quota check
    const { cnt: usedRaw } = await trx("farmer_plan_containers as c")
      .join("farmer_plans as p", "p.id", "c.plan_id")
      .where("p.request_id", requestId)
      .count("* as cnt")
      .first();

    const used = Number(usedRaw || 0);
    const total = Number(buyerRequest.container_amount || 0);
    if (used + containerAmount > total) {
      throw new Error(`Exceeded container quota of ${total} (used ${used}).`);
    }

    // 3️⃣ Remove existing plan for same date (no farmer_id filter now)
    const existing = await trx("farmer_plans")
      .where({ request_id: requestId, plan_date: planDate })
      .first();

    if (existing) {
      await trx("farmer_plan_files")
        .whereIn(
          "container_id",
          trx("farmer_plan_containers")
            .select("id")
            .where({ plan_id: existing.id }),
        )
        .del();
      await trx("farmer_plan_containers").where({ plan_id: existing.id }).del();
      await trx("farmer_plans").where({ id: existing.id }).del();
    }

    // 4️⃣ Create new plan (no farmer_id column anymore)
    const [plan] = await trx("farmer_plans")
      .insert({
        request_id: requestId,
        plan_date: planDate,
        status: "submitted",
      })
      .returning("*");

    // 5️⃣ Insert containers
    const containers = [];
    for (let i = 1; i <= containerAmount; i++) {
      const [c] = await trx("farmer_plan_containers")
        .insert({
          plan_id: plan.id,
          container_no: i,
          supplier_id: supplierId,
          status: "submitted",
        })
        .returning("*");
      containers.push(c);
    }

    // 6️⃣ Auto-accept buyer request (first plan trigger)
    const [{ count }] = await trx("farmer_plans")
      .where({ request_id: requestId })
      .count("* as count");

    if (Number(count) === 1) {
      await trx("buyer_requests")
        .where({ id: requestId })
        .update({ status: "accepted", updated_at: db.fn.now() });
    }

    plan.containers = containers;
    return plan;
  });
}

/**
 * List all plans (and containers) for a specific buyer request & farmer.
 * Returns total/used/remaining quotas and attached file metadata.
 */
export async function listPlansWithContainers(requestId) {
  const plans = await db("farmer_plans")
    .select(
      "id",
      "request_id",
      db.raw("to_char(plan_date, 'YYYY-MM-DD') as plan_date"),
      "status",
      "reviewed_by",
      "reviewed_at",
      "created_at",
      "updated_at",
    )
    .where({ request_id: requestId })
    .orderBy("plan_date", "asc");

  const buyerRequest = await db("buyer_requests")
    .where({ id: requestId })
    .first();

  const { cnt: usedRaw } = await db("farmer_plan_containers as c")
    .join("farmer_plans as p", "p.id", "c.plan_id")
    .where("p.request_id", requestId)
    .count("* as cnt")
    .first();

  const used = Number(usedRaw || 0);
  const total = Number(buyerRequest?.container_amount || 0);
  const remaining = Math.max(0, total - used);

  for (const plan of plans) {
    const containers = await db("farmer_plan_containers")
      .where({ plan_id: plan.id })
      .orderBy("container_no", "asc");

    for (const container of containers) {
      container.files = await db("farmer_plan_files")
        .where({ container_id: container.id })
        .orderBy("created_at", "asc");
    }

    plan.containers = containers;
  }

  return {
    plans,
    used_quota: used,
    remaining_quota: remaining,
    total_quota: total,
  };
}

/**
 * Save the selected plan date for a container (only once)
 */
export async function setContainerPlanDate(containerId, planDate, userId) {
  if (!planDate) throw new Error("Missing plan date");

  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();

  if (!container) throw new Error("Container not found");
  if (container.plan_date) throw new Error("Plan date already selected");
  if (container.supplier_id !== userId)
    throw new Error("Not authorized to set this container plan date");

  // 🔎 Verify within allowed deadline range
  const buyerRequest = await db("buyer_requests")
    .where({ id: container.buyer_request_id })
    .first();

  if (buyerRequest?.deadline_start && buyerRequest?.deadline_end) {
    const d = new Date(planDate);
    const start = new Date(buyerRequest.deadline_start);
    const end = new Date(buyerRequest.deadline_end);
    if (d < start || d > end)
      throw new Error("Selected date is outside allowed deadline range");
  }

  // ✅ Update container plan_date
  await db("farmer_plan_containers").where({ id: containerId }).update({
    plan_date: planDate,
    updated_at: db.fn.now(),
  });

  // 👤 Fetch supplier name
  const supplier = await db("users").where({ id: userId }).first();

  // 👥 Find all active admins/managers
  const adminManagers = await db("users")
    .join("user_roles", "users.id", "user_roles.user_id")
    .join("roles", "user_roles.role_id", "roles.id")
    .whereIn("roles.name", ["admin", "manager"])
    .where("users.status", "active")
    .select("users.id");

  // 🔔 Send a friendly Persian notification to all admins/managers
  for (const u of adminManagers) {
    await NotificationService.create(
      u.id,
      "container_plan_date_selected",
      containerId, // related container
      {
        supplierName: supplier?.name || "تأمین‌کننده ناشناس",
        plan_date: planDate,
      },
    );
  }

  return { message: "Plan date saved successfully", plan_date: planDate };
}

export async function getContainerPlanDate(containerId, userId) {
  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();

  if (!container) throw new Error("Container not found");
  if (container.supplier_id !== userId)
    throw new Error("Not authorized to view this container");

  return {
    container_id: container.id,
    plan_date: container.plan_date,
  };
}
/* =======================================================================
   📦 CONTAINERS & FILES
======================================================================= */

/** Get all containers under a specific plan (with attached files). */
export async function getContainersByPlan(planId) {
  const containers = await db("farmer_plan_containers")
    .where({ plan_id: planId })
    .orderBy("container_no", "asc");

  for (const container of containers) {
    container.files = await db("farmer_plan_files")
      .where({ container_id: container.id })
      .orderBy("created_at", "asc");
  }

  return containers;
}

/** Get single container by ID (with attached files). */
export async function getContainerById(containerId) {
  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();
  if (!container) return null;

  container.files = await db("farmer_plan_files")
    .where({ container_id: containerId })
    .orderBy("created_at", "asc");

  return container;
}

/**
 * Upload a file and link it to a container.
 * Automatically notifies all relevant users (admin, manager, buyer, farmer).
 */

export async function addFileToContainer(containerId, fileMeta) {
  // 1️⃣ Save file record
  const [file] = await db("farmer_plan_files")
    .insert({
      container_id: containerId,
      file_key: fileMeta.key,
      type: fileMeta.type || null,
      original_name: fileMeta.originalname,
      mime_type: fileMeta.mimetype,
      size_bytes: fileMeta.size,
      path: fileMeta.path,
      status: "submitted",
    })
    .returning("*");

  // 2️⃣ Join to fetch relationships
  const info = await db("farmer_plan_containers as c")
    .join("farmer_plans as p", "p.id", "c.plan_id")
    .join("buyer_requests as br", "br.id", "p.request_id")
    .where("c.id", containerId)
    .select("p.request_id", "br.buyer_id", "c.supplier_id")
    .first();

  if (!info) return file;

  const {
    request_id: requestId,
    buyer_id: buyerId,
    supplier_id: supplierId,
  } = info;

  // 3️⃣ Fetch supplier name
  const supplier = await db("users").where({ id: supplierId }).first();

  const data = {
    fileId: file.id,
    containerId,
    fileType: fileMeta.type || "نامشخص",
    supplierName: supplier?.name || "تأمین‌کننده ناشناس",
    originalName: fileMeta.originalname,
    mimeType: fileMeta.mimetype,
    sizeBytes: fileMeta.size,
  };

  // 4️⃣ Fetch active admins & managers
  const adminManagers = await db("users")
    .join("user_roles", "users.id", "user_roles.user_id")
    .join("roles", "user_roles.role_id", "roles.id")
    .whereRaw("LOWER(roles.name) IN ('admin', 'manager')")
    .where("users.status", "active")
    .distinct()
    .select("users.id");

  const promises = [];

  // 🔔 Notify admins/managers — user uploaded a new file
  for (const am of adminManagers) {
    promises.push(
      NotificationService.create(
        am.id,
        "container_file_uploaded",
        containerId, // ✅ use container ID instead of request ID
        data,
      ),
    );
  }

  // 📎 Notify buyer (informational)
  if (buyerId)
    promises.push(
      NotificationService.create(buyerId, "new_file_upload", containerId, data),
    );

  // 📤 Notify supplier (confirmation)
  if (supplierId)
    promises.push(
      NotificationService.create(
        supplierId,
        "new_file_upload",
        containerId,
        data,
      ),
    );

  await Promise.allSettled(promises);
  return file;
}

/**
 * Update container metadata (editable only by the owning farmer).
 */
/**
 * Update container metadata (editable only by the owning supplier or admin/manager).
 */
/** 🧾 Update container metadata (JSONB merge + notify admins) */
export async function updateContainerMetadata(
  containerId,
  metadata,
  userId,
  roles = [],
) {
  if (!metadata || typeof metadata !== "object") {
    throw new Error("Invalid metadata payload");
  }

  // 1️⃣ Fetch the container
  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();

  if (!container) throw new Error("Container not found");

  // 2️⃣ Authorization check
  const isAdmin = roles.includes("admin") || roles.includes("manager");
  const isSupplier = container.supplier_id === userId;

  if (!isSupplier && !isAdmin) {
    throw new Error("Not authorized to modify this container");
  }

  // 3️⃣ Normalize metadata structure (JSONB merge)
  const normalized =
    metadata && typeof metadata.metadata === "object"
      ? metadata.metadata
      : metadata;

  // 4️⃣ Update metadata JSONB
  await db("farmer_plan_containers")
    .where({ id: containerId })
    .update({
      metadata: db.raw("metadata || ?", JSON.stringify(normalized)),
      metadata_status: "submitted",
      metadata_review_note: null,
      metadata_reviewed_by: null,
      metadata_reviewed_at: null,
      updated_at: db.fn.now(),
    });

  // 5️⃣ Notify admins/managers about metadata update
  const supplier = await db("users").where({ id: userId }).first();

  const adminManagers = await db("users")
    .join("user_roles", "users.id", "user_roles.user_id")
    .join("roles", "user_roles.role_id", "roles.id")
    .whereIn("roles.name", ["admin", "manager"])
    .where("users.status", "active")
    .select("users.id");

  for (const u of adminManagers) {
    await NotificationService.create(
      u.id,
      "container_metadata_updated",
      containerId, // related container ID
      {
        supplierName: supplier?.name || "تأمین‌کننده ناشناس",
        metadata_type:
          Object.keys(normalized || {}).join(", ") || "اطلاعات کانتینر",
        metadata: normalized,
      },
    );
  }

  return { message: "Metadata submitted successfully", metadata: normalized };
}

/** List all files uploaded for a specific container. */
export async function listFiles(containerId) {
  return db("farmer_plan_files")
    .where({ container_id: containerId })
    .orderBy("created_at", "asc");
}

/* =======================================================================
   🚚 SUPPLIER / CONTAINER TRACKING
======================================================================= */

/**
 * List all buyer requests and containers assigned to a supplier.
 * Returns grouped data with latest tracking info.
 */
/**
 * List all buyer requests and containers assigned to a supplier.
 * Only show containers when the parent buyer request is 'accepted'.
 */
export async function listAssignedPlansWithContainers(supplierId) {
  const rows = await db("farmer_plan_containers as c")
    .join("farmer_plans as fp", "fp.id", "c.plan_id")
    .join("buyer_requests as br", "br.id", "fp.request_id")
    .leftJoin("users as buyer", "br.buyer_id", "buyer.id")
    .leftJoin(
      db("container_tracking_statuses as t")
        .select("container_id")
        .max("created_at as latest_time")
        .groupBy("container_id")
        .as("last"),
      "c.id",
      "last.container_id",
    )
    .leftJoin("container_tracking_statuses as ct", function () {
      this.on("ct.container_id", "=", "c.id").andOn(
        "ct.created_at",
        "=",
        "last.latest_time",
      );
    })
    .select(
      "br.id as request_id",
      "br.status as request_status",
      "br.import_country",
      "br.exit_border",
      "br.deadline_start as deadline_start_date",
      "br.deadline_end as deadline_end_date",

      "fp.id as plan_id",
      db.raw("to_char(fp.plan_date, 'YYYY-MM-DD') as plan_date"),

      "c.id as container_id",
      "c.container_no",
      "c.status as container_status",
      "c.farmer_status",
      "c.in_progress",
      "c.is_completed",
      "c.metadata",
      "c.metadata_status",
      "c.metadata_review_note",
      db.raw(
        `to_char(c.created_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') as container_created_at`,
      ),

      "ct.status as latest_status",
      "ct.tracking_code",
      "ct.created_at as updated_at",

      "buyer.name as buyer_name",
      "buyer.mobile as buyer_mobile",
    )
    .where("c.supplier_id", supplierId)
    .andWhere("br.status", "accepted") // ✅ Only accepted buyer requests
    .orderBy("fp.plan_date", "asc");

  // If no rows, just return []
  if (!rows.length) return [];

  // Group containers by buyer request
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.request_id]) {
      grouped[r.request_id] = {
        request_id: r.request_id,
        import_country: r.import_country,
        exit_border: r.exit_border,
        buyer_name: r.buyer_name,
        buyer_mobile: r.buyer_mobile,
        request_status: r.request_status,
        deadline_start_date: r.deadline_start_date,
        deadline_end_date: r.deadline_end_date,
        plan_id: r.plan_id,
        plan_date: r.plan_date,
        containers: [],
      };
    }

    let meta = {};
    try {
      meta =
        typeof r.metadata === "string"
          ? JSON.parse(r.metadata)
          : r.metadata || {};
    } catch {
      meta = {};
    }

    grouped[r.request_id].containers.push({
      container_id: r.container_id,
      container_no: r.container_no,
      container_status: r.container_status,
      farmer_status: r.farmer_status,
      in_progress: r.in_progress,
      is_completed: r.is_completed,
      metadata: meta,
      metadata_status: r.metadata_status,
      metadata_review_note: r.metadata_review_note,
      tracking_code: r.tracking_code,
      latest_status: r.latest_status,
      container_created_at: r.container_created_at,
      updated_at: r.updated_at,
    });
  }

  return Object.values(grouped);
}

/**
 * Fetch all tracking records for a supplier’s container (with auth check).
 */
export async function getContainerTracking(containerId, supplierId) {
  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();
  if (!container) throw new Error("Container not found");
  if (container.supplier_id !== supplierId)
    throw new Error("Not authorized to view this container");

  return db("container_tracking_statuses")
    .where({ container_id: containerId })
    .orderBy("created_at", "asc");
}

/**
 * Add a new tracking record to a container.
 */
export async function addContainerTracking({
  containerId,
  supplierId,
  status,
  note,
  tracking_code,
}) {
  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();
  if (!container) throw new Error("Container not found");
  if (container.supplier_id !== supplierId)
    throw new Error("Not authorized to update this container");

  const [record] = await db("container_tracking_statuses")
    .insert({
      container_id: containerId,
      status,
      note,
      tracking_code: tracking_code || null,
      created_by: supplierId,
    })
    .returning("*");
  await db("farmer_plan_containers").where({ id: containerId }).update({
    status,
    updated_at: db.fn.now(),
  });
  await db("farmer_plans").where({ id: container.plan_id }).update({
    updated_at: db.fn.now(),
  });

  return record;
}

/**
 * Update key status fields for a container (supplier-only).
 * Supports toggling in_progress/is_completed.
 */

export async function updateContainerStatus(containerId, supplierId, updates) {
  const allowed = ["status", "farmer_status", "in_progress", "is_completed"];
  const safeUpdates = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowed.includes(k)),
  );

  if (Object.keys(safeUpdates).length === 0)
    throw new Error("No valid fields to update");

  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();

  if (!container) throw new Error("Container not found");
  if (container.supplier_id !== supplierId)
    throw new Error("Not authorized to update this container");

  if ("in_progress" in safeUpdates)
    safeUpdates.in_progress = Boolean(safeUpdates.in_progress);
  if ("is_completed" in safeUpdates)
    safeUpdates.is_completed = Boolean(safeUpdates.is_completed);

  if (safeUpdates.farmer_status === "accepted") safeUpdates.in_progress = true;
  if (safeUpdates.is_completed === true) {
    safeUpdates.in_progress = false;
    safeUpdates.status = safeUpdates.status || "completed";
  }

  const [updated] = await db("farmer_plan_containers")
    .where({ id: containerId })
    .update({ ...safeUpdates, updated_at: db.fn.now() })
    .returning("*");

  /* 🔎 Fetch related plan and request for context */
  const plan = await db("farmer_plans").where({ id: updated.plan_id }).first();
  const relatedRequestId = plan?.request_id ?? null;

  /* 👤 Fetch supplier info */
  const supplier = await db("users").where({ id: supplierId }).first();

  /* 🧾 Notify all active admins/managers */
  const adminManagers = await db("users")
    .join("user_roles", "users.id", "user_roles.user_id")
    .join("roles", "user_roles.role_id", "roles.id")
    .whereIn("roles.name", ["admin", "manager"])
    .where("users.status", "active")
    .select("users.id");

  for (const u of adminManagers) {
    await NotificationService.create(
      u.id,
      "container_tracking_update",
      updated.id,
      {
        supplierName: supplier?.name || "Unknown Supplier",
        containerId: updated.id, // ✅ include containerId in data as well
        planId: updated.plan_id,
        status: updated.status || safeUpdates.status || null,
        farmer_status:
          updated.farmer_status || safeUpdates.farmer_status || null,
      },
    );
  }

  return updated;
}
