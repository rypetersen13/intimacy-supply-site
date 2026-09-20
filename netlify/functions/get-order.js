// Returns the fields the confirmation page needs to show a real receipt (items, prices, totals).
// Read-only, one order by ID, and only when the order's private access key is supplied.
//
// GET /.netlify/functions/get-order?orderId=IS-20260911-1234&k=<accessKey>
//
// The access key is created with the order and kept in the customer's browser. Order numbers alone
// are guessable, so without the key nothing is returned (the same 404 as "not found").
//
// It uses the shared database client (_lib/firestore.js). An earlier copy of this file requested a
// read-only OAuth scope that Firestore rejects, which made every lookup fail with a 502 and left the
// confirmation page showing $0.00.

const crypto = require("crypto");
const fs = require("./_lib/firestore");
const { siteBase } = require("./_lib/pricing");

// Product photos and page links come from the public catalog, so receipts show the item even when the
// order itself did not store a photo. Cached for a few minutes; a failure just means no photo.
let metaCache = null, metaExp = 0;
async function loadMeta(host, f) {
  const now = Date.now();
  if (metaCache && now < metaExp) return metaCache;
  const res = await (f || fetch)(siteBase(host) + "/products.json");
  if (!res.ok) throw new Error("catalog unavailable: " + res.status);
  const map = new Map();
  for (const p of await res.json()) map.set(String(p.model), { image: p.image || "", slug: p.s || "" });
  metaCache = map; metaExp = now + 5 * 60 * 1000;
  return map;
}

async function handle(event, deps) {
  const d = Object.assign({ fs, loadMeta: (h) => loadMeta(h) }, deps || {});
  try {
    const qs = (event && event.queryStringParameters) || {};
    const orderId = qs.orderId;
    if (!orderId || !/^IS-\d{8}-\d{4}$/.test(orderId)) {
      return { statusCode: 400, body: JSON.stringify({ error: "orderId is required" }) };
    }
    const providedKey = String(qs.k || "");

    const data = await d.fs.getDoc("orders/" + encodeURIComponent(orderId));
    if (!data) return { statusCode: 404, body: JSON.stringify({ error: "order not found" }) };

    const storedKey = String(data.accessKey || "");
    const okKey = providedKey.length >= 16 && storedKey.length === providedKey.length &&
      crypto.timingSafeEqual(Buffer.from(providedKey), Buffer.from(storedKey));
    if (!okKey) return { statusCode: 404, body: JSON.stringify({ error: "order not found" }) };

    let meta = new Map();
    try { meta = await d.loadMeta((event.headers && (event.headers["x-forwarded-host"] || event.headers.host)) || ""); } catch (e) { /* photos are optional */ }
    const c = data.customer || {};

    // What the receipt needs: items, prices, where it is going and how. Never the email or phone.
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        orderId: data.orderId,
        placedAt: data.timestamp || null,
        delivery: data.delivery || "standard",
        shipTo: {
          name: [c.firstName, c.lastName].filter(Boolean).join(" "), firstName: c.firstName || "",
          address: c.address || "", address2: c.address2 || "", city: c.city || "", state: c.state || "", zip: c.zip || "", country: c.country || "",
        },
        items: (data.items || []).map(i => {
          const m = meta.get(String(i.productId)) || {};
          return {
            productId: i.productId, name: i.name, size: i.size, colorName: i.colorName, qty: i.qty,
            unitPrice: i.unitPrice, lineTotal: i.lineTotal, image: m.image || i.image || "", slug: m.slug || "",
          };
        }),
        pricing: data.pricing || null,
        paymentStatus: data.paymentStatus || "unpaid",
        vipMember: !!data.vipMember,
      }),
    };
  } catch (err) {
    console.error("get-order error:", err && err.message);
    return { statusCode: 500, body: JSON.stringify({ error: "internal error" }) };
  }
}

exports.handle = handle;
exports.handler = async function (event) { return handle(event); };
