// Builds a pdfmake docDefinition that visually matches the reference paper
// template (docs/SISCO Energy Private Limited - Proforma Invoice.pdf):
// letterhead header, black "PROFORMA INVOICE" bar, a two-column info block,
// a line-items table with grouped CGST/SGST/IGST columns, totals + amount in
// words, a payment schedule, bank/instructions text, and a signature block.
//
// This module only lays out data it's given — see admin/generatedDocuments.js
// for where the data (company/contact/booth info, line items, totals) is
// assembled and computed. Keeping business logic out of here means the
// snapshot stored in generated_documents.data can be re-rendered byte-for-
// byte later without recomputing anything.
const fs = require("fs");
const organiser = require("../../config/organiserBillingProfile");

function formatINR(n) {
  const num = Number(n) || 0;
  const [intPart, decPart] = num.toFixed(2).split(".");
  const isNegative = intPart.startsWith("-");
  const digits = isNegative ? intPart.slice(1) : intPart;
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree : lastThree;
  return (isNegative ? "-" : "") + grouped + "." + decPart;
}

function money(n) {
  const num = Number(n) || 0;
  return num === 0 ? "-" : formatINR(num);
}

function kvRows(pairs, options = {}) {
  return {
    table: {
      widths: [options.labelWidth || 78, "*"],
      body: pairs.map(([label, value]) => [
        { text: label, style: "kvLabel", border: [false, false, false, false] },
        { text: ": " + (value || ""), style: "kvValue", border: [false, false, false, false] }
      ])
    },
    layout: "noBorders"
  };
}

function boxed(content) {
  return {
    table: { widths: ["*"], body: [[content]] },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => "#000000",
      vLineColor: () => "#000000",
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 6,
      paddingBottom: () => 6
    }
  };
}

function header() {
  const hasLogo = fs.existsSync(organiser.logoPath);
  const identity = {
    stack: [
      { text: organiser.legalName, style: "orgName" },
      { text: organiser.isoCertText, style: "orgSmall" },
      { text: "CIN: " + organiser.cin, style: "orgSmall" }
    ]
  };
  return {
    columns: hasLogo
      ? [
          { image: organiser.logoPath, width: 70, margin: [0, 0, 10, 0] },
          identity
        ]
      : [identity],
    margin: [0, 0, 0, 8]
  };
}

function titleBar() {
  return {
    table: { widths: ["*"], body: [[{ text: "PROFORMA INVOICE", style: "titleBar" }]] },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => "#000000",
      vLineColor: () => "#000000",
      paddingTop: () => 4,
      paddingBottom: () => 4
    },
    margin: [0, 0, 0, 0]
  };
}

function infoBlock(data) {
  const left = kvRows([
    ["DATE", data.dateText],
    ["P.I. #", data.documentNumber || "(assigned on finalize)"],
    ["PAN", organiser.pan],
    ["GSTIN", organiser.gstin],
    ["STATE", organiser.homeState],
    ["CATEGORY", organiser.category],
    ["Place of Supply", data.placeOfSupply],
    ["MSME Reg. No.", data.exhibitor.msmeRegNo || "-"]
  ]);

  const companyBlock = {
    stack: [
      { text: data.exhibitor.companyName, style: "companyName" },
      ...data.exhibitor.addressLines.filter(Boolean).map((line) => ({ text: line, style: "companyAddress" }))
    ],
    margin: [0, 0, 0, 6]
  };

  const right = kvRows(
    [
      ["GSTIN", data.exhibitor.gstin || "-"],
      ["State", data.exhibitor.stateDisplay],
      ["Status", data.exhibitor.category],
      ["Show Name", data.exhibitor.showName],
      ["Dates", data.exhibitor.eventDatesText],
      ["Tel", data.exhibitor.contactTel || ""],
      ["Ctc", data.exhibitor.contactName || ""],
      ["Desig", data.exhibitor.contactDesignation || ""],
      ["Email", data.exhibitor.contactEmail || ""],
      ["Mobile No", data.exhibitor.contactMobile || ""]
    ],
    { labelWidth: 90 }
  );

  return boxed({
    columns: [
      { width: "40%", stack: [left] },
      { width: "60%", stack: [companyBlock, right] }
    ],
    columnGap: 10
  });
}

