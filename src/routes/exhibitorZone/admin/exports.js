const express = require("express");
const pool = require("../../../db/pool");
const asyncHandler = require("../../../middleware/asyncHandler");
const requireAuth = require("../../../middleware/requireAuth");
const requireRole = require("../../../middleware/requireRole");
const requireEventContext = require("../../../middleware/requireEventContext");
const { ApiError } = require("../../../middleware/errorHandler");
const { decryptNullable } = require("../../../utils/crypto");
const { toCsv, hyperlinkFormula } = require("../../../utils/csv");

const router = express.Router();
const ADMIN_ROLES = ["super_admin", "organiser", "finance"];

router.use(requireAuth, requireEventContext, requireRole(...ADMIN_ROLES));

function baseUrl(req) {
  return `${req.protocol}://${req.get("host")}/api/exhibitor-zone`;
}

// Every export is defined once, in one place: a key (the URL segment and
// frontend's stable identifier), display metadata for the picker UI, and a
// handler that returns the CSV columns + rows. Adding a new exportable data
// type later means adding one entry here — nothing else changes.
const EXPORTS = [
  {
    key: "exhibitors",
    label: "Exhibitor List",
    description: "Every exhibitor company: contact info, booth allocation, GST/PAN, and profile status.",
    filename: "exhibitors.csv",
    handler: async (req) => {
      const [rows] = await pool.query(
        `SELECT eep.id AS exhibitor_id, eep.profile_code, eep.profile_status, eep.participation_type,
                c.display_name, c.legal_name, c.email AS company_email, c.phone AS company_phone,
                c.address_line1, c.address_line2, c.city, c.state, c.postal_code, c.country,
                c.gst_number_enc, c.pan_number_enc, c.is_verified,
                edi.hall_no, edi.zone, edi.booth_no, edi.booth_type, edi.booth_size,
                edi.contact_name, edi.contact_designation, edi.contact_phone, edi.contact_email,
                s.stall_number
         FROM exhibitor_event_profiles eep
         JOIN companies c ON c.id = eep.company_id
         LEFT JOIN exhibitor_directory_info edi ON edi.exhibitor_profile_id = eep.id AND edi.event_id = eep.event_id
         LEFT JOIN stall_allocations sa ON sa.exhibitor_profile_id = eep.id AND sa.released_at IS NULL
         LEFT JOIN stalls s ON s.id = sa.stall_id
         WHERE eep.event_id = ? AND eep.deleted_at IS NULL
         ORDER BY c.display_name`,
        [req.user.eventId]
      );
      const columns = [
        { key: "exhibitor_id", label: "Exhibitor ID" },
        { key: "profile_code", label: "Profile Code" },
        { key: "display_name", label: "Company Name" },
        { key: "legal_name", label: "Legal Name" },
        { key: "profile_status", label: "Status" },
        { key: "participation_type", label: "Participation Type" },
        { key: (r) => (r.is_verified ? "Yes" : "No"), label: "Verified" },
        { key: "company_email", label: "Company Email" },
        { key: "company_phone", label: "Company Phone" },
        { key: (r) => decryptNullable(r.gst_number_enc) || "", label: "GST Number" },
        { key: (r) => decryptNullable(r.pan_number_enc) || "", label: "PAN Number" },
        { key: "address_line1", label: "Address" },
        { key: "city", label: "City" },
        { key: "state", label: "State" },
        { key: "postal_code", label: "Postal Code" },
        { key: "country", label: "Country" },
        { key: "hall_no", label: "Hall" },
        { key: "zone", label: "Zone" },
        { key: "booth_no", label: "Booth No" },
        { key: "booth_type", label: "Booth Type" },
        { key: "booth_size", label: "Booth Size (sqm)" },
        { key: "stall_number", label: "Allocated Stall" },
        { key: "contact_name", label: "Contact Name" },
        { key: "contact_designation", label: "Contact Designation" },
        { key: "contact_phone", label: "Contact Phone" },
        { key: "contact_email", label: "Contact Email" }
      ];
      return { columns, rows };
    }
  },
  {
    key: "badges",
    label: "Badges for Exhibitors",
    description: "Every badge registered for exhibitor staff, with badge ID.",
    filename: "badges.csv",
    handler: async (req) => {
      const [rows] = await pool.query(
        `SELECT eep.id AS exhibitor_id, c.display_name AS exhibitor_company, b.badge_id, b.full_name, b.designation, b.company_name,
                b.country, b.mobile_no, b.email, b.created_at
         FROM badge_records b
         JOIN exhibitor_event_profiles eep ON eep.id = b.exhibitor_profile_id
         JOIN companies c ON c.id = eep.company_id
         WHERE b.event_id = ?
         ORDER BY c.display_name, b.full_name`,
        [req.user.eventId]
      );
      const columns = [
        { key: "exhibitor_id", label: "Exhibitor ID" },
        { key: "exhibitor_company", label: "Exhibitor" },
        { key: "badge_id", label: "Badge ID" },
        { key: "full_name", label: "Full Name" },
        { key: "designation", label: "Designation" },
        { key: "company_name", label: "Company Name (as entered)" },
        { key: "country", label: "Country" },
        { key: "mobile_no", label: "Mobile No" },
        { key: "email", label: "Email" },
        { key: "created_at", label: "Registered On" }
      ];
      return { columns, rows };
    }
  },
  {
    key: "principal-agent",
    label: "Principal / Agent Information",
    description: "Principal and agent companies declared by each exhibitor.",
    filename: "principal-agent-information.csv",
    handler: async (req) => {
      const [rows] = await pool.query(
        `SELECT eep.id AS exhibitor_id, c.display_name AS exhibitor_company, p.type, p.company_name, p.website,
                p.country_name, COALESCE(ps.name, p.custom_sector) AS sector, p.created_at
         FROM principal_agent_records p
         JOIN exhibitor_event_profiles eep ON eep.id = p.exhibitor_profile_id
         JOIN companies c ON c.id = eep.company_id
         LEFT JOIN principal_agent_sectors ps ON ps.id = p.sector_id
         WHERE p.event_id = ?
         ORDER BY c.display_name, p.type`,
        [req.user.eventId]
      );
      const columns = [
        { key: "exhibitor_id", label: "Exhibitor ID" },
        { key: "exhibitor_company", label: "Exhibitor" },
        { key: "type", label: "Type" },
        { key: "company_name", label: "Company Name" },
        { key: "website", label: "Website" },
        { key: "country_name", label: "Country" },
        { key: "sector", label: "Sector" },
        { key: "created_at", label: "Added On" }
      ];
      return { columns, rows };
    }
  },
  {
    key: "booth-design",
    label: "Booth Design Submissions",
    description: "Raw Space exhibitors' booth design submissions, with a working link to the uploaded design file.",
    filename: "booth-design-submissions.csv",
    handler: async (req) => {
      const [rows] = await pool.query(
        `SELECT eep.id AS exhibitor_id, c.display_name AS exhibitor_company, fs.status, fs.version, fs.submitted_at,
                JSON_UNQUOTE(JSON_EXTRACT(fs.data, '$.standContractor')) AS stand_contractor,
                JSON_UNQUOTE(JSON_EXTRACT(fs.data, '$.attachDesign')) AS attach_design,
                JSON_UNQUOTE(JSON_EXTRACT(fs.data, '$.designDocumentId')) AS design_document_id
         FROM form_submissions fs
         JOIN form_templates ft ON ft.id = fs.form_template_id AND ft.slug = 'booth-design-submission'
         JOIN exhibitor_event_profiles eep ON eep.id = fs.exhibitor_profile_id
         JOIN companies c ON c.id = eep.company_id
         WHERE fs.event_id = ?
         ORDER BY c.display_name`,
        [req.user.eventId]
      );
      const url = baseUrl(req);
      const columns = [
        { key: "exhibitor_id", label: "Exhibitor ID" },
        { key: "exhibitor_company", label: "Exhibitor" },
        { key: "stand_contractor", label: "Stand Contractor" },
        { key: "attach_design", label: "Attaching Design?" },
        { key: "status", label: "Review Status" },
        { key: "version", label: "Version" },
        {
          key: (r) => (r.design_document_id ? hyperlinkFormula(`${url}/documents/${r.design_document_id}/file`, "Download Design File") : ""),
          label: "Design File",
          formula: true
        },
        { key: "submitted_at", label: "Submitted On" }
      ];
      return { columns, rows };
    }
  },
  {
    key: "fascia-name",
    label: "Fascia Name Submissions",
    description: "Shell Space exhibitors' declared fascia board names.",
    filename: "fascia-name-submissions.csv",
    handler: async (req) => {
      const [rows] = await pool.query(
        `SELECT eep.id AS exhibitor_id, c.display_name AS exhibitor_company, fs.status, fs.version, fs.submitted_at,
                JSON_UNQUOTE(JSON_EXTRACT(fs.data, '$.fasciaName')) AS fascia_name
         FROM form_submissions fs
         JOIN form_templates ft ON ft.id = fs.form_template_id AND ft.slug = 'fascia-name-submission'
         JOIN exhibitor_event_profiles eep ON eep.id = fs.exhibitor_profile_id
         JOIN companies c ON c.id = eep.company_id
         WHERE fs.event_id = ?
         ORDER BY c.display_name`,
        [req.user.eventId]
      );
      const columns = [
        { key: "exhibitor_id", label: "Exhibitor ID" },
        { key: "exhibitor_company", label: "Exhibitor" },
        { key: "fascia_name", label: "Fascia Name" },
        { key: "status", label: "Review Status" },
        { key: "version", label: "Version" },
        { key: "submitted_at", label: "Submitted On" }
      ];
      return { columns, rows };
    }
  },
  {
    key: "product-information",
    label: "Product Information",
    description: "Product categories each exhibitor selected for the show directory.",
    filename: "product-information.csv",
    handler: async (req) => {
      const [rows] = await pool.query(
        `SELECT eep.id AS exhibitor_id, c.display_name AS exhibitor_company, pc.name AS category, psub.name AS subcategory,
                epc.other_specification, epc.created_at
         FROM exhibitor_product_categories epc
         JOIN exhibitor_event_profiles eep ON eep.id = epc.exhibitor_profile_id
         JOIN companies c ON c.id = eep.company_id
         JOIN product_subcategories psub ON psub.id = epc.subcategory_id
         JOIN product_categories pc ON pc.id = psub.category_id
         WHERE epc.event_id = ?
         ORDER BY c.display_name, pc.sort_order, psub.sort_order`,
        [req.user.eventId]
      );
      const columns = [
        { key: "exhibitor_id", label: "Exhibitor ID" },
        { key: "exhibitor_company", label: "Exhibitor" },
        { key: "category", label: "Category" },
        { key: "subcategory", label: "Subcategory" },
        { key: "other_specification", label: "Other Specification" },
        { key: "created_at", label: "Added On" }
      ];
      return { columns, rows };
    }
  },
  {
    key: "orders",
    label: "Orders & Invoices",
    description: "Every service order placed, with totals and payment status.",
    filename: "orders.csv",
    handler: async (req) => {
      const [rows] = await pool.query(
        `SELECT eep.id AS exhibitor_id, o.order_number, c.display_name AS exhibitor_company, o.status, o.payment_status,
                o.subtotal, o.surcharge_total, o.tax_total, o.grand_total, o.created_at
         FROM orders o
         JOIN exhibitor_event_profiles eep ON eep.id = o.exhibitor_profile_id
         JOIN companies c ON c.id = eep.company_id
         WHERE o.event_id = ?
         ORDER BY o.created_at DESC`,
        [req.user.eventId]
      );
      const columns = [
        { key: "exhibitor_id", label: "Exhibitor ID" },
        { key: "order_number", label: "Order #" },
        { key: "exhibitor_company", label: "Exhibitor" },
        { key: "status", label: "Status" },
        { key: "payment_status", label: "Payment Status" },
        { key: "subtotal", label: "Subtotal" },
        { key: "surcharge_total", label: "Surcharge" },
        { key: "tax_total", label: "Tax" },
        { key: "grand_total", label: "Grand Total" },
        { key: "created_at", label: "Placed On" }
      ];
      return { columns, rows };
    }
  },
  {
    key: "payments",
    label: "Payment Transactions",
    description: "Every gateway payment attempt (Razorpay), success or failed, across all orders.",
    filename: "payment-transactions.csv",
    handler: async (req) => {
      const [rows] = await pool.query(
        `SELECT eep.id AS exhibitor_id, o.order_number, c.display_name AS exhibitor_company, pt.gateway, pt.amount, pt.currency,
                pt.status, pt.gateway_status, pt.payment_method, pt.processed_at, pt.created_at
         FROM payment_transactions pt
         JOIN orders o ON o.id = pt.order_id
         JOIN exhibitor_event_profiles eep ON eep.id = o.exhibitor_profile_id
         JOIN companies c ON c.id = eep.company_id
         WHERE pt.event_id = ?
         ORDER BY pt.created_at DESC`,
        [req.user.eventId]
      );
      const columns = [
        { key: "exhibitor_id", label: "Exhibitor ID" },
        { key: "order_number", label: "Order #" },
        { key: "exhibitor_company", label: "Exhibitor" },
        { key: "gateway", label: "Gateway" },
        { key: "amount", label: "Amount" },
        { key: "currency", label: "Currency" },
        { key: "status", label: "Status" },
        { key: "payment_method", label: "Method" },
        { key: "processed_at", label: "Processed At" },
        { key: "created_at", label: "Initiated At" }
      ];
      return { columns, rows };
    }
  },
  {
    key: "passes",
    label: "Issued Passes",
    description: "Every access pass issued, with holder details and status.",
    filename: "passes.csv",
    handler: async (req) => {
      const [rows] = await pool.query(
        `SELECT eep.id AS exhibitor_id, c.display_name AS exhibitor_company, pt.name AS pass_type, p.holder_first_name, p.holder_last_name,
                p.holder_email, p.holder_phone, p.holder_job_title, p.status, p.qr_code, p.issued_at
         FROM passes p
         JOIN exhibitor_event_profiles eep ON eep.id = p.exhibitor_profile_id
         JOIN companies c ON c.id = eep.company_id
         JOIN pass_types pt ON pt.id = p.pass_type_id
         WHERE p.event_id = ?
         ORDER BY c.display_name, p.holder_first_name`,
        [req.user.eventId]
      );
      const columns = [
        { key: "exhibitor_id", label: "Exhibitor ID" },
        { key: "exhibitor_company", label: "Exhibitor" },
        { key: "pass_type", label: "Pass Type" },
        { key: (r) => `${r.holder_first_name} ${r.holder_last_name}`.trim(), label: "Holder Name" },
        { key: "holder_email", label: "Holder Email" },
        { key: "holder_phone", label: "Holder Phone" },
        { key: "holder_job_title", label: "Job Title" },
        { key: "status", label: "Status" },
        { key: "qr_code", label: "QR Code" },
        { key: "issued_at", label: "Issued On" }
      ];
      return { columns, rows };
    }
  },
  {
    key: "stalls",
    label: "Stall Allocation Grid",
    description: "Every stall for this event and which exhibitor (if any) it's allocated to.",
    filename: "stall-allocations.csv",
    handler: async (req) => {
      const [rows] = await pool.query(
        `SELECT s.stall_number, s.hall, s.block, s.stall_type, s.area_sqm, s.status,
                eep.id AS exhibitor_id, c.display_name AS exhibitor_company, sa.allocated_at
         FROM stalls s
         LEFT JOIN stall_allocations sa ON sa.stall_id = s.id AND sa.released_at IS NULL
         LEFT JOIN exhibitor_event_profiles eep ON eep.id = sa.exhibitor_profile_id
         LEFT JOIN companies c ON c.id = eep.company_id
         WHERE s.event_id = ?
         ORDER BY s.hall, s.stall_number`,
        [req.user.eventId]
      );
      const columns = [
        { key: "stall_number", label: "Stall #" },
        { key: "hall", label: "Hall" },
        { key: "block", label: "Block" },
        { key: "stall_type", label: "Type" },
        { key: "area_sqm", label: "Area (sqm)" },
        { key: "status", label: "Status" },
        { key: "exhibitor_id", label: "Exhibitor ID" },
        { key: "exhibitor_company", label: "Allocated To" },
        { key: "allocated_at", label: "Allocated On" }
      ];
      return { columns, rows };
    }
  }
];

// GET /admin/exports — metadata only (key/label/description), so the frontend
// export picker is driven entirely by this registry: add an entry above and
// it shows up here automatically, no frontend change needed.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ exports: EXPORTS.map(({ key, label, description }) => ({ key, label, description })) });
  })
);

router.get(
  "/:key",
  asyncHandler(async (req, res) => {
    const def = EXPORTS.find((e) => e.key === req.params.key);
    if (!def) throw new ApiError(404, "Unknown export type.");

    const { columns, rows } = await def.handler(req);
    const csv = toCsv(rows, columns);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${def.filename}"`);
    res.send(csv);
  })
);

module.exports = router;
