// migrations/20250924_add_weekly_plan_to_qc.js
export async function up(knex) {
  await knex.schema.alterTable("qc_pre_productions", (table) => {
    table
      .integer("weekly_loading_plan_id")
      .unsigned()
      .references("id")
      .inTable("weekly_loading_plans")
      .onDelete("CASCADE");

    // Optional: drop export_permit_request_id if not needed anymore
    // table.dropColumn("export_permit_request_id");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("qc_pre_productions", (table) => {
    table.dropColumn("weekly_loading_plan_id");
  });
}
