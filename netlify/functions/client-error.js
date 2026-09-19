// Receives browser error reports from the storefront and writes them to the function log
// (Netlify > Logs > Functions > client-error), so real customer errors are visible.
// POST { m: message, s: source, l: line, c: col, k: stack, u: page url }
// Bodies are capped and each function instance is rate limited to keep the log readable.

const MAX_BODY = 4000;
let windowStart = 0;
let count = 0;

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "method not allowed" };
  try {
    const now = Date.now();
    if (now - windowStart > 60000) { windowStart = now; count = 0; }
    if (++count > 30) return { statusCode: 204, body: "" };
    const raw = String(event.body || "").slice(0, MAX_BODY);
    const e = JSON.parse(raw);
    const clean = v => String(v == null ? "" : v).slice(0, 500).replace(/[\r\n]+/g, " ");
    console.error("client-error", JSON.stringify({
      msg: clean(e.m), src: clean(e.s), line: clean(e.l), col: clean(e.c),
      stack: clean(e.k), url: clean(e.u), ua: clean((event.headers || {})["user-agent"]),
    }));
  } catch (err) { /* ignore malformed reports */ }
  return { statusCode: 204, body: "" };
};
