const { ApiError } = require("../middleware/errorHandler");

const ADMIN_TIER_ROLES = ["super_admin", "organiser", "finance"];

// Resolves the calling exhibitor user's own exhibitor_event_profiles.id for
// the session's active event — the anchor id most exhibitor-scoped routes
// (cart, orders, passes, forms) key off instead of company_id directly.
async function resolveOwnProfileId(pool, req) {
  if (!req.user.companyId) throw new ApiError(404, "No company profile is associated with this account.");

  const [rows] = await pool.query(
    "SELECT id FROM exhibitor_event_profiles WHERE event_id = ? AND company_id = ? LIMIT 1",
    [req.user.eventId, req.user.companyId]
  );
  if (rows.length === 0) throw new ApiError(404, "No exhibitor profile found for the active event.");
  return rows[0].id;
}

// Same as resolveOwnProfileId, but lets an admin-tier caller act on behalf of
// a specific exhibitor by passing ?profileId=<exhibitor_event_profiles.id> —
// this is what powers "Admin can edit any exhibitor's forms" across every
// mandatory-forms/forms route. A non-admin caller can never use this to see
// or edit someone else's data: the override is only honored for
// super_admin/organiser/finance, everyone else always gets their own profile
// regardless of what (if anything) they pass as ?profileId=.
async function resolveTargetProfileId(pool, req) {
  const requestedId = req.query && req.query.profileId ? Number(req.query.profileId) : null;

  if (requestedId && ADMIN_TIER_ROLES.includes(req.user.role)) {
    const [rows] = await pool.query(
      "SELECT id FROM exhibitor_event_profiles WHERE id = ? AND event_id = ? LIMIT 1",
      [requestedId, req.user.eventId]
    );
    if (rows.length === 0) throw new ApiError(404, "Exhibitor profile not found for the active event.");
    return requestedId;
  }

  return resolveOwnProfileId(pool, req);
}

// True only when this request is an admin-tier caller actually exercising
// the ?profileId= override to act on someone else's behalf (not a regular
// exhibitor viewing/editing their own data). Routes use this to decide
// whether admin-only privileges apply — e.g. bypassing per-field locks that
// exist specifically to stop a regular exhibitor from editing them.
function isAdminOverride(req) {
  return Boolean(req.query && req.query.profileId) && ADMIN_TIER_ROLES.includes(req.user.role);
}

module.exports = { resolveOwnProfileId, resolveTargetProfileId, isAdminOverride };
