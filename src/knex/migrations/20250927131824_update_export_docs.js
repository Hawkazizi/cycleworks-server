// migrations/20250927140000_add_review_fields_to_export_documents.js
export async function up(knex) {
  await knex.schema.alterTable("export_documents", (table) => {
    table.timestamp("reviewed_at").nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("export_documents", (table) => {
    table.dropColumn("reviewed_at");
  });
}
