/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Check if columns already exist to avoid errors on re-run
  const hasMetadata = await knex.schema.hasColumn(
    "farmer_plan_containers",
    "metadata",
  );

  if (!hasMetadata) {
    await knex.schema.alterTable("farmer_plan_containers", (table) => {
      table
        .jsonb("metadata")
        .defaultTo("{}")
        .comment("Container additional info (invoice, brand, consignee, etc.)");
      table
        .text("metadata_status")
        .defaultTo("submitted")
        .comment("Review status for metadata: submitted | approved | rejected");
      table
        .text("metadata_review_note")
        .nullable()
        .comment("Admin review note for metadata");
      table
        .integer("metadata_reviewed_by")
        .nullable()
        .references("id")
        .inTable("admin_license_keys")
        .onDelete("SET NULL")
        .comment("Admin reviewer ID from admin_license_keys");
      table
        .timestamp("metadata_reviewed_at", { useTz: true })
        .nullable()
        .comment("Timestamp of metadata review");
    });

    console.log("✅ Added metadata columns to farmer_plan_containers table");
  } else {
    console.log(
      "ℹ️ Metadata columns already exist in farmer_plan_containers table",
    );
  }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const hasMetadata = await knex.schema.hasColumn(
    "farmer_plan_containers",
    "metadata",
  );

  if (hasMetadata) {
    await knex.schema.alterTable("farmer_plan_containers", (table) => {
      table.dropColumn("metadata");
      table.dropColumn("metadata_status");
      table.dropColumn("metadata_review_note");
      table.dropColumn("metadata_reviewed_by");
      table.dropColumn("metadata_reviewed_at");
    });

    console.log(
      "🗑️ Removed metadata columns from farmer_plan_containers table",
    );
  }
}
