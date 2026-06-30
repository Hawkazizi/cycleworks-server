export const up = async (knex) => {
  await knex.schema.createTable("notifications", (table) => {
    table.increments("id").primary();
    table.integer("user_id").unsigned().notNullable(); // Who receives it
    table
      .enum("type", ["new_request", "request_accepted", "status_updated"])
      .notNullable();
    table
      .integer("related_request_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("buyer_requests");
    table.enum("status", ["unread", "read"]).defaultTo("unread");
    table.text("message").notNullable();
    table.jsonb("data").nullable(); // Extra info
    table.timestamps(true, true);

    // Indexes for FAST queries
    table.index(["user_id", "status"]);
    table.index("related_request_id");
  });
};

export const down = async (knex) => {
  await knex.schema.dropTable("notifications");
};
