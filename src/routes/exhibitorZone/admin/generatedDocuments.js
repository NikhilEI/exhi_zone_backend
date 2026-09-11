const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const pool = require("../../../db/pool");
const asyncHandler = require("../../../middleware/asyncHandler");
const requireAuth = require("../../../middleware/requireAuth");
const requireRole = require("../../../middleware/requireRole");
const requireEventContext = require("../../../middleware/requireEventContext");
const { requireModule } = require("../../../middleware/requireModule");
const { ApiError } = require("../../../middleware/errorHandler");
const { decryptNullable } = require("../../../utils/crypto");
const { sha256File, UPLOAD_ROOT } = require("../../../middleware/upload");
const { DOCUMENT_TYPES, getDocumentType } = require("../../../config/generatedDocumentTypes");
const organiser = require("../../../config/organiserBillingProfile");
const { renderToBuffer } = require("../../../utils/documentPdf/render");
const proformaInvoice = require("../../../utils/documentPdf/proformaInvoice");
const { z } = require("zod");

const router = express.Router();

const ADMIN_ROLES = ["super_admin", "organiser", "finance", "operations", "sales"];

const RENDERERS = { proformaInvoice };

const dataSchema = z.record(z.string(), z.any());

router.use(requireAuth, requireEventContext, requireRole(...ADMIN_ROLES), requireModule("document-generator"));

