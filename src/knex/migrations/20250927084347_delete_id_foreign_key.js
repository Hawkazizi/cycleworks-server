export async function up(knex) {
  // Drop constraint only if it exists
  await knex.raw(`
    ALTER TABLE buyer_requests
    DROP CONSTRAINT IF EXISTS buyer_requests_buyer_id_foreign
  `);

  // Now recreate FK pointing to users.id
  await knex.schema.alterTable("buyer_requests", (table) => {
    table
      .integer("buyer_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE")
      .alter();
  });
}

export async function down(knex) {
  // Drop constraint only if it exists
  await knex.raw(`
    ALTER TABLE buyer_requests
    DROP CONSTRAINT IF EXISTS buyer_requests_buyer_id_foreign
  `);

  // Revert FK back to buyers.id
  await knex.schema.alterTable("buyer_requests", (table) => {
    table
      .integer("buyer_id")
      .notNullable()
      .references("id")
      .inTable("buyers")
      .onDelete("CASCADE")
      .alter();
  });
}
