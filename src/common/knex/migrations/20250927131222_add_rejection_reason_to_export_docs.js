export async function up(knex) {
  await knex.schema.alterTable("export_documents", (t) => {
    t.text("rejection_reason").nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("export_documents", (t) => {
    t.dropColumn("rejection_reason");
  });
}