const COMPANY_TYPE_LABELS = {
  private_limited: "Company",
  public_limited: "Company",
  llp: "Company",
  partnership: "Firm",
  proprietorship: "Firm",
  ngo: "NGO",
  government: "Government"
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function formatLongDate(date) {
  const d = new Date(date);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatEventDateRange(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${s.getDate()}-${e.getDate()} ${MONTH_NAMES[s.getMonth()]} ${s.getFullYear()}`;
  }
  if (s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} ${MONTH_NAMES[s.getMonth()]} - ${e.getDate()} ${MONTH_NAMES[e.getMonth()]} ${s.getFullYear()}`;
  }
  return `${s.getDate()} ${MONTH_NAMES[s.getMonth()]} ${s.getFullYear()} - ${e.getDate()} ${MONTH_NAMES[e.getMonth()]} ${e.getFullYear()}`;
}

// Indian financial year (Apr-Mar) the event's start date falls in, e.g. an
// event starting March 2027 is FY "26-27" — matches the reference template's
// P.I. # format (CI/26-27/P/38).
function computeFinancialYear(startDate) {
  const d = new Date(startDate);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const fyStartYear = month >= 4 ? year : year - 1;
  return `${String(fyStartYear).slice(-2)}-${String(fyStartYear + 1).slice(-2)}`;
}

router.get(
  "/types",
  asyncHandler(async (req, res) => {
    res.json({ types: DOCUMENT_TYPES });
  })
);

const previewSchema = z.object({
  documentType: z.string(),
  data: dataSchema
});

// Stateless render-only endpoint for the live preview pane on the
// generation form — takes whatever the admin has typed so far and returns
// the actual PDF bytes, without creating/touching any generated_documents
// row or assigning a document number. Safe to call on every form edit.
router.post(
  "/preview",
  asyncHandler(async (req, res) => {
    const parsed = previewSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Please check the highlighted fields.");

    const typeEntry = getDocumentType(parsed.data.documentType);
    if (!typeEntry || !RENDERERS[typeEntry.renderer]) throw new ApiError(400, "Unknown document type.");

    const data = { ...parsed.data.data, documentNumber: parsed.data.data.documentNumber || "(assigned on finalize)" };
    const pdfBuffer = await renderToBuffer(RENDERERS[typeEntry.renderer].build(data));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=preview.pdf");
    res.send(pdfBuffer);
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));

    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) AS total FROM generated_documents WHERE event_id = ?",
      [req.user.eventId]
    );
    const [rows] = await pool.query(
      `SELECT gd.id, gd.document_type, gd.document_number, gd.status, gd.version, gd.created_at,
              gd.finalized_at, gd.exhibitor_profile_id, gd.pdf_document_upload_id, c.display_name AS company_name,
              CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
       FROM generated_documents gd
       JOIN exhibitor_event_profiles eep ON eep.id = gd.exhibitor_profile_id
       JOIN companies c ON c.id = eep.company_id
       LEFT JOIN users u ON u.id = gd.created_by
       WHERE gd.event_id = ?
       ORDER BY gd.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.eventId, pageSize, (page - 1) * pageSize]
    );
    res.json({ documents: rows, page, pageSize, total });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      "SELECT * FROM generated_documents WHERE id = ? AND event_id = ? LIMIT 1",
      [req.params.id, req.user.eventId]
    );
    if (rows.length === 0) throw new ApiError(404, "Document not found.");
    const doc = rows[0];
    res.json({ document: { ...doc, data: JSON.parse(doc.data) } });
  })
);

// Assembles everything the system already knows for a given exhibitor, as a
// starting point for the generation form — nothing is persisted here. Booth
// number/area/type prefers an active stall_allocations → stalls row (the
// organiser-controlled source) and falls back to the exhibitor's own
// self-reported exhibitor_directory_info when no allocation exists.
router.get(
  "/prefill/:exhibitorProfileId",
  asyncHandler(async (req, res) => {
    const documentType = getDocumentType(req.query.documentType);
    if (!documentType) throw new ApiError(400, "Unknown document type.");

    const profileId = req.params.exhibitorProfileId;

    const [profileRows] = await pool.query(
      `SELECT eep.id, eep.company_id, eep.category,
              c.display_name, c.legal_name, c.address_line1, c.address_line2, c.city, c.state, c.postal_code,
              c.country, c.company_type, c.gst_number_enc, c.msme_registration_number, c.gst_state_code
       FROM exhibitor_event_profiles eep
       JOIN companies c ON c.id = eep.company_id
       WHERE eep.id = ? AND eep.event_id = ? LIMIT 1`,
      [profileId, req.user.eventId]
    );
    if (profileRows.length === 0) throw new ApiError(404, "Exhibitor profile not found for the active event.");
    const profile = profileRows[0];

    const [infoRows] = await pool.query(
      "SELECT * FROM exhibitor_directory_info WHERE exhibitor_profile_id = ? AND event_id = ? LIMIT 1",
      [profileId, req.user.eventId]
    );
    const info = infoRows[0] || null;

    const [stallRows] = await pool.query(
      `SELECT s.stall_number, s.area_sqm, s.stall_type, s.price_inr
       FROM stall_allocations sa
       JOIN stalls s ON s.id = sa.stall_id
       WHERE sa.exhibitor_profile_id = ? AND sa.event_id = ? AND sa.released_at IS NULL
       ORDER BY sa.allocated_at DESC LIMIT 1`,
      [profileId, req.user.eventId]
    );
    const stall = stallRows[0] || null;

    const [eventRows] = await pool.query(
      "SELECT name, edition, short_code, start_date, end_date FROM events WHERE id = ? LIMIT 1",
      [req.user.eventId]
    );
    const event = eventRows[0];

    // Prefer the organiser-controlled stall_allocations/stalls source, but
    // fall back to self-reported exhibitor_directory_info on a per-field
    // basis — a stall row can exist (e.g. just to reserve a booth number)
    // without every column on it being filled in.
    const boothNo = (stall && stall.stall_number) || (info && info.booth_no) || null;
    const areaSqm = stall && stall.area_sqm != null ? Number(stall.area_sqm) : info && info.booth_size != null ? Number(info.booth_size) : null;
    const rawShellFromStall = stall && stall.stall_type
      ? /raw/i.test(stall.stall_type) ? "Raw" : /shell/i.test(stall.stall_type) ? "Shell" : ""
      : "";
    const rawShell = rawShellFromStall || (info && info.booth_type ? info.booth_type.replace(" Space", "") : "");
    const suggestedRatePerSqm = stall && stall.price_inr && areaSqm ? Math.round(Number(stall.price_inr) / areaSqm) : null;

    res.json({
      exhibitor: {
        companyName: profile.display_name || profile.legal_name,
        addressLines: [profile.address_line1, profile.address_line2, [profile.city, profile.state, profile.postal_code].filter(Boolean).join(", ")].filter(Boolean),
        gstin: decryptNullable(profile.gst_number_enc),
        state: profile.state,
        gstStateCode: profile.gst_state_code,
        stateDisplay: profile.gst_state_code ? `${profile.state}-${profile.gst_state_code}` : profile.state,
        msmeRegNo: profile.msme_registration_number,
        category: COMPANY_TYPE_LABELS[profile.company_type] || "Company or Firm",
        contactName: info ? info.contact_name : null,
        contactDesignation: info ? info.contact_designation : null,
        contactEmail: info ? info.contact_email || info.email : null,
        contactMobile: info ? info.contact_phone : null,
        contactTel: info ? info.phone_no : null,
        boothNo,
        areaSqm,
        rawShell,
        suggestedRatePerSqm
      },
      event: {
        showName: event.name,
        eventDatesText: formatEventDateRange(event.start_date, event.end_date),
        shortCode: event.short_code,
        financialYear: computeFinancialYear(event.start_date)
      },
      organiser: {
        homeStateCode: organiser.homeStateCode,
        standardGstRatePct: organiser.standardGstRatePct,
        defaultHsnSac: organiser.defaultHsnSac,
        category: organiser.category
      }
    });
  })
);

const createSchema = z.object({
  exhibitorProfileId: z.coerce.number().int().positive(),
  documentType: z.string(),
  data: dataSchema
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "Please check the highlighted fields.", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    }
    const b = parsed.data;
    if (!getDocumentType(b.documentType)) throw new ApiError(400, "Unknown document type.");

    const [profileRows] = await pool.query(
      "SELECT id FROM exhibitor_event_profiles WHERE id = ? AND event_id = ? LIMIT 1",
      [b.exhibitorProfileId, req.user.eventId]
    );
    if (profileRows.length === 0) throw new ApiError(404, "Exhibitor profile not found for the active event.");

    const [result] = await pool.query(
      `INSERT INTO generated_documents (uuid, event_id, exhibitor_profile_id, document_type, status, data, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, NOW(), NOW())`,
      [crypto.randomUUID(), req.user.eventId, b.exhibitorProfileId, b.documentType, JSON.stringify(b.data), req.user.id]
    );
    res.status(201).json({ message: "Draft created.", id: result.insertId });
  })
);

const updateSchema = z.object({ data: dataSchema });

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Please check the highlighted fields.");

    const [rows] = await pool.query("SELECT id, status FROM generated_documents WHERE id = ? AND event_id = ? LIMIT 1", [
      req.params.id,
      req.user.eventId
    ]);
    if (rows.length === 0) throw new ApiError(404, "Document not found.");
    if (rows[0].status === "void") throw new ApiError(400, "This document has been voided.");

    await pool.query("UPDATE generated_documents SET data = ?, updated_at = NOW() WHERE id = ?", [
      JSON.stringify(parsed.data.data),
      req.params.id
    ]);
    res.json({ message: "Draft saved." });
  })
);

router.post(
  "/:id/finalize",
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Please check the highlighted fields.");

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        "SELECT * FROM generated_documents WHERE id = ? AND event_id = ? LIMIT 1 FOR UPDATE",
        [req.params.id, req.user.eventId]
      );
      if (rows.length === 0) throw new ApiError(404, "Document not found.");
      const doc = rows[0];
      if (doc.status === "void") throw new ApiError(400, "This document has been voided.");

      const typeEntry = getDocumentType(doc.document_type);
      if (!typeEntry || !RENDERERS[typeEntry.renderer]) {
        throw new ApiError(500, "Server misconfiguration: no renderer for this document type.");
      }

      const data = parsed.data.data;

      let documentNumber = doc.document_number;
      let sequenceNo = doc.sequence_no;
      if (!documentNumber) {
        const [eventRows] = await connection.query("SELECT short_code, start_date FROM events WHERE id = ? LIMIT 1", [
          doc.event_id
        ]);
        const shortCode = eventRows[0].short_code || "EVT";
        const fy = computeFinancialYear(eventRows[0].start_date);

        // Re-derived inside the transaction, scoped to (event, doc type), and
        // locked via the same row-locking idiom used elsewhere in this codebase
        // (see badge_id in mandatoryForms.js) to avoid two concurrent finalizes
        // colliding on the same sequence number.
        const [[{ maxSeq }]] = await connection.query(
          "SELECT COALESCE(MAX(sequence_no), 0) AS maxSeq FROM generated_documents WHERE event_id = ? AND document_type = ? FOR UPDATE",
          [doc.event_id, doc.document_type]
        );
        sequenceNo = maxSeq + 1;
        documentNumber = `${shortCode}/${fy}/${typeEntry.numberCode}/${sequenceNo}`;
      }
      data.documentNumber = documentNumber;

      const pdfBuffer = await renderToBuffer(RENDERERS[typeEntry.renderer].build(data));

      const storedFilename = `${crypto.randomUUID()}.pdf`;
      const storagePath = path.join(UPLOAD_ROOT, storedFilename);
      await fs.promises.writeFile(storagePath, pdfBuffer);
      const checksum = await sha256File(storagePath);

      // Single-instance-per-exhibitor-per-type, same convention documents.js
      // already enforces for uploaded proforma_invoice/invoice documents.
      await connection.query(
        "UPDATE document_uploads SET deleted_at = NOW() WHERE exhibitor_profile_id = ? AND document_type = ? AND deleted_at IS NULL",
        [doc.exhibitor_profile_id, doc.document_type]
      );

      const [docResult] = await connection.query(
        `INSERT INTO document_uploads
          (uuid, event_id, exhibitor_profile_id, uploaded_by, document_type, original_filename, stored_filename,
           storage_path, storage_backend, mime_type, file_size_bytes, checksum_sha256, is_verified, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local', 'application/pdf', ?, ?, 1, NOW())`,
        [
          crypto.randomUUID(),
          doc.event_id,
          doc.exhibitor_profile_id,
          req.user.id,
          doc.document_type,
          `${documentNumber.replace(/\//g, "-")}.pdf`,
          storedFilename,
          storagePath,
          pdfBuffer.length,
          checksum
        ]
      );

      const version = doc.pdf_document_upload_id ? doc.version + 1 : doc.version;

      await connection.query(
        `UPDATE generated_documents
         SET status = 'finalized', document_number = ?, sequence_no = ?, data = ?, pdf_document_upload_id = ?,
             version = ?, finalized_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [documentNumber, sequenceNo, JSON.stringify(data), docResult.insertId, version, doc.id]
      );

      await connection.commit();
      res.json({ message: "Document generated.", documentNumber, pdfDocumentUploadId: docResult.insertId });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  })
);

router.post(
  "/:id/void",
  asyncHandler(async (req, res) => {
    const [result] = await pool.query(
      "UPDATE generated_documents SET status = 'void', updated_at = NOW() WHERE id = ? AND event_id = ?",
      [req.params.id, req.user.eventId]
    );
    if (result.affectedRows === 0) throw new ApiError(404, "Document not found.");
    res.json({ message: "Document voided." });
  })
);

module.exports = router;
