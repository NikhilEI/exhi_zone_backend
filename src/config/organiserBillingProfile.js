// Exhibitions India Pvt Ltd's own printed identity — the fixed letterhead
// details that appear on every generated document (Proforma Invoice today,
// other document types later) regardless of which exhibitor/event it's for.
// This is a constants file, not DB-backed: it changes essentially never, and
// unlike per-exhibitor data there's no admin UI for it — edit it here if the
// organiser's own registered details or bank account ever change.
//
// logoPath/stampPath point at image assets that must be supplied — until
// they exist, the PDF renderer falls back to a text-only header/footer (see
// utils/documentPdf/proformaInvoice.js), so this file works with or without
// them. Drop real files at these paths (any location under backend/assets/)
// to have them appear in generated PDFs.
const path = require("path");

const ASSETS_DIR = path.join(__dirname, "..", "..", "assets", "billing");

module.exports = {
  legalName: "Exhibitions India Pvt. Ltd.",
  isoCertText: "ISO 9001:2015 - ISO 14001:2015 - OHSAS 18001:2007",
  cin: "U92199DL1998PTC093065",
  gstin: "07AAACE8532C1ZZ",
  pan: "AAACE8532C",
  // GST state code for Delhi — compared against an exhibitor's
  // companies.gst_state_code to decide CGST+SGST (same state) vs IGST
  // (different state) on each invoice line item.
  homeStateCode: "07",
  homeState: "Delhi",
  standardGstRatePct: 18,
  addressLines: ["C-103, Okhla Industrial Estate, Phase III,", "New Delhi 110 020"],
  contactLine: "Tel: +91 11 4279 5000  |  Fax: +91 11 4279 5098  |  info@eigroup.in  |  www.exhibitionsindia.com",
  regionalOfficesLine: "Regional Offices: Bengaluru • Chennai • Mumbai",
  bank: {
    accountName: "Exhibitions India Private Limited",
    accountNumber: "20742000000124",
    bankName: "HDFC Bank Ltd.",
    branch: "Okhla Industrial Estate Phase III, New Delhi 110020",
    ifsc: "HDFC0002074",
    swiftCode: "HDFCINBBXXX"
  },
  instructions: [
    "Please sign and return one copy of the Invoice alongwith your payment.",
    "Mode of payment: By Bank Draft in favour of EXHIBITIONS INDIA PVT. LTD. payable at New Delhi"
  ],
  bankChargesNote: "Note : Bank Charges on remitter's account",
  logoPath: path.join(ASSETS_DIR, "logo.png"),
  stampPath: path.join(ASSETS_DIR, "signature-stamp.png"),
  category: "Business Exhibition Services",
  defaultHsnSac: "998596"
};
