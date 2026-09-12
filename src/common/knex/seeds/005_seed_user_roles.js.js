// seeds/05_user_roles.js
// ⚠️ DEV/TEST ONLY — never run `knex seed:run` against a production database.
export async function seed(knex) {
  await knex("user_roles").del();

  const roleMap = Object.fromEntries(
    (await knex("roles").select("id", "name")).map((r) => [r.name, r.id]),
  );
  const users = await knex("users").select("id", "email");
  const userMap = Object.fromEntries(users.map((u) => [u.email, u.id]));

  await knex("user_roles").insert([
    { user_id: userMap["admin@example.com"], role_id: roleMap["admin"] },
    { user_id: userMap["buyer@example.com"], role_id: roleMap["buyer"] },
    { user_id: userMap["manager@example.com"], role_id: roleMap["manager"] },
    {
      user_id: userMap["qc.internal@example.com"],
      role_id: roleMap["qc_internal"],
    },
    {
      user_id: userMap["qc.external@example.com"],
      role_id: roleMap["qc_external"],
    },
    { user_id: userMap["supplier@example.com"], role_id: roleMap["user"] },
    {
      user_id: userMap["supplier.pending@example.com"],
      role_id: roleMap["user"],
    },
  ]);
}