// Reads a single order document from Firestore and returns just the fields
// the confirmation page needs to render real purchase data (items, prices,
// totals) instead of placeholders. Read-only, single document by ID -- does
// not expose any other order or user data.
//
// GET /.netlify/functions/get-order?orderId=IS-20260911-1234&k=<accessKey>
//
// The order's random accessKey (created with the order, kept in the customer's browser) must be
// supplied. Order numbers alone are guessable, so without the key nothing is returned.
//
// Required Netlify environment variables:
//   FIREBASE_SERVICE_ACCOUNT   base64 of the service account JSON

const crypto = require("crypto");

const PROJECT_ID = "intimacy-supply";

let cachedToken = null;
let cachedExp = 0;

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedExp - 60) return cachedToken;

  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is not set or not available to this function");
  }
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString("utf8"));
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })).toString("base64url");
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(header + "." + claims);
  const signature = signer.sign(sa.private_key, "base64url");
  const jwt = header + "." + claims + "." + signature;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error("token exchange failed: " + res.status);
  const data = await res.json();
  cachedToken = data.access_token;
  cachedExp = now + (data.expires_in || 3600);
  return cachedToken;
}

// Convert a Firestore REST "fields" object back into plain JS values.
function fromFirestoreValue(v) {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue !== undefined) return null;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if (v.mapValue !== undefined) return fromFirestoreFields(v.mapValue.fields || {});
  return null;
}
function fromFirestoreFields(fields) {
  const out = {};
  for (const k of Object.keys(fields)) out[k] = fromFirestoreValue(fields[k]);
  return out;
}

exports.handler = async function (event) {
  try {
    const qs = event.queryStringParameters || {};
    const orderId = qs.orderId;
    if (!orderId || !/^IS-\d{8}-\d{4}$/.test(orderId)) {
      return { statusCode: 400, body: JSON.stringify({ error: "orderId is required" }) };
    }
    const providedKey = String(qs.k || "");

    const token = await getAccessToken();
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/orders/${encodeURIComponent(orderId)}`;
    const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });

    if (res.status === 404) {
      return { statusCode: 404, body: JSON.stringify({ error: "order not found" }) };
    }
    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: "firestore error " + res.status }) };
    }

    const doc = await res.json();
    const data = fromFirestoreFields(doc.fields || {});

    // Constant-time check of the order's private access key. Same 404 as "not found" so the
    // endpoint does not reveal which order numbers exist.
    const storedKey = String(data.accessKey || "");
    const okKey = providedKey.length >= 16 && storedKey.length === providedKey.length &&
      crypto.timingSafeEqual(Buffer.from(providedKey), Buffer.from(storedKey));
    if (!okKey) {
      return { statusCode: 404, body: JSON.stringify({ error: "order not found" }) };
    }

    // Only return what the confirmation page actually needs -- never the
    // customer's address, email, or other PII, even though this endpoint
    // has no auth check (an order ID alone is not meaningfully guessable,
    // but keep the exposed surface minimal regardless).
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        orderId: data.orderId,
        items: (data.items || []).map(i => ({
          name: i.name,
          size: i.size,
          colorName: i.colorName,
          qty: i.qty,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
          image: i.image || "",
        })),
        pricing: data.pricing || null,
        paymentStatus: data.paymentStatus || "unpaid",
        vipMember: !!data.vipMember,
      }),
    };
  } catch (err) {
    console.error("get-order error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: "internal error" }) };
  }
};