function lineItemsTable(data) {
  const headerRow1 = [
    { text: "PARTICULAR", style: "thCenter", rowSpan: 2 },
    { text: "BOOTH NO", style: "thCenter", rowSpan: 2 },
    { text: "AREA\n(SQM)", style: "thCenter", rowSpan: 2 },
    { text: "RAW /\nSHELL", style: "thCenter", rowSpan: 2 },
    { text: "Rate @\nINR Per Sqm", style: "thCenter", rowSpan: 2 },
    { text: "SAC/HSN", style: "thCenter", rowSpan: 2 },
    { text: "Taxable\nValue", style: "thCenter", rowSpan: 2 },
    { text: "CGST\nINR", style: "thCenter", colSpan: 2 },
    {},
    { text: "SGST\nINR", style: "thCenter", colSpan: 2 },
    {},
    { text: "IGST\nINR", style: "thCenter", colSpan: 2 },
    {}
  ];
  const headerRow2 = [
    {}, {}, {}, {}, {}, {}, {},
    { text: "Rate", style: "thCenter" },
    { text: "Amt", style: "thCenter" },
    { text: "Rate", style: "thCenter" },
    { text: "Amt", style: "thCenter" },
    { text: "Rate", style: "thCenter" },
    { text: "Amt", style: "thCenter" }
  ];

  const dataRows = data.lineItems.map((item) => [
    { text: item.particular, style: "td" },
    { text: item.boothNo || "", style: "tdCenter" },
    { text: item.areaSqm != null ? String(item.areaSqm) : "", style: "tdCenter" },
    { text: item.rawShell || "", style: "tdCenter" },
    { text: item.ratePerSqm != null ? formatINR(item.ratePerSqm) : "", style: "tdRight" },
    { text: item.hsnSac || "", style: "tdCenter" },
    { text: money(item.taxableValue), style: "tdRight" },
    { text: item.cgstRate ? item.cgstRate + "%" : "0%", style: "tdCenter" },
    { text: money(item.cgstAmt), style: "tdRight" },
    { text: item.sgstRate ? item.sgstRate + "%" : "0%", style: "tdCenter" },
    { text: money(item.sgstAmt), style: "tdRight" },
    { text: item.igstRate ? item.igstRate + "%" : "0%", style: "tdCenter" },
    { text: money(item.igstAmt), style: "tdRight" }
  ]);

  const totalRow = [
    { text: "Total", style: "tdBold", colSpan: 6 }, {}, {}, {}, {}, {},
    { text: money(data.totals.taxableValue), style: "tdRightBold" },
    { text: "", border: [true, true, true, true] },
    { text: money(data.totals.cgstAmt), style: "tdRightBold" },
    { text: "", border: [true, true, true, true] },
    { text: money(data.totals.sgstAmt), style: "tdRightBold" },
    { text: "", border: [true, true, true, true] },
    { text: money(data.totals.igstAmt), style: "tdRightBold" }
  ];

  return {
    table: {
      headerRows: 2,
      // pdfmake adds each column's own left/right padding ON TOP of the
      // width given here — with paddingLeft/Right of 1pt and 13 columns
      // that's 26pt of overhead, so these widths are sized to leave that
      // much room within the ~535pt usable A4 width (pageMargins 30+30).
      widths: [75, 34, 28, 28, 38, 34, 46, 20, 36, 20, 36, 20, 36],
      body: [headerRow1, headerRow2, ...dataRows, totalRow]
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => "#000000",
      vLineColor: () => "#000000",
      paddingLeft: () => 1,
      paddingRight: () => 1,
      paddingTop: () => 2,
      paddingBottom: () => 2
    },
    margin: [0, 8, 0, 0]
  };
}

function totalsBlock(data) {
  return {
    ...kvRows(
      [
        ["Total Invoice Value [In Figure]", formatINR(data.totals.grandTotal)],
        ["Total Invoice Value [In Words]", data.totalInWords],
        ["Amount of Tax subject to Reverse Charges", formatINR(data.reverseChargeTax || 0)]
      ],
      { labelWidth: 210 }
    ),
    margin: [0, 8, 0, 0]
  };
}

function paymentSchedule(data) {
  if (!data.paymentSchedule || data.paymentSchedule.length === 0) return { text: "" };
  return {
    table: {
      widths: ["*", 90],
      body: data.paymentSchedule.map((row) => [
        { text: row.description, style: "scheduleText", border: [false, true, false, false] },
        { text: formatINR(row.amount), style: "tdRight", border: [false, true, false, false] }
      ])
    },
    layout: { hLineColor: () => "#000000" },
    margin: [0, 8, 0, 0]
  };
}

