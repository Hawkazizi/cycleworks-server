import knex from "knex";
import configs from "../../../knexfile.js";
import { AsyncLocalStorage } from "async_hooks";
import pg from "pg";

pg.types.setTypeParser(1082, (val) => val); // DATE

// 1. Initialize both database connections
export const dbIR = knex(configs.development_IR);
export const dbTR = knex(configs.development_TR);

// 2. Create the Async Local Storage instance
export const als = new AsyncLocalStorage();

// 3. Create a Proxy that intercepts all Knex calls and routes them dynamically
const handler = {
  get(target, prop, receiver) {
    const country = als.getStore();
    const currentDb = country === "TR" ? dbTR : dbIR;
    const val = currentDb[prop];
    if (typeof val === "function") {
      return val.bind(currentDb);
    }
    return val;
  },
  apply(target, thisArg, args) {
    const country = als.getStore();
    const currentDb = country === "TR" ? dbTR : dbIR;
    return currentDb(...args);
  },
};

// 4. Export the Proxy as the default 'db'
const db = new Proxy(function () {}, handler);

export default db;
