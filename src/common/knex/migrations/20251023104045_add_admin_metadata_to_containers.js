/**
 * @param { import("knex").Knex } knex
 */
export async function up(knex) {
  await knex.schema.alterTable("farmer_plan_containers", (table) => {
    table
      .jsonb("admin_metadata")
      .defaultTo("{}")
      .comment(
        "Final notes by admin per container: BL NO, BL Date, Actual Quantity Received, ضایعات, اختلاف",
      );

    table
      .text("admin_metadata_status")
      .defaultTo("submitted")
      .comment("Admin metadata review status: submitted | approved | rejected");

    table.text("admin_metadata_review_note").nullable();

    table
      .integer("admin_metadata_reviewed_by")
      .references("id")
      .inTable("admin_license_keys")
      .onDelete("SET NULL");

    table.timestamp("admin_metadata_reviewed_at", { useTz: true }).nullable();
  });

  console.log("✅ Added admin_metadata fields to farmer_plan_containers");
}

/**
 * @param { import("knex").Knex } knex
 */
export async function down(knex) {
  await knex.schema.alterTable("farmer_plan_containers", (table) => {
    table.dropColumn("admin_metadata");
    table.dropColumn("admin_metadata_status");
    table.dropColumn("admin_metadata_review_note");
    table.dropColumn("admin_metadata_reviewed_by");
    table.dropColumn("admin_metadata_reviewed_at");
  });

  console.log("🗑️ Removed admin_metadata fields from farmer_plan_containers");
}
