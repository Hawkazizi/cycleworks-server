export async function seed(knex) {
  await knex("packing_units").del();

  await knex("packing_units").insert([
    {
      id: 1,
      name: "Farm A Packing Unit",
      user_id: 3,
      address: "Village Road 10, City",
      status: "Approved",
      document_1: "License Doc",
      document_2: "Ownership Proof",
      reviewed_by: 2,
      reviewed_at: new Date(),
    },
  ]);
}
