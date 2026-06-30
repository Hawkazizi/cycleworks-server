import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "./.env") });

const baseConfig = {
  client: "pg",
  pool: {
    min: 2,
    max: 10,
  },
  // 👇 Updated: Pointing to the new common/knex location
  migrations: {
    directory: "./src/common/knex/migrations",
  },
  seeds: {
    directory: "./src/common/knex/seeds",
  },
};

// 🇮🇷 IRAN CONFIG (Uses your existing .env variables as fallback)
const configIR = {
  ...baseConfig,
  connection: {
    host: process.env.DB_HOST_IR || process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT_IR || process.env.DB_PORT || 5432,
    user: process.env.DB_USER_IR || process.env.DB_USER,
    password: process.env.DB_PASSWORD_IR || process.env.DB_PASSWORD,
    database: process.env.DB_NAME_IR || process.env.DB_NAME || "db_iran",
  },
};

// 🇹🇷 TURKEY CONFIG (Add these to your .env file later)
const configTR = {
  ...baseConfig,
  connection: {
    host: process.env.DB_HOST_TR || process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT_TR || process.env.DB_PORT || 5432,
    user: process.env.DB_USER_TR || process.env.DB_USER,
    password: process.env.DB_PASSWORD_TR || process.env.DB_PASSWORD,
    database: process.env.DB_NAME_TR || "db_turkey", // Default name for TR
  },
};

// Export both. 'development' is kept as IR for backwards compatibility with scripts
export default {
  development: configIR,
  development_IR: configIR,
  development_TR: configTR,
};
