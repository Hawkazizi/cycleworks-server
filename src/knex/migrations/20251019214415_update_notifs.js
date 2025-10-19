// migration file: timestamp_alter_notifications_type_check.js

export const up = async (knex) => {
  // Drop the existing check constraint
  await knex.schema.raw(
    'ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";',
  );

  // Add the updated check constraint with new type included
  // Assuming previous types: 'status_updated', 'request_accepted', 'new_request', 'completed', 'new_file_upload'
  // Adding 'new_application'
  await knex.schema.raw(`
    ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_type_check"
    CHECK ("type" IN (
      'status_updated',
      'request_accepted',
      'new_request',
      'completed',
      'new_file_upload',
      'new_application'
    ));
  `);
};

export const down = async (knex) => {
  // Drop the updated constraint
  await knex.schema.raw(
    'ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";',
  );

  // Re-add the original constraint without the new type
  await knex.schema.raw(`
    ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_type_check"
    CHECK ("type" IN (
      'status_updated',
      'request_accepted',
      'new_request',
      'completed',
      'new_file_upload'
    ));
  `);
};
