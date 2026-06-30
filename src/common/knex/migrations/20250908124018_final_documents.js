export async function up(knex) {
  await knex.schema.createTable("final_documents", (table) => {
    table.increments("id").primary();
    table
      .integer("export_permit_request_id")
      .notNullable()
      .references("id")
      .inTable("export_permit_requests")
      .onDelete("CASCADE");
    table.text("certificate").notNullable();
    table.text("packing_list").notNullable();
    table.text("invoice").notNullable();
    table.text("customs_declaration").notNullable();
    table.text("shipping_license").notNullable();
    table.text("certificate_of_origin").notNullable();
    table.text("chamber_certificate").notNullable();
    table.timestamp("submitted_at", { useTz: true }).defaultTo(knex.fn.now());
    table.string("status", 20).notNullable().defaultTo("Submitted"); // Submitted → Approved / Rejected / Closed
    table.text("rejection_reason");
    table.integer("reviewed_by").references("id").inTable("users");
    table.timestamp("reviewed_at", { useTz: true });
    table.timestamp("closed_at", { useTz: true });

    table.check(`status IN ('Submitted', 'Approved', 'Rejected', 'Closed')`);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("final_documents");
}
