export async function up(knex) {
  await knex.schema.alterTable("user_applications", (table) => {
    table.dropColumn("files");

    table.jsonb("biosecurity").nullable();
    table.jsonb("vaccination").nullable();
    table.jsonb("emergency").nullable();
    table.jsonb("food_safety").nullable();
    table.jsonb("description").nullable();
    table.jsonb("farm_biosecurity").nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("user_applications", (table) => {
    table.dropColumn("biosecurity");
    table.dropColumn("vaccination");
    table.dropColumn("emergency");
    table.dropColumn("food_safety");
    table.dropColumn("description");
    table.dropColumn("farm_biosecurity");

    table.jsonb("files").nullable();
  });
}
