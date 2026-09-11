// CCBill Webhook handler for Intimacy Supply
// Receives server-to-server subscription event notifications from CCBill and
// updates Firestore: activates VIP on new sale / renewal / reactivation,
// deactivates on cancellation / expiration / chargeback / refund / return / void.
//
// CCBill webhooks are NOT cryptographically signed. Verification instead relies on:
//   1. Confirming the request originates from a published CCBill IP range
//   2. Confirming clientAccnum + clientSubacc in the payload match this account
// (The salt/encryption key is used for FlexForm price-tamper protection and the
// Datalink API — it is not involved in verifying webhook posts.)
//
// Required Netlify environment variables:
//   FIREBASE_SERVICE_ACCOUNT   base64 of the service account JSON (same one segpay-postback uses)
// Optional:
//   GA4_API_SECRET             GA4 Measurement Protocol secret; if set, sends a "purchase" event
//                               on NewSaleSuccess / RenewalSuccess
//   CCBILL_SKIP_IP_CHECK       set to "true" temporarily while testing from your own IP;
//                               remove this variable before going live
//
// Configure in CCBill Admin Portal -> select subaccount 0000 -> Webhooks:
//   Webhook URL: https://intimacysupply.com/.netlify/functions/ccbill-webhook
//   Format: JSON
//   Events: select All (or at minimum: NewSaleSuccess, RenewalSuccess, Cancellation,
//           Expiration, Chargeback, Refund, Return, Void, UserReactivation)
//
// User correlation: this handler looks for a custom pass-through variable named
// "X-userId" in the payload first (set this when building the FlexForm link for a
// logged-in user, per CCBill's Custom Variables convention). If not present, it
// falls back to looking up the user by the CCBill subscriptionId stored on their
// Firestore doc from a prior event, then finally by email as a last resort.

const crypto = require("crypto");

const PROJECT_ID = "intimacy-supply";
const GA4_MEASUREMENT_ID = "G-CN0W1J61RL";
const EXPECTED_CLIENT_ACCNUM = "955607";
const EXPECTED_CLIENT_SUBACC = "0000";

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
    const passthroughUserId = all["X-userId"] || all.x_userid || "";
    const price = num(all.price);

    const ACTIVATE = ["NewSaleSuccess", "RenewalSuccess", "UserReactivation", "ManualAdd"];
    const DEACTIVATE = ["Cancellation", "Expiration", "Chargeback", "Refund", "Return", "Void"];

    if (!ACTIVATE.includes(eventType) && !DEACTIVATE.includes(eventType)) {
      // Acknowledge anything we don't act on (failures, upsell events, etc.) so CCBill doesn't retry
      return { statusCode: 200, body: "OK (no action)" };
    }

    const token = await getAccessToken();

    // Resolve which Firestore user this event belongs to
    let userId = passthroughUserId;
    if (!userId && subscriptionId) {
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
