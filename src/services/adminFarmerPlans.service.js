import db from "../db/knex.js";
import { NotificationService } from "./notification.service.js";

/* =======================================================================
   🗂️ FARMER FILE REVIEW (Admin / Manager)
======================================================================= */

/**
 * Review a single farmer-uploaded plan file.
 * @param {number} fileId - File ID in `farmer_plan_files`.
 * @param {"approved"|"rejected"} status - Review decision.
 * @param {string|null} note - Optional review note.
 * @param {number} reviewerId - Admin/Manager ID performing the review.
 */
export async function reviewFile(fileId, status, note, reviewerId) {
  if (!["approved", "rejected"].includes(status))
    throw new Error("Invalid status");

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

  // Optional: Notify farmer about file review
  try {
    // ✅ Fetch plan through container → plan relation
    const container = await db("farmer_plan_containers")
      .where("id", updated.container_id)
      .select("supplier_id", "plan_id")
      .first();

    if (container?.supplier_id) {
      const plan = await db("farmer_plans")
        .where({ id: container.plan_id })
        .select("request_id")
        .first();

      await NotificationService.create(
        container.supplier_id,
        "file_reviewed",
        plan?.request_id,
        { file_id: updated.id, status, note },
      );
    }
  } catch (err) {
    console.warn("⚠️ reviewFile notification failed:", err.message);
  }

  return { message: `File ${status}`, file: updated };
}

/* =======================================================================
   📦 CONTAINER METADATA REVIEW (Admin / Manager)
======================================================================= */

/**
 * Review a container's metadata submission.
 * @param {number} containerId - Container ID.
 * @param {"approved"|"rejected"} status - Review decision.
 * @param {string|null} note - Review notes.
 * @param {number} reviewerId - Admin/Manager performing review.
 */
export async function reviewContainerMetadata(
  containerId,
  status,
  note,
  reviewerId,
) {
  if (!["approved", "rejected"].includes(status))
    throw new Error("Invalid status");

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

  // 🔔 Notify farmer
  try {
    const containerRecord = await db("farmer_plan_containers")
      .where({ id: containerId })
      .select("supplier_id", "plan_id")
      .first();

    if (containerRecord?.supplier_id) {
      const plan = await db("farmer_plans")
        .where({ id: containerRecord.plan_id })
        .select("request_id")
        .first();

      await NotificationService.create(
        containerRecord.supplier_id,
        "metadata_reviewed",
        plan?.request_id,
        {
          container_id: containerId,
          metadata_status: status,
          note,
        },
      );
    }
  } catch (err) {
    console.warn(
      "⚠️ reviewContainerMetadata notification failed:",
      err.message,
    );
  }

  return { message: `Metadata ${status}`, container: updated };
}

/* =======================================================================
   🧠 ADMIN METADATA UPDATE (Admin / Manager)
======================================================================= */

/**
 * Update admin-level container metadata (e.g., B/L details, quantities).
 * @param {number} containerId - Target container ID.
 * @param {object} metadata - Admin-provided metadata object.
 * @param {number} reviewerId - Admin/Manager ID performing update.
 */
export async function updateContainerAdminMetadata(
  containerId,
  metadata,
  reviewerId,
) {
  if (!containerId) throw new Error("Missing container ID");
  if (!metadata || typeof metadata !== "object")
    throw new Error("Missing metadata object");

  const allowedKeys = {
    bl_no: "bl_no",
    bl_date: "bl_date",
    actual_quantity_received: "actual_quantity_received",
    ضایعات: "waste",
    اختلاف: "difference",
  };

  // Normalize keys
  const filtered = Object.fromEntries(
    Object.entries(metadata)
      .filter(([k]) => Object.keys(allowedKeys).includes(k))
      .map(([k, v]) => [allowedKeys[k], v]),
  );

  // ✅ Ensure container exists
  const container = await db("farmer_plan_containers")
    .where({ id: containerId })
    .first();

  if (!container) throw new Error("Container not found");

  // 🧾 Update record
  const [updated] = await db("farmer_plan_containers")
    .where({ id: containerId })
    .update({
      admin_metadata: JSON.stringify(filtered ?? {}),
      admin_metadata_status: "approved", // ✅ admins are final reviewers
      admin_metadata_reviewed_by: reviewerId,
      admin_metadata_reviewed_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
    .returning("*");

  // 🔔 Notify linked farmer (if exists)
  try {
    const containerRecord = await db("farmer_plan_containers")
      .where({ id: containerId })
      .select("supplier_id", "plan_id")
      .first();

    if (containerRecord?.supplier_id) {
      const plan = await db("farmer_plans")
        .where({ id: containerRecord.plan_id })
        .select("request_id")
        .first();

      await NotificationService.create(
        containerRecord.supplier_id,
        "admin_metadata_updated",
        plan?.request_id,
        {
          container_id: containerId,
          admin_metadata: filtered,
        },
      );
    }
  } catch (err) {
    console.warn(
      "⚠️ updateContainerAdminMetadata notification failed:",
      err.message,
    );
  }

  return { message: "Admin metadata submitted", container: updated };
}

export async function toggleRejectStatus(containerId) {
  return db.transaction(async (trx) => {
    // Fetch current record to ensure it exists
    const current = await trx("farmer_plan_containers")
      .where("id", containerId)
      .first();

    if (!current) {
      return null;
    }

    // Toggle logic for both is_rejected and in_progress
    const newRejectedStatus = !current.is_rejected;
    const newInProgressStatus = newRejectedStatus
      ? false
      : !current.in_progress;

    // Update both fields
    await trx("farmer_plan_containers").where("id", containerId).update({
      is_rejected: newRejectedStatus,
      in_progress: newInProgressStatus,
      updated_at: trx.fn.now(),
    });

    // Re-fetch updated record to return
    const updated = await trx("farmer_plan_containers")
      .where("id", containerId)
      .first();

    return updated;
  });
}
