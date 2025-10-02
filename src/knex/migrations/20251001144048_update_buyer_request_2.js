export async function up(knex) {
  // Step 1: drop the old array column
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.dropColumn("product_type");
  });

  // Step 2: add back as string
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.string("product_type").nullable(); // e.g. "eggs"
  });
}

export async function down(knex) {
  // revert to text[] array
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.dropColumn("product_type");
  });

  await knex.schema.alterTable("buyer_requests", (table) => {
    table.specificType("product_type", "text[]").defaultTo("{}");
  });
}
