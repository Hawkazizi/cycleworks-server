import db from "../db/knex.js";
import { NotificationService } from "./notification.service.js";
/* -------------------- Review File -------------------- */
export async function reviewFile(fileId, status, note, reviewerId) {
  // ✅ align with DB constraint (submitted | approved | rejected)
  if (!["approved", "rejected"].includes(status)) {
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

/* -------------------- Container Metadata Review -------------------- */
export async function reviewContainerMetadata(
  containerId,
  status,
  note,
  reviewerId,
) {
  if (!["approved", "rejected"].includes(status)) {
    throw new Error("Invalid status");
  }

  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();

  if (!container) throw new Error("Container not found");

  const [updated] = await db("farmer_plan_containers")
    .where({ id: containerId })
    .update({
      metadata_status: status,
      metadata_review_note: note || null,
      metadata_reviewed_by: reviewerId,
      metadata_reviewed_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
    .returning("*");

  // Optionally notify farmer
  if (updated?.plan_id) {
    const plan = await db("farmer_plans")
      .where({ id: updated.plan_id })
      .first();

    if (plan?.farmer_id) {
      await NotificationService.create(
        plan.id,
        "metadata_reviewed",
        container.buyer_request_id,
        {
          container_id: container.id,
          metadata_status: status,
        },
      );
    }
  }

  return { message: `Metadata ${status}`, container: updated };
}

/**
 * Update container-level admin metadata
 */
export async function updateContainerAdminMetadata(
  containerId,
  metadata,
  reviewerId,
) {
  if (!containerId) throw new Error("Missing container ID");
  if (!metadata) throw new Error("Missing metadata");

  const allowedKeys = [
    "bl_no",
    "bl_date",
    "actual_quantity_received",
    "ضایعات",
    "اختلاف",
  ];

  // Filter valid keys only
  const filtered = Object.fromEntries(
    Object.entries(metadata).filter(([k]) => allowedKeys.includes(k)),
  );

  // Ensure container exists
  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();

  if (!container) throw new Error("Container not found");

  // Update record
  const [updated] = await db("farmer_plan_containers")
    .where({ id: containerId })
    .update({
      admin_metadata: JSON.stringify(filtered),
      admin_metadata_status: "submitted",
      admin_metadata_reviewed_by: reviewerId,
      admin_metadata_reviewed_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
    .returning("*");

  // Notify linked farmer (if exists)
  const plan = await db("farmer_plans").where({ id: updated.plan_id }).first();

  if (plan?.farmer_id) {
    await NotificationService.create(
      plan.farmer_id,
      "admin_metadata_updated",
      plan.request_id,
      { container_id: containerId, admin_metadata: filtered },
    );
  }

  return updated;
}
