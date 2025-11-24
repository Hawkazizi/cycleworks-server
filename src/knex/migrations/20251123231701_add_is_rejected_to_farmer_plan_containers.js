export async function up(knex) {
  return knex.schema.table("farmer_plan_containers", (table) => {
    table.boolean("is_rejected").defaultTo(false).notNullable();
  });
}

export async function down(knex) {
  return knex.schema.table("farmer_plan_containers", (table) => {
    table.dropColumn("is_rejected");
  });
}
