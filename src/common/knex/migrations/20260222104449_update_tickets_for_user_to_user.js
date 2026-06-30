/**
 * Add sender/recipient support to tickets:
 * - created_by: who created the ticket
 * - assigned_to: who should receive/respond
 * - last_message_at: for inbox sorting
 *
 * Keeps existing tickets.user_id for backward compatibility.
 */

export async function up(knex) {
  await knex.schema.alterTable("tickets", (table) => {
    table
      .integer("created_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");

    table
      .integer("assigned_to")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");

    table
      .timestamp("last_message_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  // Backfill created_by from existing user_id (old behavior: user_id = creator)
  await knex("tickets")
    .whereNull("created_by")
    .whereNotNull("user_id")
    .update({ created_by: knex.ref("user_id") });

  // Backfill last_message_at based on updated_at if present; else created_at
  // (This keeps inbox sorting sensible for old records)
  await knex("tickets").update({
    last_message_at: knex.raw("COALESCE(updated_at, created_at, NOW())"),
  });

  // Indexes for inbox / sent queries
  await knex.schema.alterTable("tickets", (table) => {
    table.index(
      ["assigned_to", "status", "updated_at"],
      "tickets_assigned_to_status_updated_idx",
    );
    table.index(["created_by", "updated_at"], "tickets_created_by_updated_idx");
    table.index(["last_message_at"], "tickets_last_message_at_idx");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("tickets", (table) => {
    table.dropIndex(
      ["assigned_to", "status", "updated_at"],
      "tickets_assigned_to_status_updated_idx",
    );
    table.dropIndex(
      ["created_by", "updated_at"],
      "tickets_created_by_updated_idx",
    );
    table.dropIndex(["last_message_at"], "tickets_last_message_at_idx");
  });

  await knex.schema.alterTable("tickets", (table) => {
    // drops FK + column
    table.dropColumn("assigned_to");
    table.dropColumn("created_by");
    table.dropColumn("last_message_at");
  });
}
