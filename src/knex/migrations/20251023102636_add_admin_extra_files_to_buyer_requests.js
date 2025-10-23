/**
 * @param { import("knex").Knex } knex
 */
export async function up(knex) {
  await knex.schema.alterTable("buyer_requests", (table) => {
    table
      .jsonb("admin_extra_files")
      .defaultTo("[]")
      .comment(
        "Additional admin files: BL NO, BL Date, Actual Quantity Received, ضایعات, اختلاف",
      );
  });

  console.log("✅ Added admin_extra_files column to buyer_requests");
}

/**
 * @param { import("knex").Knex } knex
 */
export async function down(knex) {
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.dropColumn("admin_extra_files");
  });

  console.log("🗑️ Removed admin_extra_files column");
}
