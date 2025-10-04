import db from "../db/knex.js";

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
    const [{ ok: inWindow }] = await trx
      .raw(`SELECT (?::date <= ?::date) as ok`, [
        planDate,
        buyerRequest.deadline_date,
      ])
      .then((r) => r.rows);

    if (!inWindow) {
      throw new Error("Plan date exceeds request deadline");
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
        `🚨 تعداد کانتینرها بیشتر از سقف ${total} است. شما تاکنون ${used} ثبت کرده‌اید.`
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
            .where({ plan_id: existing.id })
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
      "updated_at"
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
  return db("farmer_plan_containers")
    .where({ plan_id: planId })
    .orderBy("container_no", "asc");
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
  return file;
}

export async function listFiles(containerId) {
  return db("farmer_plan_files")
    .where({ container_id: containerId })
    .orderBy("created_at", "asc");
}
