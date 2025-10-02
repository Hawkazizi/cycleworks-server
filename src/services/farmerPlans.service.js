// services/farmerPlans.service.js
import db from "../db/knex.js";

/* -------------------- Farmer Plans -------------------- */
export async function createPlan({
  requestId,
  farmerId,
  planDate,
  containerAmount,
}) {
  const buyerRequest = await db("buyer_requests")
    .where({ id: requestId })
    .first();
  if (!buyerRequest) throw new Error("Buyer request not found");
  if (new Date(planDate) > new Date(buyerRequest.deadline_date)) {
    throw new Error("Plan date exceeds request deadline");
  }

  return db.transaction(async (trx) => {
    // Insert plan
    const [plan] = await trx("farmer_plans")
      .insert({
        request_id: requestId,
        farmer_id: farmerId,
        plan_date: planDate,
      })
      .returning("*");

    // Insert containers
    for (let i = 1; i <= containerAmount; i++) {
      await trx("farmer_plan_containers").insert({
        plan_id: plan.id,
        container_no: i,
      });
    }

    return plan;
  });
}

export async function listPlansByRequest(requestId, farmerId) {
  return db("farmer_plans")
    .where({ request_id: requestId, farmer_id: farmerId })
    .orderBy("plan_date", "asc");
}

/* -------------------- Containers -------------------- */
export async function getContainersByPlan(planId) {
  return db("farmer_plan_containers")
    .where({ plan_id: planId })
    .orderBy("container_no");
}

export async function getContainerById(containerId) {
  return db("farmer_plan_containers").where({ id: containerId }).first();
}

/* -------------------- File Upload -------------------- */
export async function addFileToContainer(containerId, fileMeta) {
  const [file] = await db("farmer_plan_files")
    .insert({
      container_id: containerId,
      file_key: fileMeta.key,
      original_name: fileMeta.originalname,
      mime_type: fileMeta.mimetype,
      size_bytes: fileMeta.size,
      path: fileMeta.path,
    })
    .returning("*");

  return file;
}

export async function listFiles(containerId) {
  return db("farmer_plan_files").where({ container_id: containerId });
}
