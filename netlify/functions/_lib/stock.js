"use strict";
// Stock logic for the distributor feed (Eldorado product_feed.tsv). Pure functions, unit tested.

function parseFeed(text) {
  const lines = String(text || "").split(/\r?\n/);
  const header = (lines[0] || "").split("\t").map(h => h.trim());
  const idx = name => header.findIndex(h => h.toLowerCase() === name);
  const iModel = idx("products_model"), iQty = idx("products_quantity");
  const iDisc = idx("discontinued"), iClose = idx("closeout"), iMap = idx("map_price");
  if (iModel < 0 || iQty < 0) {
    throw new Error("feed header is missing PRODUCTS_MODEL or PRODUCTS_QUANTITY; first columns: " + header.slice(0, 8).join(","));
  }
  const yes = v => /^(yes|y|true|1)$/i.test(String(v || "").trim());
  const rows = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const c = line.split("\t");
    if (c.length < header.length * 0.8) continue;            // malformed / truncated line
    const model = (c[iModel] || "").trim();
    if (!model) continue;
    const qty = parseInt(c[iQty], 10);
    const map = iMap >= 0 ? parseFloat(c[iMap]) : NaN;
    rows.set(model, {
      qty: isNaN(qty) ? 0 : qty,
      discontinued: iDisc >= 0 && yes(c[iDisc]),
      closeout: iClose >= 0 && yes(c[iClose]),
      map: isNaN(map) ? null : map,
    });
  }
  return rows;
}

// Models in OUR catalog that must be shown as unavailable: missing from the feed,
// discontinued, or out of stock.
function computeOos(feed, catalogModels, opts) {
  const minQty = (opts && opts.minQty) || 1;
  const oos = [];
  for (const m of catalogModels) {
    const r = feed.get(String(m));
    if (!r || r.discontinued || r.qty < minQty) oos.push(String(m));
  }
  return oos.sort();
}

// Items whose VIP price is below the distributor's minimum advertised price.
function mapReport(feed, catalog) {
  const out = [];
  for (const p of catalog) {
    const r = feed.get(String(p.model));
    if (r && r.map && p.price + 0.005 < r.map) out.push({ model: String(p.model), vip: p.price, map: r.map });
  }
  return out;
}

// Refuse to publish a stock update that looks like a broken feed.
function guardCheck({ feedRows, catalogSize, oosCount, previousOosCount }) {
  if (feedRows < 5000) return { ok: false, reason: `feed has only ${feedRows} rows (expected many thousands)` };
  if (oosCount > catalogSize * 0.5) return { ok: false, reason: `${oosCount} of ${catalogSize} products would be marked unavailable` };
  if (typeof previousOosCount === "number" && oosCount > previousOosCount + catalogSize * 0.2) {
    return { ok: false, reason: `unavailable count jumped from ${previousOosCount} to ${oosCount}` };
  }
  return { ok: true };
}

module.exports = { parseFeed, computeOos, mapReport, guardCheck };
