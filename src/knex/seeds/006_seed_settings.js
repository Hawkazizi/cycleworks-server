export async function seed(knex) {
  await knex("settings").del(); // clear table first

  await knex("settings").insert([
    {
      key: "submission_day",
      value: "Monday",
      description: "Day of week for weekly loading plan submission",
    },
    {
      key: "timeline_days",
      value: "7",
      description: "Days for production/loading timeline after permit issuance",
    },
  ]);
}
