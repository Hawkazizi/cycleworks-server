export async function seed(knex) {
  await knex("final_documents").del();

  await knex("final_documents").insert([
    {
      id: 1,
      export_permit_request_id: 1,
      certificate: "Certificate PDF",
      packing_list: "Packing List PDF",
      invoice: "Invoice PDF",
      customs_declaration: "Customs PDF",
      shipping_license: "Shipping License PDF",
      certificate_of_origin: "Origin Cert PDF",
      chamber_certificate: "Chamber Cert PDF",
      status: "Approved",
      reviewed_by: 2,
      reviewed_at: new Date(),
    },
  ]);
}
