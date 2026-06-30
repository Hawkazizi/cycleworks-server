export const up = async function (knex) {
  await knex.schema.createTable("farmer_plan_files", (t) => {
    t.increments("id").primary();
    t.integer("plan_id")
      .notNullable()
      .references("id")
      .inTable("farmer_plans")
      .onDelete("CASCADE");
    // Optional logical key if you want to name file “slots”, e.g. "qc_label", "egg_image"
    t.string("file_key").nullable();

    // stored metadata
    t.string("original_name").notNullable();
    t.string("mime_type").notNullable();
    t.bigInteger("size_bytes").notNullable();
    t.string("path").notNullable(); // e.g. /uploads/plan-files/xxx.pdf (served statically)

    t.enu("status", ["submitted", "approved", "rejected"], {
      useNative: false,
      enumName: "farmer_plan_file_status",
    }).defaultTo("submitted");
    t.text("review_note").nullable();
    t.integer("reviewed_by")
      .nullable()
      .references("id")
      .inTable("admin_license_keys");
    t.timestamp("reviewed_at", { useTz: true }).nullable();

    t.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());

    t.index(["plan_id"]);
    t.index(["status"]);
  });
};

export const down = async function (knex) {
  await knex.schema.dropTableIfExists("farmer_plan_files");
};
