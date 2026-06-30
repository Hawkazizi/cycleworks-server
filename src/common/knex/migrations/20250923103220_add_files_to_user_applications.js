export async function up(knex) {
  await knex.schema.alterTable("user_applications", (table) => {
    table.jsonb("files").nullable().defaultTo(null);
  });
}

export async function down(knex) {
  await knex.schema.alterTable("user_applications", (table) => {
    table.dropColumn("files");
  });
}
