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
    const plan = await db("farmer_plans as fp")
      .join("farmer_plan_containers as c", "fp.id", "c.plan_id")
      .where("c.id", updated.container_id)
      .select("fp.id", "fp.request_id", "fp.farmer_id")
      .first();

    if (plan?.farmer_id) {
      await NotificationService.create(
        plan.farmer_id,
        "file_reviewed",
        plan.request_id,
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
      in_progress: false, // ✅ optional: ensure finalized state
    })
    .returning("*");

  // 🔔 Notify farmer
  try {
    const plan = await db("farmer_plans")
      .where({ id: updated.plan_id })
      .first();

    if (plan?.farmer_id) {
      await NotificationService.create(
        plan.farmer_id,
        "metadata_reviewed",
        plan.request_id,
        {
          container_id: container.id,
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
    const plan = await db("farmer_plans")
      .where({ id: updated.plan_id })
      .first();

    if (plan?.farmer_id) {
      await NotificationService.create(
        plan.farmer_id,
        "admin_metadata_updated",
        plan.request_id,
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
