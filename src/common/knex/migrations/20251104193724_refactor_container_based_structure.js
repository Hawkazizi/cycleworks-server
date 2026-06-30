export async function up(knex) {
  // 1️⃣ Buyer Requests Cleanup
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.dropColumn("farmer_status");
    table.dropColumn("farmer_plan");
    table.dropColumn("farmer_docs");
    table.dropColumn("admin_docs");
    table.dropColumn("final_status");
    table.dropColumn("is_completed");
    table.dropColumn("completed_at");
    table.dropColumn("deadline_start_date");
    table.dropColumn("deadline_end_date");
  });

  // 2️⃣ Farmer Plan Containers Enhancement
  await knex.schema.alterTable("farmer_plan_containers", (table) => {
    table
      .integer("buyer_request_id")
      .references("id")
      .inTable("buyer_requests")
      .onDelete("CASCADE")
      .index();

    table.jsonb("transport_info").notNullable().defaultTo("{}");
    table.string("tracking_code", 150).nullable();
    table.timestamp("completed_at").nullable();

    // Add useful indexes
    table.index(
      ["status", "in_progress", "is_completed"],
      "farmer_plan_containers_status_idx",
    );
  });

  // 3️⃣ Buyer Request Suppliers Enhancement
  await knex.schema.alterTable("buyer_request_suppliers", (table) => {
    table
      .integer("container_id")
      .nullable()
      .references("id")
      .inTable("farmer_plan_containers")
      .onDelete("CASCADE");

    table.unique(["buyer_request_id", "supplier_id", "container_id"], {
      indexName: "buyer_request_suppliers_unique_combination",
    });
  });

  // 4️⃣ Container Tracking Statuses Indexes
  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    table.index(
      ["status", "created_at"],
      "container_tracking_statuses_status_time_idx",
    );
  });
}

export async function down(knex) {
  // Reverse all changes
  await knex.schema.alterTable("buyer_request_suppliers", (table) => {
    table.dropUnique(
      ["buyer_request_id", "supplier_id", "container_id"],
      "buyer_request_suppliers_unique_combination",
    );
    table.dropColumn("container_id");
  });

  await knex.schema.alterTable("farmer_plan_containers", (table) => {
    table.dropColumn("buyer_request_id");
    table.dropColumn("transport_info");
    table.dropColumn("tracking_code");
    table.dropColumn("completed_at");
    table.dropIndex("farmer_plan_containers_status_idx");
  });

  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    table.dropIndex("container_tracking_statuses_status_time_idx");
  });

  await knex.schema.alterTable("buyer_requests", (table) => {
    table.string("farmer_status", 20).nullable();
    table.jsonb("farmer_plan").defaultTo("{}");
    table.jsonb("farmer_docs").defaultTo("[]");
    table.jsonb("admin_docs").defaultTo("[]");
    table.string("final_status", 20).defaultTo("pending");
    table.boolean("is_completed").defaultTo(false);
    table.timestamp("completed_at").nullable();
    table.date("deadline_start_date").nullable();
    table.date("deadline_end_date").nullable();
  });
}
