/**
 * Make replies authored by any user (not only admin_id).
 * Keeps admin_id for now, and backfills author_id from admin_id.
 */

export async function up(knex) {
  await knex.schema.alterTable("ticket_replies", (table) => {
    table
      .integer("author_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
  });

  // Backfill author_id from existing admin_id where possible
  await knex("ticket_replies")
    .whereNull("author_id")
    .whereNotNull("admin_id")
    .update({ author_id: knex.ref("admin_id") });

  // Helpful index for fetching thread
  await knex.schema.alterTable("ticket_replies", (table) => {
    table.index(
      ["ticket_id", "created_at"],
      "ticket_replies_ticket_id_created_at_idx",
    );
    table.index(
      ["author_id", "created_at"],
      "ticket_replies_author_id_created_at_idx",
    );
  });
}

export async function down(knex) {
  await knex.schema.alterTable("ticket_replies", (table) => {
    table.dropIndex(
      ["ticket_id", "created_at"],
      "ticket_replies_ticket_id_created_at_idx",
    );
    table.dropIndex(
      ["author_id", "created_at"],
      "ticket_replies_author_id_created_at_idx",
    );
  });

  await knex.schema.alterTable("ticket_replies", (table) => {
    table.dropColumn("author_id");
  });
}
