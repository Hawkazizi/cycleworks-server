/**
 * @param { import("knex").Knex } knex
 */
export async function up(knex) {
  await knex.schema.alterTable("buyer_requests", (table) => {
    table
      .jsonb("admin_metadata")
      .defaultTo("{}")
      .comment(
        "Admin text metadata: BL NO, BL Date, Actual Quantity Received, ضایعات, اختلاف",
      );
    table
      .text("admin_metadata_status")
      .defaultTo("submitted")
      .comment("Review status: submitted | approved | rejected");
    table.text("admin_metadata_review_note").nullable();
    table
      .integer("admin_metadata_reviewed_by")
      .references("id")
      .inTable("admin_license_keys")
      .onDelete("SET NULL");
    table.timestamp("admin_metadata_reviewed_at", { useTz: true }).nullable();
  });

  console.log("✅ Added admin_metadata fields to buyer_requests");
}

/**
 * @param { import("knex").Knex } knex
 */
export async function down(knex) {
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.dropColumn("admin_metadata");
    table.dropColumn("admin_metadata_status");
    table.dropColumn("admin_metadata_review_note");
    table.dropColumn("admin_metadata_reviewed_by");
    table.dropColumn("admin_metadata_reviewed_at");
  });

  console.log("🗑️ Removed admin_metadata fields from buyer_requests");
}
