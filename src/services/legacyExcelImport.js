// Shared logic for the one-time legacy data migration
// (CI-SCI-2027-Exhibitor-Zone.xlsx -> this DB). Used by both:
//   - scripts/migrate-legacy-excel.js (CLI, reads a file path)
//   - routes/exhibitorZone/admin/legacyImport.js (admin file-upload UI)
// so there is exactly one implementation of the import logic to keep correct.
//
// Decisions this encodes (agreed with the project owner before writing it):
//   - Only real accounts in "Compamy Profile" are migrated (fully-blank rows
//     are padding — nothing to migrate).
//   - A row with no company name at all is skipped (nothing to name a
//     company with).
//   - Every other sheet (Principal Agent, Product Index[_Other], Badges,
//     Fascia-Name, cart Catlogue) is matched to a migrated company by
//     normalized name. Anything that doesn't match a migrated company is
//     SKIPPED and reported — there are companies referenced elsewhere in the
//     workbook with no contact/profile data anywhere, and this does not
//     invent placeholder companies for them.
//   - Legacy passwords are plaintext in the sheet; they're hashed with the
//     app's normal Argon2id settings, never stored or logged in plaintext.
//   - Login requires a unique email (this app's login identity, unlike the
//     legacy username-based login) — only rows with an email get a `users`
//     row; the rest get company/profile/booth/product/order data with no
//     login until an admin adds a real email later.
//   - order.status "0" in the legacy sheet = unpaid/placed.

const crypto = require("crypto");
const XLSX = require("xlsx");
const { hashPassword } = require("../utils/argon");

// ---------------------------------------------------------------- helpers --

