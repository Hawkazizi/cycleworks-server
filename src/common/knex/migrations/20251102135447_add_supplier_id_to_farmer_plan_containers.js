export async function up(knex) {
  const hasColumn = await knex.schema.hasColumn(
    "farmer_plan_containers",
    "supplier_id",
  );
  if (!hasColumn) {
    await knex.schema.alterTable("farmer_plan_containers", (table) => {
      table
        .integer("supplier_id")
        .unsigned()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL")
        .index()
        .comment("Assigned supplier for this container");
    });
  }
}

export async function down(knex) {
  const hasColumn = await knex.schema.hasColumn(
    "farmer_plan_containers",
    "supplier_id",
  );
  if (hasColumn) {
    await knex.schema.alterTable("farmer_plan_containers", (table) => {
      table.dropColumn("supplier_id");
    });
  }
}
