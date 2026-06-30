/**
 * @param { import("knex").Knex } knex
 */
export async function up(knex) {
  console.log("🔧 Updating notifications_type_check to include new types...");

  // 1️⃣ Drop the existing constraint (if any)
  await knex.raw(`
    ALTER TABLE "notifications"
    DROP CONSTRAINT IF EXISTS "notifications_type_check";
  `);

  // 2️⃣ Clean up invalid rows (set any unknown type to 'legacy')
  await knex.raw(`
    UPDATE "notifications"
    SET type = 'legacy'
    WHERE type NOT IN (
      'new_request',
      'request_approved',
      'request_rejected',
      'file_uploaded',
      'file_reviewed',
      'metadata_reviewed',
      'admin_metadata_updated',
      'new_admin_file',
      'ticket_reply',
      'application_submitted',
      'application_reviewed',
      'request_completed',
      'supplier_assigned',
      'deadline_updated',
      'legacy'
    )
    OR type IS NULL;
  `);

  // 3️⃣ Recreate the updated constraint with the new allowed values
  await knex.raw(`
    ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_type_check"
    CHECK (
      type IN (
        'new_request',
        'request_approved',
        'request_rejected',
        'file_uploaded',
        'file_reviewed',
        'metadata_reviewed',
        'admin_metadata_updated',
        'new_admin_file',
        'ticket_reply',
        'application_submitted',
        'application_reviewed',
        'request_completed',
        'supplier_assigned',
        'deadline_updated',
        'legacy'
      )
    );
  `);

  console.log("✅ notifications_type_check successfully updated!");
}

/**
 * @param { import("knex").Knex } knex
 */
export async function down(knex) {
  console.log("🔄 Rolling back notifications_type_check to previous state...");

  // Drop the current constraint
  await knex.raw(`
    ALTER TABLE "notifications"
    DROP CONSTRAINT IF EXISTS "notifications_type_check";
  `);

  // Recreate the old constraint (without the new ones)
  await knex.raw(`
    ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_type_check"
    CHECK (
      type IN (
        'new_request',
        'request_approved',
        'request_rejected',
        'file_uploaded',
        'file_reviewed',
        'metadata_reviewed',
        'admin_metadata_updated',
        'new_admin_file',
        'ticket_reply',
        'application_submitted',
        'application_reviewed',
        'request_completed',
        'legacy'
      )
    );
  `);

  console.log("↩️ notifications_type_check rolled back to original types.");
}
