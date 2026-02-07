export async function up(knex) {
  await knex.schema.createTable("external_qc_reports", (table) => {
    table.increments("id").primary();

    table
      .integer("container_id")
      .notNullable()
      .references("id")
      .inTable("farmer_plan_containers")
      .onDelete("CASCADE");

    table
      .integer("qc_license_id")
      .notNullable()
      .references("id")
      .inTable("admin_license_keys")
      .onDelete("RESTRICT");

    // External QC confirmation data
    table.integer("actual_quantity").notNullable();

    table.text("quality_condition").nullable(); // کیفیت
    table.text("packaging_condition").nullable(); // بسته بندی
    table.text("discrepancies").nullable(); // مغایرت‌ها

    table.jsonb("attachments").notNullable().defaultTo(knex.raw("'[]'::jsonb"));

    table
      .timestamp("confirmed_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(["container_id"], "external_qc_reports_unique_container");
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("external_qc_reports");
}
