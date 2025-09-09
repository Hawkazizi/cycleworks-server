export async function seed(knex) {
  await knex("weekly_loading_plans").del();

  await knex("weekly_loading_plans").insert([
    {
      id: 1,
      export_permit_request_id: 1,
      week_start_date: "2025-09-08",
      status: "Submitted",
      reviewed_by: 2,
    },
  ]);
}
