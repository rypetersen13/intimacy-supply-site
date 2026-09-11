// CCBill Webhook handler for Intimacy Supply
// Receives server-to-server subscription event notifications from CCBill and
// updates Firestore: activates VIP on new sale / renewal / reactivation,
// deactivates on cancellation / expiration / chargeback / refund / return / void.
// On a paid NewSaleSuccess, also marks the matching order paid and emails an
// order notification.
//
// CCBill webhooks are NOT cryptographically signed. Verification instead relies on:
//   1. Confirming the request originates from a published CCBill IP range
//   2. Confirming clientAccnum + clientSubacc in the payload match this account
// (The salt/encryption key is used for FlexForm price-tamper protection and the
// Datalink API — it is not involved in verifying webhook posts.)
//
// Required Netlify environment variables:
//   FIREBASE_SERVICE_ACCOUNT   base64 of the service account JSON
// Optional:
//   RESEND_API_KEY       if set, sends an order-notification email on NewSaleSuccess
//   ORDER_NOTIFY_EMAIL   who receives that notification (defaults to hello@intimacysupply.com)
//   GA4_API_SECRET        GA4 Measurement Protocol secret; if set, sends a "purchase" event
//                          on NewSaleSuccess / RenewalSuccess
//   CCBILL_SKIP_IP_CHECK  set to "true" temporarily while testing from your own IP;
//                          remove this variable before going live
//
// Configure in CCBill Admin Portal -> select subaccount 0000 -> Webhooks:
//   Webhook URL: https://intimacysupply.com/.netlify/functions/ccbill-webhook
//   Format: JSON
//   Events: select All (or at minimum: NewSaleSuccess, RenewalSuccess, Cancellation,
//           Expiration, Chargeback, Refund, Return, Void, UserReactivation)
//
// User correlation: CCBill rejects unregistered custom passthrough parameters
// (see ccbill-checkout-link.js), so there is no X-userId/X-orderId round trip.
// Instead this handler resolves the user by ccbillSubscriptionId (set on a prior
// event) or by email, then -- for a NewSaleSuccess -- finds that user's most
// recent unpaid order to mark paid and report on.

const crypto = require("crypto");

const PROJECT_ID = "intimacy-supply";
const GA4_MEASUREMENT_ID = "G-CN0W1J61RL";
const EXPECTED_CLIENT_ACCNUM = "955607";
const EXPECTED_CLIENT_SUBACC = "0000";
const DEFAULT_NOTIFY_EMAIL = "hello@intimacysupply.com";

// CCBill's published Webhook source IP ranges (all are x.y.z.1 - x.y.z.254)
const ALLOWED_IP_PREFIXES = ["64.38.212.", "64.38.215.", "64.38.240.", "64.38.241."];

let cachedToken = null;
let cachedExp = 0;

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedExp - 60) return cachedToken;

  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString("utf8"));
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
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

async function patchDoc(token, path, fields) {
  const mask = Object.keys(fields).map(f => "updateMask.fieldPaths=" + encodeURIComponent(f)).join("&");
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}?${mask}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  return res.ok;
}

async function getDoc(token, path) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) return null;
  const doc = await res.json();
  return fromFirestoreFields(doc.fields || {});
}

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

// Structured query to find a user doc by a field value; returns the doc id or null.
async function findUserByField(token, fieldPath, value) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: "users" }],
      where: {
        fieldFilter: {
          field: { fieldPath },
          op: "EQUAL",
          value: { stringValue: value },
        },
      },
      limit: 1,
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  const match = rows.find(r => r.document);
  if (!match) return null;
  const name = match.document.name; // full path .../documents/users/{id}
  return name.split("/").pop();
}

// Finds this user's most recent unpaid order (no orderBy, to avoid needing a
// composite index -- fine at this order volume; picks the newest client-side).
async function findLatestUnpaidOrder(token, userId) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: "orders" }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: userId } } },
            { fieldFilter: { field: { fieldPath: "paymentStatus" }, op: "EQUAL", value: { stringValue: "unpaid" } } },
          ],
        },
      },
      limit: 10,
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  const docs = rows.filter(r => r.document).map(r => r.document);
  if (!docs.length) return null;
  docs.sort((a, b) => {
    const ta = (a.fields.timestamp && a.fields.timestamp.timestampValue) || "";
    const tb = (b.fields.timestamp && b.fields.timestamp.timestampValue) || "";
    return tb.localeCompare(ta); // newest first
  });
  const newest = docs[0];
  return { id: newest.name.split("/").pop(), fields: fromFirestoreFields(newest.fields) };
}

async function sendOrderNotification(order, subscriptionId) {
  if (!process.env.RESEND_API_KEY) return;
  const to = process.env.ORDER_NOTIFY_EMAIL || DEFAULT_NOTIFY_EMAIL;
  const c = order.customer || {};
  const items = (order.items || []).map(i =>
    `  - ${i.name} (${i.size || "-"}, ${i.colorName || "-"}) x${i.qty} — $${(i.lineTotal || 0).toFixed(2)}`
  ).join("\n") || "  (no items on file)";
  const pricing = order.pricing || {};
  const text = [
    `New paid order: ${order.orderId || "(unknown id)"}`,
    `CCBill subscription: ${subscriptionId || "-"}`,
    ``,
    `Ship to:`,
    `${c.firstName || ""} ${c.lastName || ""}`,
    `${c.address || ""} ${c.address2 || ""}`,
    `${c.city || ""}, ${c.state || ""} ${c.zip || ""}`,
    `${c.country || ""}`,
    `Phone: ${c.phone || "-"}`,
    `Email: ${c.email || order.userEmail || "-"}`,
    ``,
    `Items:`,
    items,
    ``,
    `Total: $${(pricing.total || 0).toFixed(2)}`,
    ``,
    `Log into Eldorado and get this order fulfilled.`,
  ].join("\n");

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Intimacy Supply Orders <onboarding@resend.dev>",
        to: [to],
        subject: `New order — ${order.orderId || "unknown"} — $${(pricing.total || 0).toFixed(2)}`,
        text,
      }),
    });
  } catch (err) {
    console.error("ccbill-webhook: order notification email failed", err.message);
  }
}

