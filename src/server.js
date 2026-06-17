import express from "express";
import dotenv from "dotenv";
import cors from "cors";
// 👇 Import the Proxy (db) AND the raw connections (dbIR, dbTR) + AsyncLocalStorage (als)
import db, { dbIR, dbTR, als } from "./db/knex.js";
import path from "path";
import { fileURLToPath } from "url";

// Routes
import userRouter from "./routes/user.routes.js";
import superAdminRoutes from "./routes/superAdmin/superadmin.routes.js";
import adminRouter from "./routes/admin.routes.js";
import buyerRouter from "./routes/buyer.routes.js";
import containerRouter from "./routes/container.routes.js";
import externalQcRouter from "./routes/QC/externalQc.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import ticketRoutes from "./routes/ticket.routes.js";
import qcRoutes from "./routes/QC/qc.routes.js";

// ✅ i18n middleware
import i18nMiddleware from "./middleware/i18n.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(express.json());

// ✅ Enable CORS
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://digipoultry.com",
      "https://www.digipoultry.com",
      "http://195.177.255.233",
    ],
    credentials: true,
  }),
);

// ✅ Serve uploads folder statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ i18n middleware (MUST be before routes)
app.use(i18nMiddleware);

// ✅ NEW: Multi-tenancy middleware (MUST be before routes)
app.use((req, res, next) => {
  // Read the header sent by the frontend (defaults to IR if missing)
  const country = req.headers["x-country"]?.toUpperCase() || "IR";

  // Run the rest of the request lifecycle inside the AsyncLocalStorage context
  als.run(country, next);
});

// Healthcheck
app.get("/", (req, res) => {
  res.send("CycleWorks API is running 🚀");
});

// Routes
app.use("/api/superadmin", superAdminRoutes);
app.use("/api/users", userRouter);
app.use("/api/admin", adminRouter);
app.use("/api/buyers", buyerRouter);
app.use("/api/containers", containerRouter);
app.use("/api/notifications", notificationRoutes);
app.use("/api/qc", qcRoutes);
app.use("/api/external-qc", externalQcRouter);
app.use("/api/tickets", ticketRoutes);

// Test BOTH DB connections on startup
Promise.all([
  dbIR
    .raw("SELECT 1+1 AS result")
    .then(() => console.log("✅ Iran DB connected")),
  dbTR
    .raw("SELECT 1+1 AS result")
    .then(() => console.log("✅ Turkey DB connected")),
]).catch((err) => {
  console.error("❌ Database connection failed:", err);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log(`🌐 Supported languages: fa, en, tr`);
  console.log(`🗄️ Multi-tenancy enabled: IR (Iran), TR (Turkey)`);
});
