/**
 * applyContainerMetadata.js
 * ---------------------------------------------------------------
 * Applies metadata from an Excel file to each container belonging
 * to supplier ID 6 using their user token.
 * ---------------------------------------------------------------
 */

import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import XLSX from "xlsx";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ✅ Load .env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/* -------------------- CONFIG -------------------- */
const BASE_URL = process.env.BASE_URL || "http://localhost:5000/api";
const SUPPLIER_TOKEN =
  process.env.SUPPLIER_TOKEN ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NiwibW9iaWxlIjoiMDk5Mzk3Njc4MjkiLCJyb2xlcyI6WyJ1c2VyIl0sImlhdCI6MTc2Mjg2OTc0MSwiZXhwIjoxNzYyOTU2MTQxfQ.-wrxhFwUBY6aMKANo0eb9HbDA3mfvHh6aaU56d6RnAM";
const FILE_PATH = path.join(__dirname, "4_5805342058021394961.xlsx");

if (!SUPPLIER_TOKEN || SUPPLIER_TOKEN.length < 50) {
  console.error("❌ Supplier token missing or invalid");
  process.exit(1);
}

/* -------------------- AXIOS CLIENT -------------------- */
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${SUPPLIER_TOKEN}`,
    "Content-Type": "application/json",
  },
});

/* -------------------- HELPERS -------------------- */
async function getContainers() {
  console.log("📦 Fetching containers for supplier 6...");
  try {
    const res = await api.get("/containers/my-containers-with-tracking");
    const list = Array.isArray(res.data) ? res.data : res.data.containers || [];
    console.log(`✅ Found ${list.length} containers`);
    return list;
  } catch (err) {
    console.error(
      "❌ Failed to fetch containers:",
      err.response?.data || err.message,
    );
    process.exit(1);
  }
}

function buildMetadata(row) {
  const meta = {
    ty_number: row["Ty Number"] || row["TY"] || row["ty_number"] || "",
    invoice_no: row["Invoice Number"] || row["invoice_no"] || "",
    invoice_date: formatDate(row["Invoice Date"]),
    egg_brand: row["Brand"] || row["egg_brand"] || "",
    trade_card: row["Commercial Card"] || row["trade_card"] || "",
    zip_code_ex: row["Zip Code"] || row["zip_code_ex"] || "",
    veterinary_health_certificate_no:
      row["Veterinary Health Certificate Number"] ||
      row["veterinary_health_certificate_no"] ||
      "",
    quantity: row["Quantity"] || row["quantity"] || "",
    net_weight: row["Net Weight"] || row["net_weight"] || "",
    date_of_production: formatDate(row["Date of Production"]),
    date_of_expiry:
      formatDate(row["Date of Expiry"]) ||
      calculateExpiry(row["Date of Production"]),
    shipper: row["Shipper"] || row["supplier_unit"] || "",
  };
  return Object.fromEntries(
    Object.entries(meta).map(([k, v]) => [k, v === undefined ? "" : v]),
  );
}

function formatDate(val) {
  if (!val) return "";
  try {
    const d = new Date(val);
    if (!isNaN(d)) return d.toISOString().split("T")[0];
  } catch {
    // ignore
  }
  return "";
}

function calculateExpiry(prod) {
  if (!prod) return "";
  const d = new Date(prod);
  if (isNaN(d)) return "";
  d.setDate(d.getDate() + 90);
  return d.toISOString().split("T")[0];
}

async function applyMetadata(containerId, metadata) {
  try {
    await api.patch(`/users/containers/${containerId}/metadata`, metadata);
    console.log(`✅ Metadata applied to container ID ${containerId}`);
  } catch (err) {
    console.error(
      `❌ Failed for container ${containerId}:`,
      err.response?.data || err.message,
    );
  }
}

/* =======================================================
   🚀 MAIN PROCESS
======================================================= */
async function main() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error("❌ Excel file not found at:", FILE_PATH);
    process.exit(1);
  }

  console.log("📖 Reading Excel...");
  const workbook = XLSX.readFile(FILE_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  console.log(`✅ Loaded ${rows.length} rows from Excel`);

  const containers = await getContainers();
  if (containers.length === 0) {
    console.error("❌ No containers found for supplier 6");
    return;
  }

  const count = Math.min(rows.length, containers.length);
  console.log(
    `🔁 Updating ${count} containers (Excel rows: ${rows.length}, Containers: ${containers.length})`,
  );

  for (let i = 0; i < count; i++) {
    const container = containers[i];
    const row = rows[i];
    if (!container || !container.container_id) {
      console.warn(`⚠️ Skipping Excel row ${i + 1} — no matching container`);
      continue;
    }

    const metadata = buildMetadata(row);
    console.log(
      `➡️  [${i + 1}/${count}] Applying metadata to container ID ${container.container_id}`,
    );

    await applyMetadata(container.container_id, metadata);
  }

  console.log("🎉 All metadata applied successfully!");
}

main();
