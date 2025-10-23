/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Get current enum constraint name (should be "notifications_type_check")
  // We'll drop the check constraint and recreate it with the new allowed types

  // 🔹 Drop old check constraint if it exists
  await knex.schema.alterTable("notifications", (table) => {
    table.dropChecks(["notifications_type_check"]);
  });

  // 🔹 Recreate the constraint with expanded list
  await knex.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'new_request',
      'status_updated',
      'request_accepted',
      'completed',
      'new_file_upload',
      'new_application',
      'metadata_submitted',        -- 🆕 for supplier submitting metadata
      'metadata_reviewed'          -- 🆕 for admin approval/rejection event
    ));
  `);

  console.log("✅ Updated notifications.type allowed values");
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  // Revert to the original constraint
  await knex.schema.alterTable("notifications", (table) => {
    table.dropChecks(["notifications_type_check"]);
  });

  await knex.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'new_request',
      'status_updated',
      'request_accepted',
      'completed',
      'new_file_upload',
      'new_application'
    ));
  `);

  console.log("🔁 Reverted notifications.type constraint to original set");
}
