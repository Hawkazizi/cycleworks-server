export async function up(knex) {
  await knex.schema.createTable("export_permit_requests", (table) => {
    table.increments("id").primary();
    table
      .integer("packing_unit_id")
      .notNullable()
      .references("id")
      .inTable("packing_units")
      .onDelete("CASCADE");
    table.string("destination_country", 100).notNullable();
    table.decimal("max_tonnage", 10, 2).notNullable();
    table.string("status", 20).notNullable().defaultTo("Requested");
    table.text("rejection_reason");
    table.text("permit_document");
    table.timestamp("issued_at", { useTz: true });
    table.timestamp("timeline_start", { useTz: true });
    table.timestamp("timeline_end", { useTz: true });
    table.integer("reviewed_by").references("id").inTable("users");
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());

    table.check(
      `status IN ('Requested', 'Permit_Issued', 'Timeline_Active', 'Rejected')`
    );
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("export_permit_requests");
}
