export async function up(knex) {
  // 1. Drop old workflow tables (if they exist)
  await knex.schema.dropTableIfExists("final_documents");
  await knex.schema.dropTableIfExists("export_documents");
  await knex.schema.dropTableIfExists("qc_pre_productions");
  await knex.schema.dropTableIfExists("loading_plan_details");
  await knex.schema.dropTableIfExists("weekly_loading_plans");
  await knex.schema.dropTableIfExists("export_permit_requests");
  await knex.schema.dropTableIfExists("packing_units");

  // 2. Update buyer_requests table
  await knex.schema.alterTable("buyer_requests", (table) => {
    // farmer step status
    if (!knex.client.config.client.includes("sqlite")) {
      table.string("farmer_status", 20).nullable(); // pending | accepted | rejected
    }

    // farmer weekly plan as JSON
    table.jsonb("farmer_plan").nullable();

    // farmer docs (array of files)
    table.jsonb("farmer_docs").nullable();

    // admin docs (array of files)
    table.jsonb("admin_docs").nullable();

    // final lifecycle status
    table.string("final_status", 20).nullable().defaultTo("pending");
  });
}

export async function down(knex) {
  // 1. Recreate dropped tables (minimal skeleton so rollback works)
  await knex.schema.createTable("packing_units", (table) => {
    table.increments("id").primary();
    table.string("name");
    table.integer("user_id").notNullable().references("users.id");
    table.text("address");
    table.string("status").defaultTo("Draft");
    table.text("rejection_reason");
    table.integer("reviewed_by").references("users.id");
    table.timestamp("reviewed_at");
    table.timestamps(true, true);
    table.jsonb("documents");
  });

  await knex.schema.createTable("export_permit_requests", (table) => {
    table.increments("id").primary();
    table
      .integer("packing_unit_id")
      .notNullable()
      .references("packing_units.id");
    table.string("destination_country");
    table.decimal("max_tonnage");
    table.string("status").defaultTo("Requested");
    table.text("rejection_reason");
    table.text("permit_document");
    table.timestamp("issued_at");
    table.timestamp("timeline_start");
    table.timestamp("timeline_end");
    table.integer("reviewed_by").references("users.id");
    table.timestamps(true, true);
    table.integer("buyer_request_id").references("buyer_requests.id");
  });

  await knex.schema.createTable("weekly_loading_plans", (table) => {
    table.increments("id").primary();
    table
      .integer("export_permit_request_id")
      .notNullable()
      .references("export_permit_requests.id");
    table.date("week_start_date");
    table.timestamp("submitted_at").defaultTo(knex.fn.now());
    table.string("status").defaultTo("Submitted");
    table.integer("reviewed_by").references("users.id");
    table.text("rejection_reason");
    table.timestamps(true, true);
    table.timestamp("reviewed_at");
  });

  await knex.schema.createTable("loading_plan_details", (table) => {
    table.increments("id").primary();
    table
      .integer("weekly_loading_plan_id")
      .notNullable()
      .references("weekly_loading_plans.id");
    table.date("loading_date");
    table.integer("containers").defaultTo(0);
    table.decimal("amount_tonnage").defaultTo(0);
    table.text("notes");
  });

  await knex.schema.createTable("qc_pre_productions", (table) => {
    table.increments("id").primary();
    table.text("carton_label");
    table.text("egg_image");
    table.timestamp("submitted_at").defaultTo(knex.fn.now());
    table.string("status").defaultTo("Submitted");
    table.text("rejection_reason");
    table.integer("reviewed_by").references("users.id");
    table.timestamp("reviewed_at");
    table
      .integer("weekly_loading_plan_id")
      .references("weekly_loading_plans.id");
  });

  await knex.schema.createTable("export_documents", (table) => {
    table.increments("id").primary();
    table
      .integer("export_permit_request_id")
      .notNullable()
      .references("export_permit_requests.id");
    table.text("packing_list");
    table.text("invoice");
    table.text("veterinary_certificate");
    table.timestamp("submitted_at").defaultTo(knex.fn.now());
    table.string("status").defaultTo("Submitted");
    table.integer("reviewed_by").references("users.id");
    table.text("rejection_reason");
    table.timestamp("reviewed_at");
  });

  await knex.schema.createTable("final_documents", (table) => {
    table.increments("id").primary();
    table
      .integer("export_permit_request_id")
      .notNullable()
      .references("export_permit_requests.id");
    table.text("certificate");
    table.text("packing_list");
    table.text("invoice");
    table.text("customs_declaration");
    table.text("shipping_license");
    table.text("certificate_of_origin");
    table.text("chamber_certificate");
    table.timestamp("submitted_at").defaultTo(knex.fn.now());
    table.string("status").defaultTo("Submitted");
    table.text("rejection_reason");
    table.integer("reviewed_by").references("users.id");
    table.timestamp("reviewed_at");
    table.timestamp("closed_at");
  });

  // 2. Remove added columns from buyer_requests
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.dropColumn("farmer_status");
    table.dropColumn("farmer_plan");
    table.dropColumn("farmer_docs");
    table.dropColumn("admin_docs");
    table.dropColumn("final_status");
  });
}
