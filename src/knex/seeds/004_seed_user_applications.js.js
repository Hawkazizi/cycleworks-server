export async function seed(knex) {
  await knex("user_applications").del();

  const admin = await knex("users")
    .where({ email: "admin@example.com" })
    .first();
  const manager = await knex("users")
    .where({ email: "manager@example.com" })
    .first();
  const user = await knex("users").where({ email: "user@example.com" }).first();

  await knex("user_applications").insert([
    {
      reason: "I want to sell my products.",
      user_id: user.id,
      status: "pending",
      created_at: knex.fn.now(),
    },
    {
      reason: "I want to manage sellers.",
      user_id: manager.id,
      status: "approved",
      reviewed_by: admin.id,
      reviewed_at: knex.fn.now(),
      created_at: knex.fn.now(),
    },
  ]);
}