function normText(s) {
  return String(s || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function key(s) {
  return normText(s).toLowerCase();
}
function isLogoFilename(s) {
  return /^company-logo-/i.test(String(s || "").trim());
}
function truncate(s, n) {
  const t = normText(s);
  return t.length > n ? t.slice(0, n) : t;
}
function sheetRows(wb, name) {
  if (!wb.Sheets[name]) return null;
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" }).slice(1);
}

const COUNTRY_DIAL_CODES = {
  india: "+91",
  "united states": "+1",
  "united kingdom": "+44",
  canada: "+1",
  germany: "+49",
  china: "+86",
  albania: "+355"
};

// A handful of sheets reference a company by an abbreviation/alias instead of
// its full registered name (e.g. the Badges sheet). Confirmed by hand, not
// guessed — normalized-name matching alone deliberately does NOT fuzzy-match,
// to avoid silently merging two different companies that just sound similar.
const COMPANY_ALIASES = {
  "dcnet india": "dcnet solutions india private limited",
  eig: "exhibitions india pvt. ltd."
};
function resolveCompanyKey(name) {
  const k = key(name);
  return COMPANY_ALIASES[k] || k;
}

// ------------------------------------------------------------- planImport --

// Reads the workbook + current reference data and produces a full plan +
// human-readable report. Read-only — makes no writes.
async function planImport(pool, wb) {
  const report = {
    companies: { create: [], skipNoName: 0 },
    users: { create: 0, placeholderEmail: 0 },
    stalls: { allocate: [], collisions: [] },
    directoryInfo: { create: 0, truncatedProfile: [] },
    principalAgent: { create: 0, unmatched: [] },
    productIndex: { create: 0, unmatchedSubcategory: [] },
    productIndexOther: { create: 0, unmatchedCompany: 0 },
    badges: { create: 0, unmatched: [] },
    fascia: { create: 0, unmatched: [], skippedNoUser: 0 },
    orders: { create: 0, itemsCreate: 0, unmatchedCompany: [], skippedNoUser: 0 },
    warnings: []
  };

  const [[event]] = [(await pool.query("SELECT id, name FROM events WHERE name = 'Convergence India 2027' LIMIT 1"))[0]];
  if (!event) throw new Error("Could not find the 'Convergence India 2027' event — aborting.");
  const eventId = event.id;

  const [[exhibitorAdminRole]] = [(await pool.query("SELECT id FROM roles WHERE name = 'exhibitor_admin' LIMIT 1"))[0]];
  if (!exhibitorAdminRole) throw new Error("exhibitor_admin role not found — aborting.");

  const [subRows] = await pool.query("SELECT id, category_id, name FROM product_subcategories");
  const subByName = new Map(subRows.map((s) => [key(s.name), s]));
  const othersSubcategory = subRows.find((s) => normText(s.name).toLowerCase() === "others");

  const [itemRows] = await pool.query("SELECT id, sku, name, price_inr, tax_rate_pct FROM service_items");
  const itemBySku = new Map(itemRows.map((i) => [i.sku, i]));

  const [[fasciaTemplate]] = [
    (await pool.query("SELECT id, requires_approval FROM form_templates WHERE slug = 'fascia-name-submission' AND event_id = ? LIMIT 1", [eventId]))[0]
  ];

  // --- Compamy Profile ---------------------------------------------------
  const cpRows = sheetRows(wb, "Compamy Profile") || [];
  const realRows = cpRows.filter((r) => normText(r[0])); // non-blank username = a real account

  const companies = []; // one entry per usable row, in original order
  const companyKeyToIndexes = new Map(); // normalized company name -> [index into companies[]]

  realRows.forEach((r) => {
    const companyName = normText(r[2]);
    if (!companyName) {
      report.companies.skipNoName += 1;
      return;
    }

    // Column layout (0-indexed): 0 username, 1 password, 2 company, 3 hall,
    // 4 booth, 5 firstName, 6 lastName, 7 designation, 8 email,
    // 9 member_country_code, 10 member_area_code (actually holds booth_type),
    // 11 Phone No, 12 Mobile No, 13 Fax No, 14 Address, 15 City, 16 State,
    // 17 Post Code, 18 Country, 19 Website, 20 Company Profile,
    // 21/22 Product Index / Other Product (unused — dedicated sheets are authoritative).
    const mobileRaw = normText(r[12]);
    const phone = normText(r[11]) || (isLogoFilename(mobileRaw) ? "" : mobileRaw);
    const country = normText(r[18]) || "India";
    const boothType = ["Shell Space", "Raw Space"].includes(normText(r[10])) ? normText(r[10]) : null;
    const countryCode = COUNTRY_DIAL_CODES[key(country)] || "";

    const companyProfileRaw = normText(r[20]);
    const email = normText(r[8]);

    const rec = {
      username: normText(r[0]),
      password: r[1], // plaintext — hashed at insert time, never logged
      companyName,
      hallNo: normText(r[3]),
      boothNo: normText(r[4]),
      firstName: normText(r[5]) || companyName,
      lastName: normText(r[6]),
      designation: normText(r[7]),
      email,
      countryCode,
      boothType,
      phone,
      address: normText(r[14]),
      city: normText(r[15]),
      state: normText(r[16]),
      postCode: normText(r[17]),
      country,
      website: normText(r[19]),
      companyProfileRaw,
      companyProfile: truncate(companyProfileRaw, 400)
    };
    rec.fullyComplete = Boolean(rec.email && rec.boothType && rec.companyProfile);
    // Every real row has a username -> every one gets a login `users` row.
    // Login is by email OR username (see auth.js), so a real email isn't
    // required for that — accounts without one get a placeholder address
    // (RFC 2606 .invalid TLD, never a real deliverable domain) purely to
    // satisfy the `users.email` NOT NULL/UNIQUE constraint; they log in with
    // their username instead.
    rec.hasRealEmail = Boolean(rec.email);
    rec.loginEmail = rec.email || `${rec.username}@legacy-import.invalid`;
    if (companyProfileRaw.length > 400) report.directoryInfo.truncatedProfile.push(rec.companyName);
    if (mobileRaw && isLogoFilename(mobileRaw)) {
      report.warnings.push(`"${rec.companyName}": Mobile No column held a logo filename ("${mobileRaw}"), dropped.`);
    }

    const idx = companies.length;
    companies.push(rec);
    const k = key(companyName);
    if (!companyKeyToIndexes.has(k)) companyKeyToIndexes.set(k, []);
    companyKeyToIndexes.get(k).push(idx);
    report.users.create += 1;
    if (!rec.hasRealEmail) report.users.placeholderEmail += 1;
    report.companies.create.push(rec.companyName);
  });

  // Detect same booth claimed by two different companies (only the first wins).
  const boothClaims = new Map(); // "hall|booth" -> company index
  companies.forEach((c, idx) => {
    if (!c.hallNo || !c.boothNo) return;
    const bk = `${key(c.hallNo)}|${key(c.boothNo)}`;
    if (boothClaims.has(bk)) {
      report.stalls.collisions.push(`${c.hallNo} ${c.boothNo}: "${companies[boothClaims.get(bk)].companyName}" vs "${c.companyName}" — second one skipped.`);
    } else {
      boothClaims.set(bk, idx);
      report.stalls.allocate.push(`${c.hallNo} ${c.boothNo} -> ${c.companyName}`);
    }
  });

  // --- Principal Agent -----------------------------------------------------
  const paRows = sheetRows(wb, "Principal Agent") || [];
  const principalAgentPlan = [];
  paRows.forEach((r) => {
    const companyName = normText(r[0]);
    const idxs = companyKeyToIndexes.get(resolveCompanyKey(companyName)) || [];
    if (idxs.length === 0) {
      report.principalAgent.unmatched.push(companyName);
      return;
    }
    idxs.forEach((companyIdx) => {
      principalAgentPlan.push({
        companyIdx,
        type: "Principal", // the sheet's "Agent Name" column is always literally "Principal" — it's a type label, not a person's name
        agentCompanyName: normText(r[2]),
        website: normText(r[4]),
        countryName: normText(r[3]),
        countryCode: COUNTRY_DIAL_CODES[key(r[3])] || ""
      });
    });
    report.principalAgent.create += idxs.length;
  });

  // --- Product Index / Product Index_Other ----------------------------------
  const piRows = sheetRows(wb, "Product Index") || [];
  const productPlan = [];
  piRows.forEach((r) => {
    const name = normText(r[0]);
    const companyName = normText(r[1]);
    if (!name) return;
    const idxs = companyKeyToIndexes.get(resolveCompanyKey(companyName)) || [];
    if (idxs.length === 0) return; // company not migrated — skip per decision
    const sub = subByName.get(key(name));
    if (!sub) {
      report.productIndex.unmatchedSubcategory.push(name);
      return;
    }
    idxs.forEach((companyIdx) => productPlan.push({ companyIdx, subcategoryId: sub.id, other: null }));
    report.productIndex.create += idxs.length;
  });

  const pioRows = sheetRows(wb, "Product Index_Other") || [];
  pioRows.forEach((r) => {
    const other = normText(r[0]);
    const companyName = normText(r[1]);
    if (!other) return;
    const idxs = companyKeyToIndexes.get(resolveCompanyKey(companyName)) || [];
    if (idxs.length === 0) {
      report.productIndexOther.unmatchedCompany += 1;
      return;
    }
    if (!othersSubcategory) return;
    idxs.forEach((companyIdx) => productPlan.push({ companyIdx, subcategoryId: othersSubcategory.id, other }));
    report.productIndexOther.create += idxs.length;
  });

  // --- Badges ----------------------------------------------------------------
  const badgeSheetNames = ["Badges for Exhibitors -QR Code", "Badges for Invitee -QR Code"];
  const badgePlan = [];
  badgeSheetNames.forEach((sn) => {
    (sheetRows(wb, sn) || []).forEach((r) => {
      const companyName = normText(r[4]);
      if (!normText(r[2])) return; // no exhibitor_name -> nothing to migrate
      const idxs = companyKeyToIndexes.get(resolveCompanyKey(companyName)) || [];
      if (idxs.length === 0) {
        report.badges.unmatched.push(`${r[2]} (${companyName})`);
        return;
      }
      idxs.forEach((companyIdx) =>
        badgePlan.push({
          companyIdx,
          fullName: normText(r[2]),
          designation: normText(r[3]),
          companyNameEntered: companyName,
          country: normText(r[7]) || "India",
          countryCode: COUNTRY_DIAL_CODES[key(r[7])] || "",
          mobile: normText(r[6]),
          email: normText(r[5])
        })
      );
      report.badges.create += idxs.length;
    });
  });

  // --- Fascia-Name -------------------------------------------------------
  const fasciaRows = sheetRows(wb, "Fascia-Name") || [];
  const fasciaPlan = [];
  fasciaRows.forEach((r) => {
    const companyName = normText(r[0]);
    const fasciaName = normText(r[1]);
    if (!fasciaName) return;
    const idxs = companyKeyToIndexes.get(resolveCompanyKey(companyName)) || [];
    if (idxs.length === 0) {
      report.fascia.unmatched.push(companyName);
      return;
    }
    idxs.forEach((companyIdx) => {
      // Every migrated company now gets a login user (email or username), so
      // this never actually skips — kept as a defensive check in case that
      // assumption ever stops holding.
      if (!companies[companyIdx].username) {
        report.fascia.skippedNoUser += 1;
        return;
      }
      fasciaPlan.push({ companyIdx, fasciaName });
      report.fascia.create += 1;
    });
  });

  // --- cart Catlogue (orders) -------------------------------------------
  const cartRows = sheetRows(wb, "cart Catlogue") || sheetRows(wb, "Furniture Catlogue") || [];
  const ordersByOrderId = new Map();
  cartRows.forEach((r) => {
    const orderId = normText(r[0]);
    if (!orderId) return;
    if (!ordersByOrderId.has(orderId)) {
      ordersByOrderId.set(orderId, {
        orderId,
        orderDate: normText(r[1]),
        orderPrice: Number(r[2]) || 0,
        status: normText(r[3]),
        companyName: normText(r[6]),
        items: []
      });
    }
    ordersByOrderId.get(orderId).items.push({
      itemCode: normText(r[12]),
      description: normText(r[13]),
      unitPrice: Number(r[14]) || 0,
      quantity: Number(r[15]) || 0,
      totalPrice: Number(r[16]) || 0
    });
  });

  const orderPlan = [];
  const unmatchedOrderCompanies = new Set();
  for (const order of ordersByOrderId.values()) {
    const idxs = companyKeyToIndexes.get(resolveCompanyKey(order.companyName)) || [];
    if (idxs.length === 0) {
      unmatchedOrderCompanies.add(order.companyName);
      continue;
    }
    const companyIdx = idxs[0]; // orders belong to one company; if the name is duplicated, attribute to the first
    // Every migrated company now gets a login user (email or username), so
    // this never actually skips — kept as a defensive check in case that
    // assumption ever stops holding.
    if (!companies[companyIdx].username) {
      report.orders.skippedNoUser += 1;
      continue;
    }
    const unmatchedItems = order.items.filter((it) => !itemBySku.has(it.itemCode));
    if (unmatchedItems.length > 0) {
      report.warnings.push(`Order ${order.orderId}: unmatched item codes ${unmatchedItems.map((i) => i.itemCode).join(", ")} — those lines skipped.`);
    }
    const matchedItems = order.items.filter((it) => itemBySku.has(it.itemCode));
    if (matchedItems.length === 0) continue;
    orderPlan.push({ ...order, companyIdx, items: matchedItems });
    report.orders.create += 1;
    report.orders.itemsCreate += matchedItems.length;
  }
  report.orders.unmatchedCompany = [...unmatchedOrderCompanies];

  return {
    event,
    eventId,
    exhibitorAdminRole,
    itemBySku,
    fasciaTemplate,
    companies,
    boothClaims,
    principalAgentPlan,
    productPlan,
    badgePlan,
    fasciaPlan,
    orderPlan,
    report
  };
}

function reportToLines(plan) {
  const { report, event, eventId, companies } = plan;
  const lines = [];
  lines.push(`Target event: ${event.name} (id ${eventId})`);
  lines.push(`Companies to create: ${report.companies.create.length} (skipped ${report.companies.skipNoName} row with no company name)`);
  lines.push(`Login accounts to create: ${report.users.create} (every migrated company gets one, by username and/or email)`);
  lines.push(`  ...of those, with a real email: ${report.users.create - report.users.placeholderEmail}; username-only (placeholder email): ${report.users.placeholderEmail}`);
  lines.push(`Stall allocations: ${report.stalls.allocate.length} (${report.stalls.collisions.length} booth collisions skipped)`);
  report.stalls.collisions.forEach((c) => lines.push(`  COLLISION: ${c}`));
  lines.push(
    `Exhibitor Information: every company gets a pre-filled record with whatever's known — ${companies.filter((c) => c.fullyComplete).length} fully complete (marked done), ${
      companies.length - companies.filter((c) => c.fullyComplete).length
    } partial (still pending, form pre-fills what's known)`
  );
  if (report.directoryInfo.truncatedProfile.length) lines.push(`  Company Profile text truncated to 400 chars for: ${report.directoryInfo.truncatedProfile.join(", ")}`);
  lines.push(`Principal/Agent records: ${report.principalAgent.create} (unmatched company: ${report.principalAgent.unmatched.length})`);
  lines.push(`Product category selections: ${report.productIndex.create} (unmatched subcategory text: ${report.productIndex.unmatchedSubcategory.length})`);
  lines.push(`"Other" product selections: ${report.productIndexOther.create} (unmatched company: ${report.productIndexOther.unmatchedCompany})`);
  lines.push(`Badges: ${report.badges.create} (unmatched company: ${report.badges.unmatched.length}${report.badges.unmatched.length ? " — " + report.badges.unmatched.join(", ") : ""})`);
  lines.push(`Fascia-Name submissions: ${report.fascia.create} (unmatched company: ${report.fascia.unmatched.length}, skipped — no login user: ${report.fascia.skippedNoUser})`);
  lines.push(
    `Orders: ${report.orders.create} (${report.orders.itemsCreate} line items); unmatched company: ${report.orders.unmatchedCompany.length}${
      report.orders.unmatchedCompany.length ? " — " + report.orders.unmatchedCompany.join(", ") : ""
    }; skipped — no login user: ${report.orders.skippedNoUser}`
  );
  if (report.warnings.length) {
    lines.push(`Warnings (${report.warnings.length}):`);
    report.warnings.forEach((w) => lines.push(`  - ${w}`));
  }
  return lines;
}

// Safety guard: this import is NOT idempotent (no dedup against
// already-migrated rows), so applying it twice against the same database
// would create duplicate companies. Returns the list of emails that already
// exist (empty = safe to apply).
async function checkAlreadyImported(pool, plan) {
  const usernames = plan.companies.map((c) => c.username).filter(Boolean);
  const realEmails = plan.companies.filter((c) => c.hasRealEmail).map((c) => c.email);
  if (!usernames.length && !realEmails.length) return [];
  const [already] = await pool.query(
    "SELECT email, username FROM users WHERE username IN (?) OR email IN (?)",
    [usernames.length ? usernames : [null], realEmails.length ? realEmails : [null]]
  );
  return already.map((r) => r.username || r.email);
}

// Performs every write inside one transaction. Throws (and rolls back) on
// any failure — never leaves a half-imported state.
async function applyImport(pool, plan) {
  const { eventId, exhibitorAdminRole, itemBySku, fasciaTemplate, companies, boothClaims, principalAgentPlan, productPlan, badgePlan, fasciaPlan, orderPlan, report } = plan;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const companyIdOf = new Array(companies.length).fill(null);
    const profileIdOf = new Array(companies.length).fill(null);
    const userIdOf = new Array(companies.length).fill(null);

    for (let i = 0; i < companies.length; i++) {
      const c = companies[i];

      const companyUuid = crypto.randomUUID();
      const [companyResult] = await connection.query(
        `INSERT INTO companies
          (uuid, legal_name, display_name, website, address_line1, city, state, postal_code, country, phone, email, is_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [companyUuid, c.companyName, c.companyName, c.website || null, c.address || null, c.city || null, c.state || null, c.postCode || null, c.country, c.phone || null, c.email || null]
      );
      companyIdOf[i] = companyResult.insertId;

      const profileUuid = crypto.randomUUID();
      const [profileResult] = await connection.query(
        `INSERT INTO exhibitor_event_profiles
          (uuid, event_id, company_id, participation_type, profile_status, onboarding_step, created_at, updated_at)
         VALUES (?, ?, ?, 'standalone', 'approved', 0, NOW(), NOW())`,
        [profileUuid, eventId, companyIdOf[i]]
      );
      profileIdOf[i] = profileResult.insertId;

      // Every migrated company gets a login account — by username if it has
      // no real email (most of them), so every imported exhibitor can log
      // in, not just the ones with a real email on file.
      const passwordHash = await hashPassword(c.password);
      const userUuid = crypto.randomUUID();
      const [userResult] = await connection.query(
        `INSERT INTO users
          (uuid, email, username, password_hash, first_name, last_name, phone, timezone, locale, login_attempts, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Asia/Kolkata', 'en-IN', 0, 1, NOW(), NOW())`,
        [userUuid, c.loginEmail, c.username, passwordHash, c.firstName || "Exhibitor", c.lastName || "Contact", c.phone || null]
      );
      userIdOf[i] = userResult.insertId;

      await connection.query(
        `INSERT INTO user_event_roles (user_id, event_id, role_id, company_id, granted_at, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), 1, NOW(), NOW())`,
        [userIdOf[i], eventId, exhibitorAdminRole.id, companyIdOf[i]]
      );

      // Every migrated company gets a directory_info row now — with
      // whatever fields are actually known, nulls for the rest (the column
      // is nullable specifically for this) — so the Exhibitor Information
      // form always opens pre-filled instead of blank, even for exhibitors
      // where the legacy sheet didn't have enough for a complete profile.
      // Only a genuinely fullyComplete row gets marked 'completed': that's
      // also what unlocks the Booth Design / Fascia Name forms, since their
      // gating keys off booth_type actually being set — an exhibitor with a
      // partial row still needs to fill in the rest themselves first.
      await connection.query(
        `INSERT INTO exhibitor_directory_info
          (exhibitor_profile_id, event_id, company_name, brand_name, hall_no, booth_no, booth_type,
           country, country_code, phone_no, email, website, company_profile,
           contact_name, contact_designation, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          profileIdOf[i],
          eventId,
          c.companyName,
          c.firstName || c.companyName,
          c.hallNo || null,
          c.boothNo || null,
          c.boothType || null,
          c.country,
          c.countryCode || "+91",
          c.phone || null,
          c.email || null,
          c.website || null,
          c.companyProfile || null,
          c.firstName || null,
          c.designation || null,
          c.fullyComplete ? "completed" : "pending"
        ]
      );
      if (c.fullyComplete) {
        await connection.query(
          `INSERT INTO mandatory_form_status (exhibitor_profile_id, event_id, form_key, status, completed_at, created_at, updated_at)
           VALUES (?, ?, 'exhibitor-information', 'completed', NOW(), NOW(), NOW())`,
          [profileIdOf[i], eventId]
        );
      }
    }

    // Stalls — only the first-claimed booth per hall+booth pair.
    for (const [, companyIdx] of boothClaims.entries()) {
      const c = companies[companyIdx];
      const [existing] = await connection.query("SELECT id FROM stalls WHERE event_id = ? AND stall_number = ? LIMIT 1", [eventId, c.boothNo]);
      let stallId;
      if (existing.length > 0) {
        stallId = existing[0].id;
      } else {
        const [stallResult] = await connection.query(
          `INSERT INTO stalls (event_id, stall_number, hall, status, created_at, updated_at) VALUES (?, ?, ?, 'booked', NOW(), NOW())`,
          [eventId, c.boothNo, c.hallNo]
        );
        stallId = stallResult.insertId;
      }
      await connection.query(
        `INSERT INTO stall_allocations (stall_id, event_id, exhibitor_profile_id, allocated_at, created_at, updated_at)
         VALUES (?, ?, ?, NOW(), NOW(), NOW())`,
        [stallId, eventId, profileIdOf[companyIdx]]
      );
      await connection.query("UPDATE stalls SET status = 'booked', updated_at = NOW() WHERE id = ?", [stallId]);
    }

    // Marks a mandatory form 'completed' for a migrated exhibitor that
    // actually received real data for it — otherwise the app would nag them
    // to fill in something they've already provided via this migration.
    async function markFormCompleted(profileId, formKey) {
      await connection.query(
        `INSERT INTO mandatory_form_status (exhibitor_profile_id, event_id, form_key, status, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, 'completed', NOW(), NOW(), NOW())
         ON DUPLICATE KEY UPDATE status = 'completed', completed_at = NOW(), updated_at = NOW()`,
        [profileId, eventId, formKey]
      );
    }

    for (const p of principalAgentPlan) {
      await connection.query(
        `INSERT INTO principal_agent_records (exhibitor_profile_id, event_id, type, company_name, website, country_name, country_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [profileIdOf[p.companyIdx], eventId, p.type, p.agentCompanyName, p.website || null, p.countryName, p.countryCode || ""]
      );
    }
    for (const companyIdx of new Set(principalAgentPlan.map((p) => p.companyIdx))) {
      await markFormCompleted(profileIdOf[companyIdx], "principal-agent-information");
    }

    for (const p of productPlan) {
      await connection.query(
        `INSERT IGNORE INTO exhibitor_product_categories (exhibitor_profile_id, event_id, subcategory_id, other_specification, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [profileIdOf[p.companyIdx], eventId, p.subcategoryId, p.other]
      );
    }
    for (const companyIdx of new Set(productPlan.map((p) => p.companyIdx))) {
      await markFormCompleted(profileIdOf[companyIdx], "product-information");
    }

    for (const b of badgePlan) {
      const badgeUuid = crypto.randomUUID().slice(0, 20);
      await connection.query(
        `INSERT INTO badge_records (exhibitor_profile_id, event_id, badge_id, full_name, designation, company_name, country, country_code, mobile_no, email, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [profileIdOf[b.companyIdx], eventId, badgeUuid, b.fullName, b.designation || "", b.companyNameEntered || companies[b.companyIdx].companyName, b.country, b.countryCode || "", b.mobile || "", b.email || ""]
      );
    }
    for (const companyIdx of new Set(badgePlan.map((b) => b.companyIdx))) {
      await markFormCompleted(profileIdOf[companyIdx], "badges-for-exhibitors");
    }

    if (fasciaTemplate) {
      for (const f of fasciaPlan) {
        const initialStatus = fasciaTemplate.requires_approval ? "submitted" : "approved";
        const subUuid = crypto.randomUUID();
        const dataJson = JSON.stringify({ fasciaName: f.fasciaName });
        const [result] = await connection.query(
          `INSERT INTO form_submissions (uuid, form_template_id, event_id, exhibitor_profile_id, submitted_by, data, status, submitted_at, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 1, NOW(), NOW())`,
          [subUuid, fasciaTemplate.id, eventId, profileIdOf[f.companyIdx], userIdOf[f.companyIdx], dataJson, initialStatus]
        );
        await connection.query(
          "INSERT INTO form_submission_history (submission_id, event_id, changed_by, to_status, data_snapshot, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
          [result.insertId, eventId, userIdOf[f.companyIdx], initialStatus, dataJson]
        );
      }
    } else if (fasciaPlan.length) {
      report.warnings.push("fascia-name-submission form template not found — fascia submissions were NOT migrated.");
    }

    for (const o of orderPlan) {
      const companyIdx = o.companyIdx;
      const subtotal = o.items.reduce((s, it) => s + it.totalPrice, 0);
      let taxTotal = 0;
      const lineItems = o.items.map((it) => {
        const svc = itemBySku.get(it.itemCode);
        const taxRate = Number(svc.tax_rate_pct) || 0;
        const lineTax = (it.totalPrice * taxRate) / 100;
        taxTotal += lineTax;
        return { ...it, svc, taxRate, lineTax, lineTotal: it.totalPrice + lineTax };
      });
      const grandTotal = subtotal + taxTotal;

      const orderUuid = crypto.randomUUID();
      const orderNumber = `LEGACY-${o.orderId}`;
      const [orderResult] = await connection.query(
        `INSERT INTO orders
          (uuid, order_number, event_id, exhibitor_profile_id, placed_by, currency, subtotal, surcharge_total, tax_total, discount_total, grand_total, status, payment_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'INR', ?, 0, ?, 0, ?, 'pending', 'unpaid', ?, ?)`,
        [orderUuid, orderNumber, eventId, profileIdOf[companyIdx], userIdOf[companyIdx], subtotal, taxTotal, grandTotal, o.orderDate || new Date(), o.orderDate || new Date()]
      );
      const orderId = orderResult.insertId;

      for (const li of lineItems) {
        await connection.query(
          `INSERT INTO order_items
            (order_id, event_id, service_item_id, sku_snapshot, name_snapshot, quantity, unit_price, surcharge_pct, surcharge_amount, tax_rate_pct, tax_amount, line_total, currency, fulfillment_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 'INR', 'pending', NOW())`,
          [orderId, eventId, li.svc.id, li.itemCode, li.description || li.svc.name, li.quantity, li.unitPrice, li.taxRate, li.lineTax, li.lineTotal]
        );
      }

      const invoiceUuid = crypto.randomUUID();
      await connection.query(
        `INSERT INTO invoices
          (uuid, invoice_number, event_id, order_id, exhibitor_profile_id, billing_name, billing_address, currency, subtotal, tax_total, grand_total, amount_paid, amount_due, invoice_status, issued_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, 0, ?, 'sent', NOW(), NOW(), NOW())`,
        [invoiceUuid, `LEGACY-INV-${o.orderId}`, eventId, orderId, profileIdOf[companyIdx], companies[companyIdx].companyName, companies[companyIdx].address || "—", subtotal, taxTotal, grandTotal, grandTotal]
      );
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = { planImport, reportToLines, checkAlreadyImported, applyImport };
