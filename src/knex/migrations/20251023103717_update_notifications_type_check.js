/**
 * @param { import("knex").Knex } knex
 */
export async function up(knex) {
  console.log(
    "🔍 Cleaning up invalid notification types before adding constraint...",
  );

  // 1️⃣ Drop the old constraint if it exists
  await knex.raw(`
    ALTER TABLE "notifications"
    DROP CONSTRAINT IF EXISTS "notifications_type_check";
  `);

  // 2️⃣ Fix invalid rows (set any unknown 'type' to 'legacy')
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
      'request_completed'
    )
    OR type IS NULL;
  `);

  // 3️⃣ Recreate the updated constraint (including 'legacy')
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

  console.log(
    "✅ Notifications type constraint recreated successfully (legacy handled)",
  );
}

/**
 * @param { import("knex").Knex } knex
 */
export async function down(knex) {
  await knex.raw(`
    ALTER TABLE "notifications"
    DROP CONSTRAINT IF EXISTS "notifications_type_check";
  `);

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
        'ticket_reply',
        'application_submitted',
        'application_reviewed',
        'request_completed'
      )
    );
  `);

  console.log("🔄 Rolled back notifications_type_check to original list");
}
