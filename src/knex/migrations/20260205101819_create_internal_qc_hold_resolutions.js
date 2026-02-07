/**
 * @param { import("knex").Knex } knex
 */
export async function up(knex) {
  await knex.schema.createTable("internal_qc_hold_resolutions", (table) => {
    table.increments("id").primary();

    table
      .integer("container_id")
      .notNullable()
      .references("id")
      .inTable("farmer_plan_containers")
      .onDelete("CASCADE");

    table.string("previous_qc_status", 30).notNullable();

    table.string("resolution_action", 30).notNullable();
    // e.g. release_hold, request_reinspection, reject_container

    table.text("resolution_note").nullable();

    table
      .integer("resolved_by")
      .notNullable()
      .references("id")
      .inTable("admin_license_keys");

    table.boolean("send_back_to_qc").notNullable().defaultTo(true);

    table
      .timestamp("resolved_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // helpful indexes
    table.index(["container_id"]);
    table.index(["resolution_action"]);
  });
}

/**
 * @param { import("knex").Knex } knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists("internal_qc_hold_resolutions");
}
