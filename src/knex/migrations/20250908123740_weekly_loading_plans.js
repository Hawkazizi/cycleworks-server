export async function up(knex) {
  await knex.schema.createTable("weekly_loading_plans", (table) => {
    table.increments("id").primary();
    table
      .integer("export_permit_request_id")
      .notNullable()
      .references("id")
      .inTable("export_permit_requests")
      .onDelete("CASCADE");
    table.date("week_start_date").notNullable();
    table.timestamp("submitted_at", { useTz: true }).defaultTo(knex.fn.now());
    table.string("status", 20).notNullable().defaultTo("Submitted");
    table.integer("reviewed_by").references("id").inTable("users");
    table.text("rejection_reason");
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());

    table.check(`status IN ('Submitted', 'Approved', 'Rejected')`);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("weekly_loading_plans");
}