function clientIp(event) {
  return (
    event.headers["x-nf-client-connection-ip"] ||
    (event.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    ""
  );
}

function ipAllowed(ip) {
  if (process.env.CCBILL_SKIP_IP_CHECK === "true") return true;
  return ALLOWED_IP_PREFIXES.some(prefix => ip.startsWith(prefix));
}

function num(str) {
  const n = parseFloat(String(str || "").replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

exports.handler = async function (event) {
  try {
    const qs = event.queryStringParameters || {};
    let body = {};
    if (event.body) {
      const ct = (event.headers["content-type"] || "").toLowerCase();
      const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
      if (ct.includes("json")) {
        try { body = JSON.parse(raw); } catch (e) {}
      } else {
        for (const [k, v] of new URLSearchParams(raw)) body[k] = v;
      }
    }
    const all = { ...qs, ...body };

    // 1. Source IP check
    const ip = clientIp(event);
    if (!ipAllowed(ip)) {
      console.error("ccbill-webhook: rejected IP", ip);
      return { statusCode: 403, body: "forbidden" };
    }

    // 2. Account/subaccount check
    if (String(all.clientAccnum) !== EXPECTED_CLIENT_ACCNUM || String(all.clientSubacc) !== EXPECTED_CLIENT_SUBACC) {
      console.error("ccbill-webhook: account mismatch", all.clientAccnum, all.clientSubacc);
      return { statusCode: 403, body: "forbidden" };
    }

    const eventType = all.eventType || "";
    const subscriptionId = String(all.subscriptionId || "");
    const email = all.email || "";
    const price = num(all.price);

    const ACTIVATE = ["NewSaleSuccess", "RenewalSuccess", "UserReactivation", "ManualAdd"];
    const DEACTIVATE = ["Cancellation", "Expiration", "Chargeback", "Refund", "Return", "Void"];

    if (!ACTIVATE.includes(eventType) && !DEACTIVATE.includes(eventType)) {
      // Acknowledge anything we don't act on (failures, upsell events, etc.) so CCBill doesn't retry
      return { statusCode: 200, body: "OK (no action)" };
    }

    const token = await getAccessToken();

    // Resolve which Firestore user this event belongs to
    let userId = null;
    if (subscriptionId) {
      userId = await findUserByField(token, "ccbillSubscriptionId", subscriptionId);
    }
    if (!userId && email) {
      userId = await findUserByField(token, "email", email);
    }

    if (!userId) {
      // Can't correlate to a user yet -- log for manual review but acknowledge receipt
      console.error("ccbill-webhook: could not resolve user for event", eventType, subscriptionId, email);
      return { statusCode: 200, body: "OK (unresolved user)" };
    }

    const nowIso = new Date().toISOString();

    if (ACTIVATE.includes(eventType)) {
      const fields = {
        isVIP: { booleanValue: true },
        vipProvider: { stringValue: "ccbill" },
        vipLastEvent: { stringValue: eventType },
        vipLastEventAt: { timestampValue: nowIso },
      };
      if (subscriptionId) fields.ccbillSubscriptionId = { stringValue: subscriptionId };
      if (eventType === "NewSaleSuccess") fields.vipActivatedAt = { timestampValue: nowIso };
      await patchDoc(token, "users/" + userId, fields);

      // NewSaleSuccess is the cart purchase itself -- find this user's most recent
      // unpaid order, mark it paid, and email an order notification.
      if (eventType === "NewSaleSuccess") {
        const order = await findLatestUnpaidOrder(token, userId);
        if (order) {
          await patchDoc(token, "orders/" + order.id, {
            paymentStatus: { stringValue: "paid" },
            paymentMethod: { stringValue: "ccbill" },
            paymentRef: { stringValue: subscriptionId || "" },
            paidAt: { timestampValue: nowIso },
          }).catch(err => console.error("ccbill-webhook: failed to mark order paid", order.id, err.message));
          await sendOrderNotification({ ...order.fields, orderId: order.fields.orderId || order.id }, subscriptionId);
        } else {
          console.error("ccbill-webhook: NewSaleSuccess but no unpaid order found for user", userId);
        }
      }

      if (process.env.GA4_API_SECRET) {
        fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${process.env.GA4_API_SECRET}`, {
          method: "POST",
          body: JSON.stringify({
            client_id: userId,
            events: [{ name: "purchase", params: { transaction_id: subscriptionId || userId, currency: "USD", value: price || 39.95 } }],
          }),
        }).catch(() => {});
      }
    } else if (DEACTIVATE.includes(eventType)) {
      await patchDoc(token, "users/" + userId, {
        isVIP: { booleanValue: false },
        vipDeactivatedAt: { timestampValue: nowIso },
        vipDeactivationReason: { stringValue: eventType },
      });
    }

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    console.error("ccbill-webhook error:", err.message);
    // 500 signals a transient failure; CCBill may not retry (no documented retry policy),
    // but this at minimum surfaces the failure in Netlify's function logs.
    return { statusCode: 500, body: "error" };
  }
};
