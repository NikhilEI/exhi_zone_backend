// Registry of document types the admin Document Generator can produce.
// Each entry names its own PDF-renderer module (in utils/documentPdf/) and
// the single-letter/short code used inside a generated document_number
// (e.g. "P" in CI/26-27/P/38). Extend this list — plus a renderer module
// following the same shape — to add a new document type (Tax Invoice,
// Letter of Participation, etc.) without touching the route or DB layer.
const DOCUMENT_TYPES = [
  {
    key: "proforma_invoice",
    label: "Proforma Invoice",
    numberCode: "P",
    renderer: "proformaInvoice"
  }
];

function getDocumentType(key) {
  return DOCUMENT_TYPES.find((t) => t.key === key) || null;
}

module.exports = { DOCUMENT_TYPES, getDocumentType };
