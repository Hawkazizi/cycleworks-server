export async function seed(knex) {
  await knex("export_documents").del();

  await knex("export_documents").insert([
    {
      id: 1,
      export_permit_request_id: 1,
      packing_list: "Packing List PDF",
      invoice: "Invoice PDF",
      veterinary_certificate: "Vet Cert PDF",
      status: "Sent_To_Sales",
      import_permit_document: "Import Permit PDF",
      sent_to_sales_at: new Date(),
      reviewed_by: 2,
    },
  ]);
}
