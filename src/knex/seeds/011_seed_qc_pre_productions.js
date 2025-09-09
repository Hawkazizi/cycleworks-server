export async function seed(knex) {
  await knex("qc_pre_productions").del();

  await knex("qc_pre_productions").insert([
    {
      id: 1,
      export_permit_request_id: 1,
      carton_label: "Carton A123",
      egg_image: "image_url.jpg",
      status: "Approved",
      reviewed_by: 2,
      reviewed_at: new Date(),
    },
  ]);
}
