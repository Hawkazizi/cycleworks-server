// migrations/20251002_update_farmer_plan_files.js
export async function up(knex) {
  await knex.schema.alterTable("farmer_plan_files", (table) => {
    table.dropColumn("plan_id");
    table
      .integer("container_id")
      .notNullable()
      .references("id")
      .inTable("farmer_plan_containers")
      .onDelete("CASCADE");

    table.index("container_id");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("farmer_plan_files", (table) => {
    table.dropColumn("container_id");
    table
      .integer("plan_id")
      .notNullable()
      .references("id")
      .inTable("farmer_plans")
      .onDelete("CASCADE");

    table.index("plan_id");
  });
}
