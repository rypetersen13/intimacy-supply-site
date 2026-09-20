// Records what shoppers searched for and did not find, so the catalog and search can be improved.
// POST { q: "term" }. Counts land in Firestore search_misses/<term> (admin-only collection).
// Nothing personal is stored: terms that look like emails, links or numbers are dropped.

const fs = require("./_lib/firestore");
const { cleanTerm, docIdFor } = require("./_lib/searchmiss");

let windowStart = 0;
let count = 0;

async function handle(event, deps) {
  const d = Object.assign({ fs, now: () => Date.now() }, deps || {});
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "method not allowed" };
  const now = d.now();
  if (now - windowStart > 60000) { windowStart = now; count = 0; }
  if (++count > 60) return { statusCode: 204, body: "" };            // simple flood guard per instance
  let body; try { body = JSON.parse(String(event.body || "").slice(0, 500)); } catch (e) { return { statusCode: 204, body: "" }; }
  const term = cleanTerm(body && body.q);
  const id = term && docIdFor(term);
  if (!id) return { statusCode: 204, body: "" };
  try {
    await d.fs.incrementFields("search_misses/" + id, { count: 1 });
    await d.fs.patchDoc("search_misses/" + id, { term: term, lastSeen: new Date(now) });
  } catch (err) { console.error("search-miss:", err && err.message); }
  return { statusCode: 204, body: "" };
}

exports.handle = handle;
exports.handler = async function (event) { return handle(event); };