function instructionsBlock() {
  const numbered = organiser.instructions.map((line, i) => `${i + 1}. ${line}`).join("\n");
  return {
    stack: [
      { text: "INSTRUCTIONS :", style: "sectionLabel", margin: [0, 8, 0, 2] },
      { text: numbered, style: "small" },
      { text: "OR", style: "small", margin: [16, 2, 0, 2] },
      { text: "NEFT/RTGS :", style: "small", margin: [16, 0, 0, 0] },
      {
        text: [
          `Account Name : ${organiser.bank.accountName}\n`,
          `Account Number : ${organiser.bank.accountNumber}\n`,
          `Bank Name : ${organiser.bank.bankName}\n`,
          `Branch : ${organiser.bank.branch}\n`,
          `IFSC : ${organiser.bank.ifsc}\n`,
          `Swift Code : ${organiser.bank.swiftCode}`
        ],
        style: "small",
        margin: [16, 0, 0, 4]
      },
      { text: organiser.bankChargesNote, style: "small" }
    ]
  };
}

function signatureBlock() {
  const hasStamp = fs.existsSync(organiser.stampPath);
  return {
    columns: [
      { width: "*", text: "" },
      {
        width: "auto",
        stack: [
          { text: "FOR EXHIBITIONS INDIA PVT LTD", style: "small", bold: true, alignment: "center" },
          hasStamp
            ? { image: organiser.stampPath, width: 90, alignment: "center", margin: [0, 4, 0, 4] }
            : { text: "\n\n", margin: [0, 4, 0, 4] },
          { text: "Authorised Signatory", style: "small", alignment: "center" }
        ]
      }
    ],
    margin: [0, 8, 0, 8]
  };
}

function exhibitorDeclaration(data) {
  return {
    stack: [
      { text: "TO BE FILLED BY THE EXHIBITOR:", style: "sectionLabel", margin: [0, 4, 0, 4] },
      {
        text: `We hereby agree to participate in ${data.exhibitor.showName} exhibition as per above details, and confirm to make payment as per payment schedule. We have read the Exhibition Rules and Regulations attached and agree that they are a part of this agreement and further agree to abide by them and any additional rules deemed necessary by the Organiser.`,
        style: "small",
        alignment: "justify"
      },
      {
        columns: [
          { text: "Signature : ______________________", style: "small", margin: [0, 16, 0, 0] },
          { text: "Date : ______________________", style: "small", margin: [0, 16, 0, 0] }
        ]
      }
    ]
  };
}

function footer() {
  return {
    stack: [
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5 }], margin: [0, 8, 0, 4] },
      { text: organiser.addressLines.join(", "), style: "footerText", alignment: "center" },
      { text: organiser.contactLine, style: "footerText", alignment: "center" },
      { text: organiser.regionalOfficesLine, style: "footerText", alignment: "center", bold: true }
    ]
  };
}

function build(data) {
  return {
    pageSize: "A4",
    pageMargins: [30, 30, 30, 30],
    defaultStyle: { font: "Roboto", fontSize: 8 },
    content: [
      header(),
      titleBar(),
      infoBlock(data),
      lineItemsTable(data),
      totalsBlock(data),
      paymentSchedule(data),
      instructionsBlock(),
      signatureBlock(),
      exhibitorDeclaration(data),
      footer()
    ],
    styles: {
      orgName: { fontSize: 14, bold: true, color: "#C00000" },
      orgSmall: { fontSize: 7, color: "#333333" },
      titleBar: { fontSize: 11, bold: true, color: "#ffffff", fillColor: "#000000", alignment: "center" },
      kvLabel: { fontSize: 8, bold: true },
      kvValue: { fontSize: 8 },
      companyName: { fontSize: 9, bold: true },
      companyAddress: { fontSize: 8 },
      thCenter: { fontSize: 7, bold: true, alignment: "center", fillColor: "#f0f0f0" },
      td: { fontSize: 7.5 },
      tdCenter: { fontSize: 7.5, alignment: "center" },
      tdRight: { fontSize: 7.5, alignment: "right" },
      tdBold: { fontSize: 8, bold: true },
      tdRightBold: { fontSize: 8, bold: true, alignment: "right" },
      sectionLabel: { fontSize: 8, bold: true },
      scheduleText: { fontSize: 8 },
      small: { fontSize: 7.5 },
      footerText: { fontSize: 7 }
    }
  };
}

module.exports = { build };
