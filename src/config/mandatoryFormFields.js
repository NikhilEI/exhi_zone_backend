// Canonical registry of which fields/actions an admin can lock on each of
// the 7 mandatory forms (see mandatory_form_field_locks / utils/mandatoryFormLocks.js).
// `key` is what gets stored as field_key and is the same name each form's
// route checks against; it's also what the exhibitor-facing pages use, so
// keep it stable once shipped. `bodyKey` is the name that field arrives
// under in the validated request body when it differs from `key` (the two
// bespoke-table forms use snake_case storage columns but camelCase request
// bodies; every other form's storage is the request body itself, so `key`
// doubles as `bodyKey` there and can be omitted).
//
// `kind: "field"` — the submit endpoint carries several independent fields
// at once, so a locked one is silently reverted to what's on file while the
// rest of the submission still saves. Only makes sense where multiple
// lockable fields genuinely arrive together in one request.
// `kind: "action"` — the endpoint is single-purpose (one value, or an
// add/remove operation with nothing to partially revert), so locking it
// rejects the whole request with a clear "this is locked" error instead.
const MANDATORY_FORM_FIELDS = {
  "exhibitor-information": [
    { key: "company_name", bodyKey: "companyName", label: "Company Name", kind: "field" },
    { key: "brand_name", bodyKey: "brandName", label: "Brand Name", kind: "field" },
    { key: "hall_no", bodyKey: "hallNo", label: "Hall No.", kind: "field" },
    { key: "booth_no", bodyKey: "boothNo", label: "Booth No.", kind: "field" },
    { key: "booth_type", bodyKey: "boothType", label: "Booth Type", kind: "field" },
    { key: "country", bodyKey: "country", label: "Country", kind: "field" },
    { key: "country_code", bodyKey: "countryCode", label: "Country Code", kind: "field" },
    { key: "phone_no", bodyKey: "phoneNo", label: "Phone No", kind: "field" },
    { key: "email", bodyKey: "email", label: "Email", kind: "field" },
    { key: "website", bodyKey: "website", label: "Website", kind: "field" },
    { key: "company_profile", bodyKey: "companyProfile", label: "Company Profile", kind: "field" },
    { key: "contact_name", bodyKey: "contactName", label: "Contact Name", kind: "field" },
    { key: "contact_designation", bodyKey: "contactDesignation", label: "Contact Designation", kind: "field" }
  ],
  // Selections are replaced wholesale (delete+reinsert) rather than stored
  // as flat columns, so there's no per-field value to partially revert —
  // locking blocks resubmission outright.
  "product-information": [{ key: "selections", label: "Product Categories & Specification", kind: "action" }],
  "booth-design-submission": [
    { key: "standContractor", label: "Stand Contractor", kind: "field" },
    { key: "attachDesign", label: "Attach Design (Yes/No)", kind: "field" },
    { key: "designDocumentId", label: "Uploaded Design File", kind: "field" }
  ],
  "fascia-name-submission": [{ key: "fasciaName", label: "Fascia Name", kind: "action" }],
  "sound-noise-guidelines": [{ key: "acknowledged", label: "Acknowledgement", kind: "action" }],
  "principal-agent-information": [
    { key: "declaration", label: "No Principal/Agent Declaration", kind: "action" },
    { key: "records", label: "Principal/Agent Entries (add/remove)", kind: "action" }
  ],
  "badges-for-exhibitors": [{ key: "records", label: "Badge Entries (add/remove)", kind: "action" }]
};

function getFormFields(formKey) {
  const fields = MANDATORY_FORM_FIELDS[formKey];
  if (!fields) return null;
  return fields.map((f) => ({ ...f, bodyKey: f.bodyKey || f.key }));
}

module.exports = { MANDATORY_FORM_FIELDS, getFormFields };
