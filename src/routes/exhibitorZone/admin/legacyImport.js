const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const pool = require("../../../db/pool");
const asyncHandler = require("../../../middleware/asyncHandler");
const requireAuth = require("../../../middleware/requireAuth");
const requireRole = require("../../../middleware/requireRole");
const requireEventContext = require("../../../middleware/requireEventContext");
const { ApiError } = require("../../../middleware/errorHandler");
const { planImport, checkAlreadyImported, applyImport } = require("../../../services/legacyExcelImport");

const router = express.Router();

// This runs one-off bulk imports that create real login accounts (with
// hashed passwords), companies, and orders — deliberately gated tighter than
// the usual admin-tier routes (super_admin only, not organiser/finance).
router.use(requireAuth, requireEventContext, requireRole("super_admin"));

// Memory storage only — the uploaded workbook (which has plaintext exhibitor
// passwords in it) is parsed entirely in RAM for the life of the request and
// is never written to disk on this server.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isXlsx =
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || /\.xlsx$/i.test(file.originalname);
    cb(isXlsx ? null : new Error("Only .xlsx files are supported."), isXlsx);
  }
});

function readWorkbook(req) {
  if (!req.file) throw new ApiError(400, "No file uploaded — choose an .xlsx file.");
  try {
    return XLSX.read(req.file.buffer, { type: "buffer" });
  } catch (err) {
    throw new ApiError(400, `Could not read that file as an Excel workbook: ${err.message}`);
  }
}

// POST /admin/legacy-import/preview — parses the uploaded workbook and
// returns the same dry-run report the CLI script prints. Makes no writes.
router.post(
  "/preview",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const wb = readWorkbook(req);
    const plan = await planImport(pool, wb);
    const alreadyImported = await checkAlreadyImported(pool, plan);
    res.json({
      event: { id: plan.eventId, name: plan.event.name },
      report: plan.report,
      alreadyImported // non-empty => Apply will be refused; shown so the admin knows before trying
    });
  })
);

// POST /admin/legacy-import/apply — re-parses the (re-uploaded) workbook and
// actually writes, inside one transaction. Refuses to run twice against data
// it's already imported.
router.post(
  "/apply",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const wb = readWorkbook(req);
    const plan = await planImport(pool, wb);

    const already = await checkAlreadyImported(pool, plan);
    if (already.length > 0) {
      throw new ApiError(
        409,
        `This migration appears to have already run: ${already.join(", ")} already exist as users. Re-applying would create duplicate companies.`
      );
    }

    await applyImport(pool, plan);
    res.json({ message: "Legacy data imported.", event: { id: plan.eventId, name: plan.event.name }, report: plan.report });
  })
);

module.exports = router;
