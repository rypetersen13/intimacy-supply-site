const test = require("node:test");
const assert = require("node:assert/strict");
const { pickDue, buildEmail } = require("../netlify/functions/_lib/reviewemail");
const fn = require("../netlify/functions/send-review-requests");

const DAY = 86400000, NOW = Date.parse("2026-09-30T12:00:00Z");
const ago = d => new Date(NOW - d * DAY).toISOString();
const order = (o) => ({ id: "IS-1", paymentStatus: "paid", paidAt: ago(16), customer: { email: "A@Example.com", firstName: "Ann" }, ...o });

test("only paid orders in the 14 to 60 day window, once per customer, are due", () => {
  const due = pickDue([
    order({ id: "old", paidAt: ago(90) }), order({ id: "new", paidAt: ago(3), customer: { email: "b@x.co" } }),
    order({ id: "unpaid", paymentStatus: "unpaid", customer: { email: "c@x.co" } }),
    order({ id: "sent", reviewRequestSentAt: ago(1), customer: { email: "d@x.co" } }),
    order({ id: "cancelled", status: "cancelled", customer: { email: "e@x.co" } }),
    order({ id: "noemail", customer: {} }),
    order({ id: "ok1" }), order({ id: "dupe", paidAt: ago(20) }),
  ], NOW);
  assert.deepEqual(due.map(d => d.id), ["ok1"]);
  assert.equal(due[0].to, "a@example.com");
});

test("the email is discreet and includes an opt-out and a postal address", () => {
  const m = buildEmail({ firstName: "Ann<script>" });
  assert.equal(m.subject, "How was your order?");
  assert.ok(m.text.startsWith("Hi Annscript,"));
  assert.ok(/email-preferences/.test(m.text) && /Sheridan, WY/.test(m.text));
  assert.ok(!/vibrat|dildo|lingerie|toy|plug/i.test(m.text));
});

test("dry run sends nothing; live sends and marks each order once", async () => {
  const patched = [], sent = [];
  const deps = (live) => ({
    now: () => NOW, sleep: async () => {},
    env: { REVIEW_EMAILS_LIVE: live ? "1" : "0", RESEND_API_KEY: "k", REVIEW_FROM_EMAIL: "Shop <orders@example.com>" },
    fs: { queryEq: async () => [order({ id: "IS-9" })], patchDoc: async (p, o) => { patched.push([p, Object.keys(o)]); } },
    fetch: async (u, init) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200 }; },
  });
  assert.deepEqual(await fn.handle(deps(false)), { sent: 0, due: 1 });
  assert.equal(sent.length, 0);
  assert.deepEqual(await fn.handle(deps(true)), { sent: 1, due: 1 });
  assert.equal(sent[0].to[0], "a@example.com");
  assert.deepEqual(patched, [["orders/IS-9", ["reviewRequestSentAt"]]]);
});
