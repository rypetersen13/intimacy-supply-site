"use strict";
// Server-side order pricing. The browser's totals are never trusted: the amount
// sent to the payment processor is recomputed here from the catalog and the
// stored cart. Rules mirror the storefront: VIP price for members or members-to-be,
// tokens (members only), free shipping over FREE_SHIP, flat tax rate, no promo codes.

const FREE_SHIP = 59.97;
const SHIP_STANDARD = 9.95;
const SHIP_EXPEDITED = 15.95;
const TAX_RATE = 0.0875;

const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const tokensFor = price => Math.max(1, Math.ceil((Number(price) || 0) / 50));

let cache = null;
let cacheExp = 0;

function siteBase(host) {
  const h = String(host || "").toLowerCase();
  if (/^([a-z0-9-]+\.)*(intimacysupply\.com|netlify\.app)$/.test(h)) return "https://" + h;
  return "https://intimacysupply.com";
}

async function loadCatalog(host, opts) {
  const now = Date.now();
  if (cache && now < cacheExp) return cache;
  const f = (opts && opts.fetch) || fetch;
  const res = await f(siteBase(host) + "/products.json");
  if (!res.ok) throw new Error("catalog unavailable: " + res.status);
  const list = await res.json();
  const map = new Map();
  for (const p of list) map.set(String(p.model), { price: Number(p.price), orig: Number(p.orig), inStock: p.inStock !== false });
  cache = map;
  cacheExp = now + 5 * 60 * 1000;
  return map;
}
function _resetCatalogCache() { cache = null; cacheExp = 0; }

// items: [{ productId, qty, redeemed }]; opts: { basis: "vip"|"regular", credits, redeemAllowed, delivery }
function computeTotals(items, catalog, opts) {
  if (!Array.isArray(items) || items.length === 0) return { error: "the order has no items" };
  if (items.length > 100) return { error: "too many line items" };
  const vip = opts.basis === "vip";
  let sub = 0, covered = 0, used = 0;
  for (const it of items) {
    const qty = Number(it.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) return { error: "invalid quantity" };
    const p = catalog.get(String(it.productId));
    if (!p || !(p.price > 0) || !(p.orig > 0)) return { error: "unknown product " + it.productId };
    if (!p.inStock || (opts.oos && opts.oos.has(String(it.productId)))) return { error: "out of stock: " + it.productId, outOfStock: true };
    const unit = vip ? p.price : p.orig;
    sub += unit * qty;
    if (it.redeemed && vip && opts.redeemAllowed) {
      const lineTokens = tokensFor(unit) * qty;
      if (used + lineTokens <= (opts.credits || 0)) { used += lineTokens; covered += unit * qty; }
    }
  }
  const afterPromo = Math.max(0, sub - covered);
  const shipping = opts.delivery === "expedited" ? SHIP_EXPEDITED : (afterPromo >= FREE_SHIP ? 0 : SHIP_STANDARD);
  const tax = afterPromo * TAX_RATE;
  return {
    subtotal: round2(sub), tokensUsed: used, covered: round2(covered),
    afterDiscounts: round2(afterPromo), shipping: round2(shipping), tax: round2(tax),
    total: round2(afterPromo + shipping + tax),
  };
}

module.exports = { FREE_SHIP, SHIP_STANDARD, SHIP_EXPEDITED, TAX_RATE, round2, tokensFor, siteBase, loadCatalog, computeTotals, _resetCatalogCache };
