// seeds/06_settings.js
export async function seed(knex) {
  await knex("settings").del();

  await knex("settings").insert([
    {
      key: "submission_day",
      value: "Monday",
      description: "Day of week for (legacy) weekly loading plan submission",
    },
    {
      key: "timeline_days",
      value: "7",
      description: "Days for (legacy) timeline after permit issuance",
    },
    {
      key: "weekly_tonnage_limit",
      value: "1000",
      description: "Global weekly tonnage cap (legacy compatibility)",
    },
  ]);
}
