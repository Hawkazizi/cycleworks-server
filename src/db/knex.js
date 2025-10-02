import knex from "knex";
import config from "../../knexfile.js";
import pg from "pg";

pg.types.setTypeParser(1082, (val) => val); // DATE

const db = knex(config);

export default db;
