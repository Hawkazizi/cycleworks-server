export async function up(knex) {
  // 🔹 Drop foreign key + index + column
  await knex.schema.alterTable("farmer_plans", (table) => {
    table.dropForeign("farmer_id");
    table.dropIndex("farmer_id", "farmer_plans_farmer_id_index");
    table.dropColumn("farmer_id");
  });
}

export async function down(knex) {
  // 🔹 Recreate the column, constraint, and index (rollback)
  await knex.schema.alterTable("farmer_plans", (table) => {
    table
      .integer("farmer_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
  });

  await knex.schema.alterTable("farmer_plans", (table) => {
    table.index("farmer_id", "farmer_plans_farmer_id_index");
  });
}
