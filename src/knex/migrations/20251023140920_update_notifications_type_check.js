/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Drop the existing check constraint first
  await knex.raw(`
    ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;
  `);

  // Recreate it with new allowed values
  await knex.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (
      type = ANY (ARRAY[
        'new_request'::text,
        'request_approved'::text,
        'request_rejected'::text,
        'file_uploaded'::text,
        'file_reviewed'::text,
        'metadata_reviewed'::text,
        'admin_metadata_updated'::text,
        'new_admin_file'::text,
        'ticket_reply'::text,
        'application_submitted'::text,
        'application_reviewed'::text,
        'request_completed'::text,
        'supplier_assigned'::text,
        'deadline_updated'::text,
        'legacy'::text,
        'accepted'::text,
        'cancelled'::text
      ])
    );
  `);
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  // Rollback: restore the old constraint (without accepted/cancelled)
  await knex.raw(`
    ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;
  `);

  await knex.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (
      type = ANY (ARRAY[
        'new_request'::text,
        'request_approved'::text,
        'request_rejected'::text,
        'file_uploaded'::text,
        'file_reviewed'::text,
        'metadata_reviewed'::text,
        'admin_metadata_updated'::text,
        'new_admin_file'::text,
        'ticket_reply'::text,
        'application_submitted'::text,
        'application_reviewed'::text,
        'request_completed'::text,
        'supplier_assigned'::text,
        'deadline_updated'::text,
        'legacy'::text
      ])
    );
  `);
}
