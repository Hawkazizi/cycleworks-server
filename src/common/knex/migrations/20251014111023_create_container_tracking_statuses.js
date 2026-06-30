export async function up(knex) {
  await knex.schema.createTable("container_tracking_statuses", (table) => {
    table.increments("id").primary();
    table
      .integer("container_id")
      .notNullable()
      .references("id")
      .inTable("farmer_plan_containers")
      .onDelete("CASCADE");
    table.string("status", 100).notNullable();
    table.text("note").nullable();
    table.integer("created_by").notNullable().references("id").inTable("users"); // or admin_license_keys if you prefer
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE INDEX container_tracking_statuses_container_id_idx
    ON container_tracking_statuses (container_id);
  `);
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("container_tracking_statuses");
}
