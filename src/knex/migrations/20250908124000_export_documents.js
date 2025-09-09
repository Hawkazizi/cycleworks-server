export async function up(knex) {
  await knex.schema.createTable("export_documents", (table) => {
    table.increments("id").primary();
    table
      .integer("export_permit_request_id")
      .notNullable()
      .references("id")
      .inTable("export_permit_requests")
      .onDelete("CASCADE");
    table.text("packing_list").notNullable();
    table.text("invoice").notNullable();
    table.text("veterinary_certificate").notNullable();
    table.timestamp("submitted_at", { useTz: true }).defaultTo(knex.fn.now());
    table.string("status", 20).notNullable().defaultTo("Submitted"); // Submitted → Sent_To_Sales → Import_Permit_Issued
    table.text("import_permit_document");
    table.timestamp("sent_to_sales_at", { useTz: true });
    table.timestamp("forwarded_to_customs_at", { useTz: true });
    table.integer("reviewed_by").references("id").inTable("users");

    table.check(
      `status IN ('Submitted', 'Sent_To_Sales', 'Import_Permit_Issued', 'Rejected')`
    );
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("export_documents");
}
