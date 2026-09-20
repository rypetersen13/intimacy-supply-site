"use strict";
// Search terms that found nothing. Cleaned so no personal data (emails, phone numbers, links) is ever stored.

function cleanTerm(raw) {
  let s = String(raw == null ? "" : raw).toLowerCase().normalize("NFKC").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  if (s.length < 3 || s.length > 60) return "";
  if (/@|https?:|www\.|\.com|\.net/.test(s)) return "";
  if ((s.match(/\d/g) || []).length >= 6) return "";           // phone or card-like numbers
  if (!/[a-z]/.test(s)) return "";
  return s;
}

function docIdFor(term) {
  return term.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

module.exports = { cleanTerm, docIdFor };
