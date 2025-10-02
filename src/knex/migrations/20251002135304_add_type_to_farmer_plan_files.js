// migrations/20251003_add_type_to_farmer_plan_files.js
export async function up(knex) {
  await knex.schema.alterTable("farmer_plan_files", (table) => {
    table.string("type", 50).nullable().index(); // new column
  });
}

export async function down(knex) {
  await knex.schema.alterTable("farmer_plan_files", (table) => {
    table.dropColumn("type");
  });
}
