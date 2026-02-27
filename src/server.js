import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import db from "./db/knex.js";
import path from "path";
import userRouter from "./routes/user.routes.js";
import superAdminRoutes from "./routes/superAdmin/superadmin.routes.js";
import adminRouter from "./routes/admin.routes.js";
import buyerRouter from "./routes/buyer.routes.js";
import containerRouter from "./routes/container.routes.js";
import externalQcRouter from "./routes/QC/externalQc.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import ticketRoutes from "./routes/ticket.routes.js";
import qcRoutes from "./routes/QC/qc.routes.js";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const __dirname = path.resolve();
// Middleware
app.use(express.json());

// ✅ Enable CORS
app.use(
  cors({
    origin: [
      "http://localhost:5173", // local dev
      "http://localhost:5174",
      "https://digipoultry.com", // production
      "https://www.digipoultry.com", // optional
      "http://195.177.255.233",
    ],
    credentials: true,
  }),
);

// ✅ serve uploads folder statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
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
});
