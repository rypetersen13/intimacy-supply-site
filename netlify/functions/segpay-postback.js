// Segpay postback handler for Intimacy Supply
// Receives server-to-server payment notifications from Segpay and updates
// Firestore: activates VIP on successful auth/rebill, deactivates on
// cancel/refund/chargeback, and marks the originating order paid.
//
// Required Netlify environment variables:
//   FIREBASE_SERVICE_ACCOUNT  base64 of the service account JSON (use the NEW rotated key)
//   SEGPAY_POSTBACK_KEY       any secret string; must match the "key" param configured
//                             on the postback URL in the Segpay portal
// Optional:
//   GA4_API_SECRET            GA4 Measurement Protocol secret; if set, a real
//                             "purchase" event is sent on successful payment
//
// Postback URL to configure in the Segpay merchant portal:
//   https://intimacysupply.com/.netlify/functions/segpay-postback?key=YOUR_SECRET
// Field mapping in the portal: pass the site user id as REF1 and order id as REF2.

const crypto = require("crypto");

const PROJECT_ID = "intimacy-supply";
const GA4_MEASUREMENT_ID = "G-CN0W1J61RL";

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

function param(all, names) {
  for (const n of names) {
    if (all[n] != null && String(all[n]).length) return String(all[n]);
  }
  return "";
}

exports.handler = async function (event) {
  try {
    // Merge query params and form/JSON body params
    const all = { ...(event.queryStringParameters || {}) };
    if (event.body) {
      const ct = (event.headers["content-type"] || "").toLowerCase();
      const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
      if (ct.includes("json")) {
        try { Object.assign(all, JSON.parse(raw)); } catch (e) {}
      } else {
        for (const [k, v] of new URLSearchParams(raw)) all[k] = v;
      }
    }

    // Shared-secret check
    if (!process.env.SEGPAY_POSTBACK_KEY || all.key !== process.env.SEGPAY_POSTBACK_KEY) {
      return { statusCode: 403, body: "forbidden" };
    }

    const userId = param(all, ["REF1", "ref1", "userid", "x-user-id"]);
    const orderId = param(all, ["REF2", "ref2", "orderid", "x-order-id"]);
    const stage = param(all, ["stage", "action", "trantype", "transtype"]).toLowerCase();
    const tranId = param(all, ["tranid", "transactionid", "purchaseid"]);

    const activates = ["auth", "sale", "purchase", "rebill", "initial", "access"].some(s => stage.includes(s));
    const deactivates = ["cancel", "refund", "chargeback", "void", "expire"].some(s => stage.includes(s));

    if (!userId || (!activates && !deactivates)) {
      // Acknowledge anything we cannot act on so Segpay does not retry forever
      return { statusCode: 200, body: "OK (no action)" };
    }

    const token = await getAccessToken();
    const nowIso = new Date().toISOString();

    if (activates) {
      await patchDoc(token, "users/" + userId, {
        isVIP: { booleanValue: true },
        vipSignupPending: { booleanValue: false },
        vipActivatedAt: { timestampValue: nowIso },
        vipProvider: { stringValue: "segpay" },
        vipLastTransaction: { stringValue: tranId || stage },
      });
      if (orderId) {
        await patchDoc(token, "orders/" + orderId, {
          paymentStatus: { stringValue: "paid" },
          paidAt: { timestampValue: nowIso },
        });
      }
      // Real purchase event for GA4, server-side, only on confirmed money
      if (process.env.GA4_API_SECRET) {
        fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${process.env.GA4_API_SECRET}`, {
          method: "POST",
          body: JSON.stringify({
            client_id: userId,
            events: [{ name: "purchase", params: { transaction_id: tranId || orderId || userId, currency: "USD", value: 39.95 } }],
          }),
        }).catch(() => {});
      }
    } else if (deactivates) {
      await patchDoc(token, "users/" + userId, {
        isVIP: { booleanValue: false },
        vipDeactivatedAt: { timestampValue: nowIso },
        vipDeactivationReason: { stringValue: stage },
      });
    }

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    console.error("segpay-postback error:", err.message);
    // 500 tells Segpay to retry later, which is what we want on transient failures
    return { statusCode: 500, body: "error" };
  }
};
