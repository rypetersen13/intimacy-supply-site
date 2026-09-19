const test = require("node:test");
const assert = require("node:assert/strict");
const aff = require("../netlify/functions/_lib/affiliate");
const fn = require("../netlify/functions/affiliate");

const DAY = 86400000, NOW = Date.parse("2026-09-19T12:00:00Z");
const order = (o) => ({ paymentStatus: "paid", pricing: { total: 100, tax: 8.75, shipping: 0 }, paidAt: new Date(NOW - 40 * DAY).toISOString(), id: "IS-20260801-1234", ...o });

test("only PAID orders earn commission, on net revenue (no tax or shipping)", () => {
  const s = aff.buildSummary("h", [order({}), order({ paymentStatus: "unpaid" }), order({ paymentStatus: "underpaid" })], [], NOW);
  assert.equal(s.totals.orders, 1);
  assert.equal(s.totals.lifetimeCommission, aff.round2((100 - 8.75) * 0.05));
});

test("commissions confirm after 30 days; a payout needs $25 confirmed and no open request", () => {
  const rich = Array.from({ length: 6 }, (_, i) => order({ id: "IS-20260801-100" + i, pricing: { total: 200, tax: 0, shipping: 0 } }));
  let s = aff.buildSummary("h", rich, [], NOW);
  assert.equal(s.totals.confirmedBalance, 60);
  assert.equal(s.payout.canRequest, true);
  s = aff.buildSummary("h", rich, [{ status: "pending", amount: 0 }], NOW);
  assert.equal(s.payout.canRequest, false);
  s = aff.buildSummary("h", [order({ paidAt: new Date(NOW - 5 * DAY).toISOString() })], [], NOW);
  assert.equal(s.totals.pendingBalance > 0 && s.totals.confirmedBalance === 0, true);
});

test("the summary never contains customer data", () => {
  const o = order({ shipping: { name: "Jane Doe", address: "1 Main St" }, email: "jane@example.com", items: [{ name: "Secret item" }] });
  const s = JSON.stringify(aff.buildSummary("h", [o], [{ status: "paid", amount: 30, paypalEmail: "partner@gmail.com", createdAt: new Date(NOW).toISOString() }], NOW));
  assert.ok(!/Jane|Main St|jane@|Secret item|partner@gmail/.test(s));
  assert.ok(/p\*\*\*@gmail\.com/.test(s));
  assert.ok(/IS-\*\*\*\*1234/.test(s));
});

test("session tokens verify, expire, and cannot be altered", () => {
  const key = Buffer.from("k".repeat(32));
  const t = aff.sign("sarah", key, NOW);
  assert.equal(aff.verify(t, key, NOW + 1000), "sarah");
  assert.equal(aff.verify(t, key, NOW + 13 * 3600 * 1000), null);
  assert.equal(aff.verify(t, Buffer.from("x".repeat(32)), NOW), null);
  const forged = Buffer.from(JSON.stringify({ h: "other", exp: NOW + 1e9 })).toString("base64url") + "." + t.split(".")[1];
  assert.equal(aff.verify(forged, key, NOW), null);
  assert.equal(aff.verify("nonsense", key, NOW), null);
});

function deps(over = {}) {
  const created = [];
  return { created, secret: () => Buffer.from("k".repeat(32)), now: () => NOW, sleep: async () => {},
    fs: { getDoc: async () => ({ status: "approved", accessCode: "right-code" }), createDoc: async (c, o) => { created.push([c, o]); return "id1"; } },
    summaryFor: async (h) => aff.buildSummary(h, [order({ pricing: { total: 1000, tax: 0, shipping: 0 } })], [], NOW), ...over };
}
const call = (body, d, ip = "1.2.3.4") => fn.handler({ httpMethod: "POST", headers: { "x-nf-client-connection-ip": ip }, body: JSON.stringify(body) }, {}, d);

test("login: right code works, wrong code is refused and repeated failures are throttled", async () => {
  const d = deps();
  const ok = await call({ action: "login", handle: "@Sarah", code: "right-code" }, d);
  assert.equal(ok.statusCode, 200);
  const j = JSON.parse(ok.body); assert.ok(j.token && j.summary.handle === "sarah");
  for (let i = 0; i < 5; i++) assert.equal((await call({ action: "login", handle: "victim", code: "guess" + i }, d, "9.9.9.9")).statusCode, 401);
  assert.equal((await call({ action: "login", handle: "victim", code: "right-code" }, d, "9.9.9.9")).statusCode, 429);
});

test("unapproved partners and missing codes cannot sign in", async () => {
  assert.equal((await call({ action: "login", handle: "pending1", code: "x" }, deps({ fs: { getDoc: async () => ({ status: "pending", accessCode: "x" }) } }), "5.5.5.5")).statusCode, 401);
  assert.equal((await call({ action: "login", handle: "nocode", code: "x" }, deps({ fs: { getDoc: async () => ({ status: "approved" }) } }), "6.6.6.6")).statusCode, 401);
  assert.equal((await call({ action: "login", handle: "", code: "" }, deps())).statusCode, 400);
});

test("payout request: needs a valid session, a real email, and creates a pending payout for the confirmed balance", async () => {
  const d = deps();
  const token = JSON.parse((await call({ action: "login", handle: "sarah", code: "right-code" }, d, "7.7.7.7")).body).token;
  assert.equal((await call({ action: "payout", token: "bad", paypalEmail: "a@b.co" }, d)).statusCode, 401);
  assert.equal((await call({ action: "payout", token, paypalEmail: "not-an-email" }, d)).statusCode, 400);
  const r = await call({ action: "payout", token, paypalEmail: "a@b.co" }, d);
  assert.equal(r.statusCode, 200);
  assert.equal(d.created[0][0], "payouts");
  assert.equal(d.created[0][1].amount, 50);   // 5% of $1000
  assert.equal(d.created[0][1].status, "pending");
});
