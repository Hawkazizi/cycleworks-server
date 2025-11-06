export function up(knex) {
  return knex.schema.table("container_tracking_statuses", function (table) {
    // Add updated_at column
    table.timestamp("updated_at").defaultTo(knex.fn.now()).notNullable();

    // Create a trigger to automatically update the updated_at column
    knex.raw(`
      CREATE OR REPLACE FUNCTION update_container_tracking_statuses_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER update_updated_at
      BEFORE UPDATE ON container_tracking_statuses
      FOR EACH ROW
      EXECUTE FUNCTION update_container_tracking_statuses_updated_at();
    `);
  });
}

export function down(knex) {
  return knex.schema.table("container_tracking_statuses", function (table) {
    // Drop the updated_at column and trigger if rolling back the migration
    table.dropColumn("updated_at");

    knex.raw(`
      DROP TRIGGER IF EXISTS update_updated_at ON container_tracking_statuses;
      DROP FUNCTION IF EXISTS update_container_tracking_statuses_updated_at;
    `);
  });
}
