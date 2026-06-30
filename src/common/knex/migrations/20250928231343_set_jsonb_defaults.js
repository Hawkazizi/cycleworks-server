/**
 * Set safe defaults for JSONB fields in buyer_requests
 * - farmer_docs → []
 * - admin_docs → []
 * - farmer_plan → {}
 */
export async function up(knex) {
  // 1. Set defaults at schema level
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.jsonb("farmer_docs").defaultTo(knex.raw("'[]'::jsonb")).alter();
    table.jsonb("admin_docs").defaultTo(knex.raw("'[]'::jsonb")).alter();
    table.jsonb("farmer_plan").defaultTo(knex.raw("'{}'::jsonb")).alter();
  });

  // 2. Normalize existing rows
  await knex("buyer_requests")
    .whereNull("farmer_docs")
    .update({ farmer_docs: knex.raw("'[]'::jsonb") });

  await knex("buyer_requests")
    .whereNull("admin_docs")
    .update({ admin_docs: knex.raw("'[]'::jsonb") });

  await knex("buyer_requests")
    .whereNull("farmer_plan")
    .update({ farmer_plan: knex.raw("'{}'::jsonb") });
}

export async function down(knex) {
  // Rollback: remove defaults (but keep columns intact)
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.jsonb("farmer_docs").defaultTo(null).alter();
    table.jsonb("admin_docs").defaultTo(null).alter();
    table.jsonb("farmer_plan").defaultTo(null).alter();
  });
}
