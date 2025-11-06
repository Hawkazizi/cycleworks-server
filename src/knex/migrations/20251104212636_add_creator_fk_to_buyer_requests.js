export async function up(knex) {
  const hasFk = await knex.raw(`
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'buyer_requests'
      AND constraint_name = 'buyer_requests_creator_id_foreign';
  `);

  if (hasFk.rows.length === 0) {
    await knex.schema.alterTable("buyer_requests", (table) => {
      table.integer("creator_id").notNullable().alter();
      table
        .foreign("creator_id")
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
    });
  }
}

export async function down(knex) {
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.dropForeign(["creator_id"]);
  });
}
