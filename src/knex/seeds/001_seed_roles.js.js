export async function seed(knex) {
  await knex("roles").del();

  await knex("roles").insert([
    { name: "admin" },
    { name: "manager" },
    { name: "user" },
  ]);
}
