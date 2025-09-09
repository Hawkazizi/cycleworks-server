export async function seed(knex) {
  await knex("export_permit_requests").del();

  await knex("export_permit_requests").insert([
    {
      id: 1,
      packing_unit_id: 1,
      destination_country: "Germany",
      max_tonnage: 100.0,
      status: "Permit_Issued",
      permit_document: "Permit PDF",
      issued_at: new Date(),
      timeline_start: new Date(),
      timeline_end: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000),
      reviewed_by: 2,
    },
  ]);
}
