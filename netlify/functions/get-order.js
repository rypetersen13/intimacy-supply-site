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

async function handle(event, deps) {
  const d = Object.assign({ fs }, deps || {});
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

    // Only what the page needs: never the address, email or phone.
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        orderId: data.orderId,
        items: (data.items || []).map(i => ({
          name: i.name, size: i.size, colorName: i.colorName, qty: i.qty,
          unitPrice: i.unitPrice, lineTotal: i.lineTotal, image: i.image || "",
        })),
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
