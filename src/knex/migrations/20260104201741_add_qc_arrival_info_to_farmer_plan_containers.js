export const up = async (knex) => {
  await knex.schema.alterTable("farmer_plan_containers", (table) => {
    table
      .jsonb("qc_arrival_info")
      .nullable()
      .comment(
        "QC arrival metadata (arrived_at, arrival_place, future extensible fields)",
      );
  });
};

export const down = async (knex) => {
  await knex.schema.alterTable("farmer_plan_containers", (table) => {
    table.dropColumn("qc_arrival_info");
  });
};
