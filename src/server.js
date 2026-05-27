import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import db from "./db/knex.js";
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

// ✅ NEW: i18n middleware
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

// Test DB connection on startup
db.raw("SELECT 1+1 AS result")
  .then(() => {
    console.log("✅ Database connected");
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err);
  });

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log(`🌐 Supported languages: fa, en, tr`);
});
