export async function up(knex) {
  await knex.schema.alterTable("user_applications", (table) => {
    table.string("supplier_name").nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("user_applications", (table) => {
    table.dropColumn("supplier_name");
  });
}
