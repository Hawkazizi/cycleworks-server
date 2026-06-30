export async function up(knex) {
  await knex.schema.alterTable("buyer_requests", (table) => {
    // rename the old column
    table.renameColumn("preferred_supplier", "preferred_supplier_name");

    // add new FK column
    table
      .integer("preferred_supplier_id")
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("buyer_requests", (table) => {
    // drop the FK column
    table.dropColumn("preferred_supplier_id");

    // revert the column name
    table.renameColumn("preferred_supplier_name", "preferred_supplier");
  });
}
