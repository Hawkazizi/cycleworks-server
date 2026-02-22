// knex migration: 2026xxxx_create_ticket_recipients.js
export async function up(knex) {
  await knex.schema.createTable("ticket_recipients", (t) => {
    t.increments("id").primary();
    t.integer("ticket_id")
      .notNullable()
      .references("id")
      .inTable("tickets")
      .onDelete("CASCADE");
    t.integer("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    t.unique(["ticket_id", "user_id"]);
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable("tickets", (t) => {
    // optional but recommended:
    // keep assigned_to for backward compat, or remove later
    // t.integer("assigned_to").nullable().alter();
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("ticket_recipients");
}
