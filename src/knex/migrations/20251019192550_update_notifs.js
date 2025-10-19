export const up = (knex) => {
  return knex.schema.raw(`
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('status_updated', 'request_accepted', 'new_request', 'completed', 'new_file_upload'));
  `);
};

export const down = (knex) => {
  return knex.schema.raw(`
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('status_updated', 'request_accepted', 'new_request', 'completed'));
  `);
};
