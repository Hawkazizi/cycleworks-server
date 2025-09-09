import express from "express";
import dotenv from "dotenv";
import db from "./db/knex.js";
import userRouter from "./routes/user.routes.js";
import adminRouter from "./routes/admin.routes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());

// Healthcheck
app.get("/", (req, res) => {
  res.send("CycleWorks API is running 🚀");
});

// Routes
app.use("/api/users", userRouter);
app.use("/api/admin", adminRouter);

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
