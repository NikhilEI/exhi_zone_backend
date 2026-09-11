// Shared pdfmake setup for every generated-document renderer (proformaInvoice.js
// today, future document types later). Kept separate from any one renderer so
// adding a new document type never means re-wiring fonts/output handling.
const path = require("path");
const pdfMake = require("pdfmake");

const FONTS_DIR = path.join(__dirname, "..", "..", "..", "node_modules", "pdfmake", "fonts", "Roboto");
const ASSETS_DIR = path.join(__dirname, "..", "..", "..", "assets", "billing");

pdfMake.setFonts({
  Roboto: {
    normal: path.join(FONTS_DIR, "Roboto-Regular.ttf"),
    bold: path.join(FONTS_DIR, "Roboto-Medium.ttf"),
    italics: path.join(FONTS_DIR, "Roboto-Italic.ttf"),
    bolditalics: path.join(FONTS_DIR, "Roboto-MediumItalic.ttf")
  }
});

// We never fetch remote resources, and the only local files a docDefinition
// can reference are our own bundled fonts/logo/stamp — deny everything else.
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy((filePath) => filePath.startsWith(FONTS_DIR) || filePath.startsWith(ASSETS_DIR));

// docDefinition -> Buffer, for writing straight to disk (see the finalize
// route in admin/generatedDocuments.js).
async function renderToBuffer(docDefinition) {
  const pdf = pdfMake.createPdf(docDefinition);
  return pdf.getBuffer();
}

module.exports = { renderToBuffer };
