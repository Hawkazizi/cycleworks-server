export const up = (knex) => {
  return knex.schema.table("user_applications", (table) => {
    table.jsonb("all_documents").nullable();
  });
};

export const down = (knex) => {
  return knex.schema.table("user_applications", (table) => {
    table.dropColumn("all_documents");
  });
};
