export async function up(knex) {
  await knex.schema.alterTable("farmer_plan_containers", (table) => {
    // 🟢 per-container farmer status
    table.string("farmer_status").defaultTo("pending");

    // 🔵 final status (after admin/manager review)
    table.string("final_status").defaultTo("pending");

    // 🟣 completion flag
    table.boolean("is_completed").defaultTo(false);
  });
}

export async function down(knex) {
  await knex.schema.alterTable("farmer_plan_containers", (table) => {
    table.dropColumn("farmer_status");
    table.dropColumn("final_status");
    table.dropColumn("is_completed");
  });
}
