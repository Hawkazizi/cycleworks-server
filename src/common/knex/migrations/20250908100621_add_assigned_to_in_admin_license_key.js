export async function up(knex) {
  await knex.schema.alterTable("admin_license_keys", (table) => {
    table
      .integer("assigned_to")
      .unsigned()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("admin_license_keys", (table) => {
    table.dropColumn("assigned_to");
  });
}
