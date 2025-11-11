/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Drop the foreign key constraint on related_request_id
  await knex.schema.alterTable("notifications", (table) => {
    table.dropForeign(
      "related_request_id",
      "notifications_related_request_id_foreign",
    );
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  // Recreate the foreign key constraint in case of rollback
  await knex.schema.alterTable("notifications", (table) => {
    table
      .foreign("related_request_id", "notifications_related_request_id_foreign")
      .references("id")
      .inTable("buyer_requests")
      .onDelete("CASCADE");
  });
}
