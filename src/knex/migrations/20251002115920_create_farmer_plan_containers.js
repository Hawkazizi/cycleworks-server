// migrations/20251002_create_farmer_plan_containers.js
export async function up(knex) {
  await knex.schema.createTable("farmer_plan_containers", (table) => {
    table.increments("id").primary();
    table
      .integer("plan_id")
      .notNullable()
      .references("id")
      .inTable("farmer_plans")
      .onDelete("CASCADE");

    table.integer("container_no").notNullable(); // 1, 2, 3... within that plan/day
    table.string("status").defaultTo("submitted"); // submitted / approved / rejected
    table.integer("reviewed_by").references("id").inTable("admin_license_keys");
    table.timestamp("reviewed_at");
    table.timestamps(true, true);

    table.unique(["plan_id", "container_no"]); // no duplicate container number in same plan
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("farmer_plan_containers");
}
