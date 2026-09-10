// Shared CSV encoding for every admin data-export endpoint (see
// routes/exhibitorZone/admin/exports.js). Handles two things a naive
// `.join(",")` gets wrong:
//
// 1. Correct quoting — commas, quotes, and newlines inside a field.
// 2. CSV/formula-injection protection — Excel (and other spreadsheet apps)
//    evaluate a cell as a formula if it starts with =, +, -, or @. A field
//    built from user-entered data (a company name, a note, anything typed
//    into a form) could accidentally — or maliciously — start with one of
//    those and get executed when an admin opens the file. Every plain field
//    is escaped defensively; the one place we deliberately want a formula
//    (the booth-design attachment link) goes through csvFormulaField/
//    hyperlinkFormula instead, built only from a server-controlled base URL,
//    a numeric document id, and a fixed label — never raw user input.

// mysql2 returns DATETIME columns as native JS Date objects; left alone,
// String(date) produces the verbose "Wed Sep 09 2026 12:10:12 GMT+0530
// (India Standard Time)" form. Format plainly instead — Excel also
// recognizes this "YYYY-MM-DD HH:mm:ss" shape as a real datetime value.
function formatDateForCsv(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function csvEscapeField(value) {
  if (value === null || value === undefined) return "";
  let str = value instanceof Date ? formatDateForCsv(value) : String(value);
  if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
  if (/[",\n\r]/.test(str)) str = '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function csvFormulaField(formula) {
  if (!formula) return "";
  return '"' + String(formula).replace(/"/g, '""') + '"';
}

function hyperlinkFormula(url, label) {
  const safeLabel = String(label).replace(/"/g, '""');
  return `=HYPERLINK("${url}","${safeLabel}")`;
}

// columns: [{ key: string | (row) => value, label: string, formula?: boolean }]
// A leading UTF-8 BOM is included so Excel correctly detects the encoding
// (otherwise ₹ / non-ASCII names show as mojibake when double-clicked open).
function toCsv(rows, columns) {
  const header = columns.map((c) => csvEscapeField(c.label)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const value = typeof c.key === "function" ? c.key(row) : row[c.key];
        return c.formula ? csvFormulaField(value) : csvEscapeField(value);
      })
      .join(",")
  );
  return "﻿" + [header, ...lines].join("\r\n");
}

module.exports = { toCsv, csvEscapeField, csvFormulaField, hyperlinkFormula };
