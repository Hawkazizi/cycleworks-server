// services/adminFarmerPlans.service.js
import db from "../db/knex.js";

/* -------------------- Review File -------------------- */
export async function reviewFile(fileId, status, note, reviewerId) {
  if (!["accepted", "rejected"].includes(status)) {
    throw new Error("Invalid status");
  }

  const [updated] = await db("farmer_plan_files")
    .where({ id: fileId })
    .update({
      status,
      review_note: note || null,
      reviewed_by: reviewerId,
      reviewed_at: db.fn.now(),
    })
    .returning("*");

  if (!updated) throw new Error("File not found");
  return updated;
}
