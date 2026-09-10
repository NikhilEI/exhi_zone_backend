// CLI wrapper around src/services/legacyExcelImport.js — see that file for
// what this migration actually does and the decisions it encodes.
//
// Usage:
//   node scripts/migrate-legacy-excel.js "D:/exhi_zone/CI-SCI-2027-Exhibitor-Zone.xlsx"          (dry run — prints a report, writes nothing)
//   node scripts/migrate-legacy-excel.js "D:/exhi_zone/CI-SCI-2027-Exhibitor-Zone.xlsx" --apply   (actually writes, inside one transaction)
//
// The same import can also be run from the admin UI (Admin > Legacy Import),
// which uses this exact same service module via a file-upload endpoint —
// useful when production is a remote server you'd rather not scp into.

require("dotenv").config();
const XLSX = require("xlsx");
const pool = require("../src/db/pool");
const { planImport, reportToLines, checkAlreadyImported, applyImport } = require("../src/services/legacyExcelImport");

const FILE_PATH = process.argv[2];
const APPLY = process.argv.includes("--apply");

if (!FILE_PATH) {
  console.error("Usage: node scripts/migrate-legacy-excel.js <path-to-xlsx> [--apply]");
  process.exit(1);
}

async function main() {
  const wb = XLSX.readFile(FILE_PATH);
  const plan = await planImport(pool, wb);

  console.log("=".repeat(78));
  console.log(APPLY ? "APPLY MODE — writing to the database" : "DRY RUN — no data will be written");
  console.log("=".repeat(78));
  reportToLines(plan).forEach((line) => console.log(line));
  console.log();

  if (!APPLY) {
    console.log("Dry run complete. Re-run with --apply to write this to the database.");
    await pool.end();
    return;
  }

  const already = await checkAlreadyImported(pool, plan);
  if (already.length > 0) {
    console.error(
      `ABORTING — this migration appears to have already run: ${already.join(", ")} already exist as users. ` +
        "Re-running --apply would create duplicate companies. If you really need to re-import, clean up the previous import's rows first."
    );
    await pool.end();
    process.exit(1);
  }

  try {
    await applyImport(pool, plan);
    console.log("APPLIED — transaction committed.");
  } catch (err) {
    console.error("FAILED — transaction rolled back. Nothing was written.");
    console.error(err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
