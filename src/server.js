require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const pool = require("./db/pool");
const exhibitorZoneRouter = require("./routes/exhibitorZone");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/exhibitor-zone", exhibitorZoneRouter);

app.use("/api/exhibitor-zone", notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 4020;
app.listen(PORT, async () => {
  console.log(`Exhibitor Zone backend listening on port ${PORT}`);

  try {
    await pool.query("SELECT 1");
    console.log(`Database connected (${process.env.DB_NAME || "exhi_zone"} @ ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 3306})`);
  } catch (err) {
    console.error(`Database connection FAILED: ${err.message}`);
  }
});
