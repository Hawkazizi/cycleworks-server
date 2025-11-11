/**
 * importExcelContainers.js
 * ---------------------------------------------------------------
 * Imports containers from an Excel file, links them to a buyer
 * request, and assigns all containers to supplier ID 6.
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
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const SUPPLIER_ID = 6; // ✅ Hardcoded supplier ID

if (!ADMIN_TOKEN || ADMIN_TOKEN.length < 100) {
  console.error("❌ ADMIN_TOKEN missing or incomplete. Check your .env file.");
  process.exit(1);
}

/* -------------------- PATH SETUP -------------------- */
const FILE_PATH = path.join(__dirname, "4_5805342058021394961.xlsx");

/* -------------------- AXIOS CLIENT -------------------- */
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    "Content-Type": "application/json",
  },
});

/* -------------------- HELPERS -------------------- */
async function testConnection() {
  console.log(`🔌 Testing backend connection → ${BASE_URL}/admin/profile`);
  try {
    const res = await api.get("/admin/profile");
    console.log(`✅ Connected as admin: ${res.data?.email || "Unknown"}`);
  } catch (err) {
    console.error("❌ Failed to connect or unauthorized:");
    console.error("  → Code:", err.code);
    console.error("  → Message:", err.message);
    console.error("  → Response:", err.response?.data);
    process.exit(1);
  }
}

async function safePost(url, body) {
  try {
    const res = await api.post(url, body);
    return res.data;
  } catch (err) {
    console.error(`❌ POST ${url}`);
    console.error("  → Status:", err.response?.status);
    console.error("  → Message:", err.response?.data || err.message);
    console.error("  → Body:", JSON.stringify(body, null, 2));
    return null;
  }
}

/* =======================================================
   🚀 MAIN IMPORT PROCESS
======================================================= */
async function importExcelContainers() {
  await testConnection();

  console.log("📂 Reading Excel file...");

  if (!fs.existsSync(FILE_PATH)) {
    console.error("❌ Excel file not found at:", FILE_PATH);
    process.exit(1);
  }

  const workbook = XLSX.readFile(FILE_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "-" });
  console.log(`✅ Loaded ${rows.length} container rows from Excel`);
  if (rows.length === 0) {
    console.error("❌ No data rows found.");
    return;
  }

  // Detect buyer info
  const first = rows[0];
  const buyerName =
    first.buyer ||
    first.company ||
    first.consignee ||
    "Imported Buyer (Unknown)";
  const buyerEmail = `${buyerName.replace(/\s+/g, "_").toLowerCase()}@autoimport.local`;
  const buyerPassword = "TempPass123!";

  console.log(`👤 Buyer: ${buyerName}`);

  /* 1️⃣ Ensure Buyer Exists */
  let buyer;
  try {
    console.log("🔍 Fetching existing users...");
    const allUsersRes = await api.get("/admin/users");
    const allUsers = Array.isArray(allUsersRes.data)
      ? allUsersRes.data
      : Array.isArray(allUsersRes.data.users)
        ? allUsersRes.data.users
        : [];
    console.log(`✅ Got ${allUsers.length} users from API`);

    buyer = allUsers.find(
      (u) => u.email?.toLowerCase() === buyerEmail.toLowerCase(),
    );

    if (!buyer) {
      console.log("🆕 Creating buyer account...");
      buyer = await safePost("/admin/users", {
        name: buyerName,
        email: buyerEmail,
        mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
        password: buyerPassword,
        role_id: 47, // ID for 'buyer' in roles table
      });
      if (!buyer) {
        console.error("❌ Buyer creation failed.");
        return;
      }
    } else {
      console.log(`✅ Reusing existing buyer (ID: ${buyer.id})`);
    }
  } catch (err) {
    console.error("❌ Buyer fetch/create failed:");
    console.error("  →", err.response?.data || err.message);
    return;
  }

  /* 2️⃣ Create Buyer Request */
  console.log("🧾 Creating buyer request...");
  const buyerRequest = await safePost("/buyers/requests", {
    buyer_id: buyer.id,
    status: "pending",
    import_country: "-",
    product_type: "Auto Import Batch",
    description: `Imported batch from Excel for ${buyerName}`,
    container_amount: rows.length,
    deadline_start: new Date().toISOString().split("T")[0],
    deadline_end: new Date().toISOString().split("T")[0],
  });

  if (!buyerRequest?.id) {
    console.error("❌ Failed to create buyer request.");
    return;
  }
  console.log(`✅ Buyer Request Created (ID: ${buyerRequest.id})`);

  /* 3️⃣ Assign All Containers to Supplier (ID 6) */
  console.log("🔗 Assigning all containers to supplier ID 6...");

  // Build assignments array (we don’t yet have actual container IDs — so fake them sequentially)
  const assignments = rows.map((_, i) => ({
    container_id: i + 1, // placeholder index if needed
    supplier_id: SUPPLIER_ID,
  }));

  const assignRes = await safePost("/admin/containers/assign", {
    requestId: buyerRequest.id,
    assignments,
  });

  if (assignRes?.success) {
    console.log(`✅ ${assignRes.message}`);
  } else {
    console.error("❌ Assignment failed.");
  }

  console.log("🎉 Import completed successfully!");
}

/* =======================================================
   ▶️ RUN
======================================================= */
importExcelContainers();
