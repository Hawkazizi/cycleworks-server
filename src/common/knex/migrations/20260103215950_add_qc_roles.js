export const up = async (knex) => {
  await knex.raw(`
    INSERT INTO roles (name)
    VALUES ('qc_internal'), ('qc_external')
    ON CONFLICT (name) DO NOTHING;
  `);
};

export const down = async (knex) => {
  // Optional rollback — usually NOT recommended in production
  await knex("roles").whereIn("name", ["qc_internal", "qc_external"]).del();
};
