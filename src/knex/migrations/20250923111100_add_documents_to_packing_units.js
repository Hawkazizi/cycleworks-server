// migrations/20250923_add_documents_to_packing_units.js
export async function up(knex) {
  await knex.schema.alterTable("packing_units", (table) => {
    table.jsonb("documents").nullable();
    table.dropColumn("document_1");
    table.dropColumn("document_2");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("packing_units", (table) => {
    table.dropColumn("documents");
    table.string("document_1");
    table.string("document_2");
  });
}
