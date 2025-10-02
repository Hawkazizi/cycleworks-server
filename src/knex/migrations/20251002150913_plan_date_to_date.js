/**
 * Convert farmer_plans.plan_date to a pure DATE (no tz).
 * Also add a unique constraint so each farmer can only create one plan per day per request.
 */
export async function up(knex) {
  // Add a temp column as DATE
  await knex.schema.alterTable("farmer_plans", (t) => {
    t.date("plan_date__date_tmp");
  });

  // Copy data safely into the DATE column.
  // If old type was timestamptz: take it at server TZ and cast to date.
  // If old type was already date: this is a no-op.
  await knex.raw(`
    UPDATE farmer_plans
    SET plan_date__date_tmp =
      CASE
        WHEN pg_typeof(plan_date)::text IN ('timestamp with time zone','timestamptz') THEN (plan_date AT TIME ZONE current_setting('TIMEZONE'))::date
        WHEN pg_typeof(plan_date)::text IN ('timestamp without time zone','timestamp') THEN plan_date::date
        ELSE plan_date::date
      END
  `);

  // Drop any existing index/constraint that references old column type
  try {
    await knex.raw(
      `ALTER TABLE farmer_plans DROP CONSTRAINT IF EXISTS farmer_plans_unique_per_day`
    );
  } catch (_) {}

  // Drop old column and rename the tmp one to plan_date
  await knex.schema.alterTable("farmer_plans", (t) => {
    t.dropColumn("plan_date");
  });
  await knex.schema.alterTable("farmer_plans", (t) => {
    t.renameColumn("plan_date__date_tmp", "plan_date");
  });

  // Unique: one plan per farmer per request per day
  await knex.raw(`
    ALTER TABLE farmer_plans
    ADD CONSTRAINT farmer_plans_unique_per_day
    UNIQUE (request_id, farmer_id, plan_date)
  `);
}

export async function down(knex) {
  // Best-effort: turn date back to timestamp without tz (not recommended)
  await knex.schema.alterTable("farmer_plans", (t) => {
    t.timestamp("plan_date__ts_tmp", { useTz: true });
  });

  await knex.raw(`
    UPDATE farmer_plans
    SET plan_date__ts_tmp = plan_date::timestamp
  `);

  await knex.raw(
    `ALTER TABLE farmer_plans DROP CONSTRAINT IF EXISTS farmer_plans_unique_per_day`
  );

  await knex.schema.alterTable("farmer_plans", (t) => {
    t.dropColumn("plan_date");
  });
  await knex.schema.alterTable("farmer_plans", (t) => {
    t.renameColumn("plan_date__ts_tmp", "plan_date");
  });
}
