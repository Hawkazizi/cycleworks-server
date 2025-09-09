export async function seed(knex) {
  await knex("loading_plan_details").del();

  await knex("loading_plan_details").insert([
    {
      id: 1,
      weekly_loading_plan_id: 1,
      loading_date: "2025-09-10",
      containers: 10,
      amount_tonnage: 50.0,
      notes: "First batch",
    },
  ]);
}
