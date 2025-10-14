import db from "../db/knex.js";

export async function addTracking({ containerId, status, note, createdBy }) {
  const [inserted] = await db("container_tracking_statuses")
    .insert({
      container_id: containerId,
      status,
      note,
      created_by: createdBy,
    })
    .returning("*");
  return inserted;
}

export async function listTracking(containerId) {
  return db("container_tracking_statuses")
    .where({ container_id: containerId })
    .orderBy("created_at", "desc");
}
