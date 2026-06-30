import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

// 👇 Updated: Pointing to the new common/db location
import db, { dbIR, dbTR, als } from "./common/db/knex.js";

// 👇 Updated: Pointing to the new modules locations
import userRouter from "./modules/user/user.routes.js";
import superAdminRoutes from "./modules/superAdmin/superadmin.routes.js";
import adminRouter from "./modules/admin/admin.routes.js";
import buyerRouter from "./modules/buyer/buyer.routes.js";
import containerRouter from "./modules/container/container.routes.js";
import externalQcRouter from "./modules/qc/externalQc.routes.js";
import notificationRoutes from "./modules/notification/notification.routes.js";
import ticketRoutes from "./modules/ticket/ticket.routes.js";
import qcRoutes from "./modules/qc/qc.routes.js";

// 👇 Updated: Pointing to the new common/middleware location
import i18nMiddleware from "./common/middleware/i18n.js";

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
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
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
