export async function up(knex) {
  const exists = await knex.schema.hasColumn(
    "farmer_plan_containers",
    "plan_date",
  );
  if (!exists) {
    await knex.schema.alterTable("farmer_plan_containers", (t) => {
      t.date("plan_date")
        .nullable()
        .comment("Selected loading date for this container");
    });
  }
}

export async function down(knex) {
  const exists = await knex.schema.hasColumn(
    "farmer_plan_containers",
    "plan_date",
  );
  if (exists) {
    await knex.schema.alterTable("farmer_plan_containers", (t) => {
      t.dropColumn("plan_date");
    });
  }
}
