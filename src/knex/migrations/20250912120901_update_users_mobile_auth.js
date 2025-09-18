export async function up(knex) {
  // Step 1: add column nullable (no constraint yet)
  await knex.schema.alterTable("users", (t) => {
    t.string("mobile", 20);
  });

  // Step 2: backfill with unique placeholders
  const users = await knex("users").select("id");
  for (const u of users) {
    await knex("users")
      .where({ id: u.id })
      .update({ mobile: `tmp_${u.id}` });
  }

  // Step 3: alter column to be not null + unique
  await knex.schema.alterTable("users", (t) => {
    t.string("mobile", 20).notNullable().unique().alter();
    t.string("email", 150).nullable().alter();
    t.string("name", 100).nullable().alter();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("users", (t) => {
    t.dropColumn("mobile");
    t.string("email", 150).notNullable().alter();
    t.string("name", 100).notNullable().alter();
  });
}
