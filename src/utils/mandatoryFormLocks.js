const { ApiError } = require("../middleware/errorHandler");

// Looks up every lock that applies to one exhibitor on one form — both
// rows scoped to their own exhibitor_profile_id and rows scoped to the
// global sentinel (id 0, see mandatory_form_field_locks in schema.sql).
// `global`/`exhibitor` are also returned split out so the admin UI can show
// "locked for everyone" differently from "locked for this company."
async function getLockedFieldKeys(pool, { profileId, eventId, formKey }) {
  const [rows] = await pool.query(
    "SELECT field_key, exhibitor_profile_id FROM mandatory_form_field_locks WHERE event_id = ? AND form_key = ? AND exhibitor_profile_id IN (?, 0)",
    [eventId, formKey, profileId]
  );
  const locked = new Set();
  const global = new Set();
  const exhibitor = new Set();
  for (const row of rows) {
    locked.add(row.field_key);
    if (Number(row.exhibitor_profile_id) === 0) global.add(row.field_key);
    else exhibitor.add(row.field_key);
  }
  return { locked, global, exhibitor };
}

// For "field"-kind registry entries: an endpoint that carries several
// independent fields at once reverts any locked one back to what's already
// on file (in place on incomingBody) rather than rejecting the whole
// request — the exhibitor's edits to the fields that aren't locked still
// save normally.
function applyFieldLocks(existingRecord, incomingBody, lockedKeys, fields) {
  if (!existingRecord) return incomingBody;
  for (const f of fields) {
    if (lockedKeys.has(f.key)) {
      incomingBody[f.bodyKey] = existingRecord[f.key];
    }
  }
  return incomingBody;
}

// For "action"-kind registry entries: single-purpose endpoints (toggle one
// value, add/remove a record) have nothing to partially revert, so locking
// rejects the whole request instead.
function assertActionUnlocked(lockedKeys, ...keys) {
  if (keys.some((k) => lockedKeys.has(k))) {
    throw new ApiError(403, "This form section has been locked by the organiser and can no longer be edited.");
  }
}

module.exports = { getLockedFieldKeys, applyFieldLocks, assertActionUnlocked };
