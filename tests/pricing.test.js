const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../netlify/functions/_lib/pricing");

const catalog = new Map([
  ["A", { price: 14.95, orig: 20.42, inStock: true }],
  ["B", { price: 120.00, orig: 180.00, inStock: true }],
  ["C", { price: 30.00, orig: 45.00, inStock: false }],
]);
const std = { basis: "regular", credits: 0, redeemAllowed: false, delivery: "standard" };

test("regular price, standard shipping under the free-ship threshold, flat tax", () => {
  const t = P.computeTotals([{ productId: "A", qty: 1 }], catalog, std);
  assert.equal(t.subtotal, 20.42);
  assert.equal(t.shipping, 9.95);
  assert.equal(t.tax, P.round2(20.42 * 0.0875));
  assert.equal(t.total, P.round2(20.42 + 9.95 + 20.42 * 0.0875));
});

test("VIP price applies for basis vip; free shipping at or above 59.97", () => {
  const t = P.computeTotals([{ productId: "B", qty: 1 }], catalog, { ...std, basis: "vip" });
  assert.equal(t.subtotal, 120);
  assert.equal(t.shipping, 0);
  assert.equal(t.total, P.round2(120 + 120 * 0.0875));
});

test("expedited shipping is always 15.95", () => {
  const t = P.computeTotals([{ productId: "B", qty: 1 }], catalog, { ...std, delivery: "expedited" });
  assert.equal(t.shipping, 15.95);
});

test("tokens only cover items for members with enough tokens", () => {
  const member = { basis: "vip", credits: 3, redeemAllowed: true, delivery: "standard" };
  const covered = P.computeTotals([{ productId: "B", qty: 1, redeemed: true }], catalog, member);
  assert.equal(covered.tokensUsed, 3);       // 120 -> ceil(120/50) = 3 tokens
  assert.equal(covered.covered, 120);
  assert.equal(covered.afterDiscounts, 0);
  const short = P.computeTotals([{ productId: "B", qty: 1, redeemed: true }], catalog, { ...member, credits: 2 });
  assert.equal(short.tokensUsed, 0);          // not enough tokens -> not covered
  assert.equal(short.afterDiscounts, 120);
  const nonMember = P.computeTotals([{ productId: "B", qty: 1, redeemed: true }], catalog, { ...member, redeemAllowed: false });
  assert.equal(nonMember.afterDiscounts, 120); // cannot redeem
});

test("rejects unknown products, out-of-stock items, bad quantities and empty carts", () => {
  assert.match(P.computeTotals([{ productId: "Z", qty: 1 }], catalog, std).error, /unknown product/);
  const oos = P.computeTotals([{ productId: "C", qty: 1 }], catalog, std);
  assert.match(oos.error, /out of stock/); assert.equal(oos.outOfStock, true);
  assert.match(P.computeTotals([{ productId: "A", qty: 0 }], catalog, std).error, /quantity/);
  assert.match(P.computeTotals([{ productId: "A", qty: 1.5 }], catalog, std).error, /quantity/);
  assert.match(P.computeTotals([{ productId: "A", qty: 999 }], catalog, std).error, /quantity/);
  assert.match(P.computeTotals([], catalog, std).error, /no items/);
});

test("siteBase only accepts our own hosts", () => {
  assert.equal(P.siteBase("intimacysupply.com"), "https://intimacysupply.com");
  assert.equal(P.siteBase("deploy-preview-1--intimacysupply.netlify.app"), "https://deploy-preview-1--intimacysupply.netlify.app");
  assert.equal(P.siteBase("evil.example.com"), "https://intimacysupply.com");
  assert.equal(P.siteBase("intimacysupply.com.evil.com"), "https://intimacysupply.com");
});

test("loadCatalog reads products.json and caches it", async () => {
  P._resetCatalogCache();
  let calls = 0;
  const f = async () => { calls++; return { ok: true, json: async () => [{ model: "X1", price: 10, orig: 15 }, { model: "X2", price: 5, orig: 8, inStock: false }] }; };
  const c = await P.loadCatalog("intimacysupply.com", { fetch: f });
  assert.equal(c.get("X1").price, 10); assert.equal(c.get("X2").inStock, false);
  await P.loadCatalog("intimacysupply.com", { fetch: f });
  assert.equal(calls, 1);
  P._resetCatalogCache();
});
