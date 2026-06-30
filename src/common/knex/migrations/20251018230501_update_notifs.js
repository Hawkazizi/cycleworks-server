/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Drop the old constraint if it exists
  await knex.schema.raw(`
    ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;
  `);

  // Add the new, updated constraint
  await knex.schema.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (
      type = ANY (ARRAY[
        'new_request',
        'request_accepted',
        'status_updated',
        'completed'
      ])
    );
  `);
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  // Revert to the previous allowed values
  await knex.schema.raw(`
    ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;
  `);

  await knex.schema.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (
      type = ANY (ARRAY[
        'new_request',
        'request_accepted',
        'status_updated'
      ])
    );
  `);
}
