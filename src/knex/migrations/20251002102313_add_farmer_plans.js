export const up = async function (knex) {
  await knex.schema.createTable("farmer_plans", (t) => {
    t.increments("id").primary();
    t.integer("request_id")
      .notNullable()
      .references("id")
      .inTable("buyer_requests")
      .onDelete("CASCADE");
    t.integer("farmer_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    t.date("plan_date").notNullable();
    t.integer("container_amount")
      .notNullable()
      .checkPositive("container_amount_gt0");
    t.enu("status", ["submitted", "approved", "rejected"], {
      useNative: false,
      enumName: "farmer_plan_status",
    }).defaultTo("submitted");
    t.integer("reviewed_by")
      .nullable()
      .references("id")
      .inTable("admin_license_keys");
    t.timestamp("reviewed_at", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());

    t.unique(["request_id", "plan_date"]); // one row per day per request
    t.index(["request_id"]);
    t.index(["farmer_id"]);
    t.index(["plan_date"]);
  });
};

export const down = async function (knex) {
  await knex.schema.dropTableIfExists("farmer_plans");
};
