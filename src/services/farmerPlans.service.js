import db from "../db/knex.js";
import { NotificationService } from "../services/notification.service.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* -------------------- Create Plan -------------------- */
export async function createPlan({
  requestId,
  farmerId,
  planDate,
  containerAmount,
}) {
  // validate input
  if (!DATE_RE.test(planDate)) {
    throw new Error("Invalid planDate format, must be YYYY-MM-DD");
  }
  if (!containerAmount || containerAmount <= 0) {
    throw new Error("Container amount must be positive");
  }
  const buyerRequest = await db("buyer_requests")
    .where({ id: requestId })
    .first();
  if (!buyerRequest) throw new Error("Buyer request not found");
  return db.transaction(async (trx) => {
    // ✅ enforce deadline in SQL, comparing as DATE
    // ✅ enforce new deadline window (supports both new and old fields)
    let inWindow = true;

    if (buyerRequest.deadline_start_date && buyerRequest.deadline_end_date) {
      // Check if planDate is between start and end (inclusive)
      const [{ ok }] = await trx
        .raw(`SELECT (?::date BETWEEN ?::date AND ?::date) AS ok`, [
          planDate,
          buyerRequest.deadline_start_date,
          buyerRequest.deadline_end_date,
        ])
        .then((r) => r.rows);
      inWindow = ok;
    } else if (buyerRequest.deadline_date) {
      // Legacy fallback
      const [{ ok }] = await trx
        .raw(`SELECT (?::date <= ?::date) AS ok`, [
          planDate,
          buyerRequest.deadline_date,
        ])
        .then((r) => r.rows);
      inWindow = ok;
    }

    if (!inWindow) {
      throw new Error("Plan date is outside the allowed request period");
    }

    // ✅ compute used quota
    const { cnt: usedRaw } = await trx("farmer_plan_containers as c")
      .join("farmer_plans as p", "p.id", "c.plan_id")
      .where("p.request_id", requestId)
      .count("* as cnt")
      .first();
    const used = Number(usedRaw || 0);
    const total = Number(buyerRequest.container_amount || 0);
    if (used + containerAmount > total) {
      throw new Error(
        `🚨 تعداد کانتینرها بیشتر از سقف ${total} است. شما تاکنون ${used} ثبت کرده‌اید.`,
      );
    }
    // delete old plan for same date (if exists)
    const existing = await trx("farmer_plans")
      .where({
        request_id: requestId,
        farmer_id: farmerId,
        plan_date: planDate,
      })
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
    // insert new plan
    const [plan] = await trx("farmer_plans")
      .insert({
        request_id: requestId,
        farmer_id: farmerId,
        plan_date: planDate, // ✅ DATE column
        status: "submitted",
      })
      .returning("*");
    // insert containers
    const containers = [];
    for (let i = 1; i <= containerAmount; i++) {
      const [c] = await trx("farmer_plan_containers")
        .insert({ plan_id: plan.id, container_no: i, status: "submitted" })
        .returning("*");
      containers.push(c);
    }
    plan.containers = containers;
    const [{ count }] = await trx("farmer_plans")
      .where({ request_id: requestId, farmer_id: farmerId })
      .count("* as count");
    if (Number(count) === 1) {
      await trx("buyer_requests").where({ id: requestId }).update({
        farmer_status: "accepted",
        updated_at: db.fn.now(),
      });
    }
    return plan;
  });
}

/* -------------------- List Plans (hydrated) -------------------- */
export async function listPlansWithContainers(requestId, farmerId) {
  const plans = await db("farmer_plans")
    .select(
      "id",
      "request_id",
      "farmer_id",
      db.raw("to_char(plan_date, 'YYYY-MM-DD') as plan_date"), // ✅ force plain string
      "status",
      "reviewed_by",
      "reviewed_at",
      "created_at",
      "updated_at",
    )
    .where({ request_id: requestId, farmer_id: farmerId })
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
  // hydrate containers + files
  for (const plan of plans) {
    const containers = await db("farmer_plan_containers")
      .where({ plan_id: plan.id })
      .orderBy("container_no", "asc");
    for (const container of containers) {
      const files = await db("farmer_plan_files")
        .where({ container_id: container.id })
        .orderBy("created_at", "asc");
      container.files = files;
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

/* -------------------- Containers -------------------- */
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

/* -------------------- File Upload -------------------- */
export async function addFileToContainer(containerId, fileMeta) {
  // 1️⃣ Insert file record
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

  // 2️⃣ Get related buyer & farmer info
  const containerInfo = await db("farmer_plan_containers")
    .join("farmer_plans", "farmer_plans.id", "farmer_plan_containers.plan_id")
    .join("buyer_requests", "buyer_requests.id", "farmer_plans.request_id")
    .where("farmer_plan_containers.id", containerId)
    .select(
      "farmer_plans.request_id",
      "farmer_plans.farmer_id",
      "buyer_requests.buyer_id",
    )
    .first();

  if (!containerInfo) return file;

  const {
    request_id: requestId,
    buyer_id: buyerId,
    farmer_id: farmerId,
  } = containerInfo;

  // 3️⃣ Notification payload
  const notificationData = {
    fileId: file.id,
    containerId,
    type: fileMeta.type,
  };

  // 4️⃣ Fetch all active Admins & Managers together
  const adminManagerUsers = await db("users")
    .join("user_roles", "users.id", "user_roles.user_id")
    .join("roles", "user_roles.role_id", "roles.id")
    .whereIn(db.raw("LOWER(roles.name)"), ["admin", "manager"])
    .where("users.status", "active")
    .distinct()
    .select("users.id");

  // 5️⃣ Prepare all notification promises
  const notificationPromises = [];

  // Admins + Managers
  for (const am of adminManagerUsers) {
    notificationPromises.push(
      NotificationService.create(
        am.id,
        "new_file_upload",
        requestId,
        notificationData,
      ),
    );
  }

  // Buyer (if exists)
  if (buyerId) {
    notificationPromises.push(
      NotificationService.create(
        buyerId,
        "new_file_upload",
        requestId,
        notificationData,
      ),
    );
  }

  // Farmer (optional)
  if (farmerId) {
    notificationPromises.push(
      NotificationService.create(
        farmerId,
        "new_file_upload",
        requestId,
        notificationData,
      ),
    );
  }

  // 6️⃣ Execute all notifications in parallel
  await Promise.allSettled(notificationPromises);

  return file;
}

/* -------------------- Container Metadata -------------------- */
export async function updateContainerMetadata(containerId, metadata, userId) {
  if (!metadata || typeof metadata !== "object") {
    throw new Error("Invalid metadata payload");
  }

  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();

  if (!container) throw new Error("Container not found");

  // Optional: check farmer ownership
  const plan = await db("farmer_plans")
    .where({ id: container.plan_id })
    .first();
  if (plan.farmer_id !== userId)
    throw new Error("Not authorized to modify this container");

  await db("farmer_plan_containers")
    .where({ id: containerId })
    .update({
      metadata: JSON.stringify(metadata),
      metadata_status: "submitted",
      metadata_review_note: null,
      metadata_reviewed_by: null,
      metadata_reviewed_at: null,
      updated_at: db.fn.now(),
    });

  return { message: "Metadata submitted successfully" };
}

/* -------------------- List Files -------------------- */
export async function listFiles(containerId) {
  return db("farmer_plan_files")
    .where({ container_id: containerId })
    .orderBy("created_at", "asc");
}
