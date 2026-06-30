/**
 * @param { import("knex").Knex } knex
 */
export async function up(knex) {
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.dropColumn("admin_metadata");
    table.dropColumn("admin_metadata_status");
    table.dropColumn("admin_metadata_review_note");
    table.dropColumn("admin_metadata_reviewed_by");
    table.dropColumn("admin_metadata_reviewed_at");
  });

  console.log("🗑️ Removed admin metadata fields from buyer_requests");
}

/**
 * @param { import("knex").Knex } knex
 */
export async function down(knex) {
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.jsonb("admin_metadata").defaultTo("{}");
    table.text("admin_metadata_status").defaultTo("submitted");
    table.text("admin_metadata_review_note").nullable();
    table
      .integer("admin_metadata_reviewed_by")
      .references("id")
      .inTable("admin_license_keys")
      .onDelete("SET NULL");
    table.timestamp("admin_metadata_reviewed_at", { useTz: true }).nullable();
  });

  console.log("↩️ Re-added admin metadata fields to buyer_requests");
}
