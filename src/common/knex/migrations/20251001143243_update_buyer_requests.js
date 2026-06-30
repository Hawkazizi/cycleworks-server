// migrations/20251001_update_buyer_requests.js
export async function up(knex) {
  // Step 1: drop old array columns + quantity
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.dropColumn("quantity");
    table.dropColumn("packaging");
    table.dropColumn("egg_type");
  });

  // Step 2: add new string columns
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.string("packaging").nullable();
    table.string("egg_type").nullable();
    table.integer("container_amount").nullable();
    table.date("deadline_date").nullable();
    table.integer("expiration_days").nullable();
    table.string("transport_type").nullable();
  });
}

export async function down(knex) {
  // Step 1: drop new cols
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.dropColumn("packaging");
    table.dropColumn("egg_type");
    table.dropColumn("container_amount");
    table.dropColumn("deadline_date");
    table.dropColumn("expiration_days");
    table.dropColumn("transport_type");
  });

  // Step 2: restore old ones
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.decimal("quantity").notNullable().defaultTo(0);
    table.specificType("packaging", "text[]").defaultTo("{}");
    table.specificType("egg_type", "text[]").defaultTo("{}");
  });
}
