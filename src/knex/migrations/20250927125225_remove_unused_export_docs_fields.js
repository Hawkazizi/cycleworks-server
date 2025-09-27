export async function up(knex) {
  await knex.schema.alterTable("export_documents", (table) => {
    table.dropColumn("import_permit_document");
    table.dropColumn("sent_to_sales_at");
    table.dropColumn("forwarded_to_customs_at");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("export_documents", (table) => {
    table.string("import_permit_document");
    table.timestamp("sent_to_sales_at");
    table.timestamp("forwarded_to_customs_at");
  });
}
