// migrations/20251002_update_farmer_plans.js
export async function up(knex) {
  await knex.schema.alterTable("farmer_plans", (table) => {
    table.dropColumn("container_amount"); // move to farmer_plan_containers
  });
}

export async function down(knex) {
  await knex.schema.alterTable("farmer_plans", (table) => {
    table.integer("container_amount").notNullable();
  });
}
