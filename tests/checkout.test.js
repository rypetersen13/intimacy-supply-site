const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const P = require("../netlify/functions/_lib/pricing");
const { prepareCheckout } = require("../netlify/functions/_lib/checkout");
const vipLink = require("../netlify/functions/ccbill-checkout-link");
const oneLink = require("../netlify/functions/ccbill-onetime-link");

const catalog = new Map([["A", { price: 14.95, orig: 20.42, inStock: true }], ["B", { price: 120, orig: 180, inStock: true }]]);
const ORDER = "IS-20260919-1234";

function deps({ order, user, uid = "u1", authOk = true, patched }) {
  return {
    fs: {
      PROJECT_ID: "intimacy-supply",
      getDoc: async p => (p.startsWith("orders/") ? order : p.startsWith("users/") ? user : null),
      patchDoc: async (p, o) => { if (patched) patched.push([p, o]); return true; },
    },
    verifyIdToken: async () => { if (!authOk) throw new Error("bad"); return { sub: uid }; },
    pricing: { ...P, loadCatalog: async () => catalog },
  };
}
const ev = (b) => ({ httpMethod: "POST", headers: { host: "intimacysupply.com" }, body: JSON.stringify({ idToken: "t", orderId: ORDER, itemTotal: 0, ...b }) });
const order = (o = {}) => ({ userId: "u1", paymentStatus: "unpaid", delivery: "standard", items: [{ productId: "A", qty: 1 }], ...o });
const expectStatus = async (p, status) => { await assert.rejects(p, e => e.status === status, `expected ${status}`); };

process.env.CCBILL_SALT_KEY = "test-salt";

test("VIP checkout uses the server total, records it on the order, and signs the CCBill digest", async () => {
  const patched = [];
  const d = deps({ order: order(), user: { isVIP: false }, patched });
  const r = await vipLink.handler(ev({ itemTotal: 999 }), {}, d);   // browser claims more: harmless
  assert.equal(r.statusCode, 200);
  const url = new URL(JSON.parse(r.body).url);
  const expected = P.round2(14.95 + 9.95 + 14.95 * 0.0875);
  assert.equal(url.searchParams.get("initialPrice"), expected.toFixed(2));
  assert.equal(url.searchParams.get("clientSubacc"), "0000");
  const digest = crypto.createHash("md5").update(expected.toFixed(2) + "30" + "39.95" + "30" + "99" + "840" + "test-salt").digest("hex");
  assert.equal(url.searchParams.get("formDigest"), digest);
  assert.deepEqual(patched[0][0], "orders/" + ORDER);
  assert.equal(patched[0][1].expectedTotal, expected);
});

test("one-time checkout signs the digest without recurring fields", async () => {
  const d = deps({ order: order(), user: { isVIP: false } });
  const r = await oneLink.handler(ev({ itemTotal: 34.9 }), {}, d);
  assert.equal(r.statusCode, 200);
  const url = new URL(JSON.parse(r.body).url);
  const expected = P.round2(20.42 + 9.95 + 20.42 * 0.0875);     // non-member pays the regular price
  assert.equal(url.searchParams.get("initialPrice"), expected.toFixed(2));
  assert.equal(url.searchParams.get("clientSubacc"), "0001");
  assert.equal(url.searchParams.get("formDigest"), crypto.createHash("md5").update(expected.toFixed(2) + "30" + "840" + "test-salt").digest("hex"));
});

test("a lowered browser total is rejected", async () => {
  const d = deps({ order: order(), user: {} });
  const r = await vipLink.handler(ev({ itemTotal: 2.95 }), {}, d);
  assert.equal(r.statusCode, 409);
  assert.match(JSON.parse(r.body).error, /changed/);
});

test("the amount comes from the catalog even if the stored order line prices were edited", async () => {
  const d = deps({ order: order({ items: [{ productId: "B", qty: 1, unitPrice: 0.01, lineTotal: 0.01 }], pricing: { total: 0.01 } }), user: {} });
  const r = await oneLink.handler(ev({ itemTotal: 0.01 }), {}, d);
  assert.equal(r.statusCode, 409);              // 0.01 claimed vs ~187 real
});

test("authentication and ownership are enforced", async () => {
  await expectStatus(prepareCheckout({ headers: {}, body: JSON.stringify({ orderId: ORDER }) }, "vip", deps({ order: order(), user: {} })), 401);
  await expectStatus(prepareCheckout(ev({}), "vip", deps({ order: order(), user: {}, authOk: false })), 401);
  await expectStatus(prepareCheckout(ev({ userId: "someone-else" }), "vip", deps({ order: order(), user: {} })), 403);
  await expectStatus(prepareCheckout(ev({}), "vip", deps({ order: order({ userId: "u2" }), user: {} })), 403);
  await expectStatus(prepareCheckout(ev({}), "vip", deps({ order: null, user: {} })), 404);
  await expectStatus(prepareCheckout(ev({ orderId: "../users/u1" }), "vip", deps({ order: order(), user: {} })), 400);
});

test("an order that was already processed cannot be paid twice", async () => {
  await expectStatus(prepareCheckout(ev({}), "vip", deps({ order: order({ paymentStatus: "paid" }), user: {} })), 409);
});

test("members pay VIP prices and can redeem tokens they actually have", async () => {
  const withTokens = deps({ order: order({ items: [{ productId: "B", qty: 1, redeemed: true }] }), user: { isVIP: true, credits: 3 } });
  const a = await prepareCheckout(ev({ itemTotal: 9.95 }), "onetime", withTokens);
  assert.equal(a.totals.tokensUsed, 3);
  assert.equal(a.expectedTotal, 9.95);          // fully covered: only shipping remains
  const fakeTokens = deps({ order: order({ items: [{ productId: "B", qty: 1, redeemed: true }] }), user: { isVIP: true, credits: 0 } });
  await expectStatus(prepareCheckout(ev({ itemTotal: 9.95 }), "onetime", fakeTokens), 409);   // claims a discount they don't have
  const nonMember = deps({ order: order({ items: [{ productId: "B", qty: 1, redeemed: true }] }), user: { isVIP: false, credits: 99 } });
  await expectStatus(prepareCheckout(ev({ itemTotal: 9.95 }), "onetime", nonMember), 409);
});

test("items on the distributor's unavailable list block checkout, and a missing list does not", async () => {
  const withOos = deps({ order: order(), user: {} });
  const base = withOos.fs.getDoc;
  withOos.fs.getDoc = async p => (p === "meta/stock" ? { oos: ["A"] } : base(p));
  await expectStatus(prepareCheckout(ev({ itemTotal: 99 }), "vip", withOos), 409);
  const broken = deps({ order: order(), user: {} });
  const b2 = broken.fs.getDoc;
  broken.fs.getDoc = async p => { if (p === "meta/stock") throw new Error("down"); return b2(p); };
  const ok = await prepareCheckout(ev({ itemTotal: 99 }), "vip", broken);
  assert.ok(ok.expectedTotal > 0);
});

test("out-of-stock and unknown items block checkout", async () => {
  await expectStatus(prepareCheckout(ev({}), "vip", deps({ order: order({ items: [{ productId: "ZZZ", qty: 1 }] }), user: {} })), 422);
});
