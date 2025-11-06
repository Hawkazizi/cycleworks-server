export async function up(knex) {
  await knex.schema.alterTable("farmer_plans", (t) => {
    t.integer("farmer_id").nullable().alter();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("farmer_plans", (t) => {
    t.integer("farmer_id").notNullable().alter();
  });
}
