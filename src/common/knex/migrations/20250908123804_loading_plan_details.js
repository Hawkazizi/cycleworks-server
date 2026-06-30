export async function up(knex) {
  await knex.schema.createTable("loading_plan_details", (table) => {
    table.increments("id").primary();
    table
      .integer("weekly_loading_plan_id")
      .notNullable()
      .references("id")
      .inTable("weekly_loading_plans")
      .onDelete("CASCADE");
    table.date("loading_date").notNullable();
    table.integer("containers").notNullable().defaultTo(0);
    table.decimal("amount_tonnage", 10, 2).notNullable().defaultTo(0.0);
    table.text("notes");
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("loading_plan_details");
}
