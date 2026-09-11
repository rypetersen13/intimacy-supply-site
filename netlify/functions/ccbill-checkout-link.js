// Builds a signed CCBill FlexForm Dynamic Pricing URL server-side, so the
// salt/encryption key never touches client-side code (it would be visible
// to anyone who views page source if computed in the browser).
//
// Fabletics-style pricing: the customer pays for their cart items today (at
// VIP pricing) and is enrolled in the VIP membership at the same time, but
// the $39.95 membership fee itself doesn't charge until the NEXT billing
// cycle (~30 days out) -- CCBill's Dynamic Pricing natively supports a
// different initial price vs. recurring price for exactly this pattern.
//
// Required Netlify environment variables:
//   CCBILL_SALT_KEY   the Encryption Key from CCBill Admin Portal ->
//                     Sub Account Admin -> View Subaccount Detail (0000) ->
//                     Advanced -> Encryption Key
//
// POST body (JSON):
//   {
//     userId,          // required - Firebase Auth uid, becomes X-userId so the
//                       // webhook handler can find the right Firestore doc
//     email, firstName, lastName,
//     orderId,          // optional - the Firestore order doc id, for cross-reference
//     itemTotal         // required - the cart charge today (after token
//                       // coverage, promo, shipping, tax): what the customer
//                       // is actually paying right now for their order
//   }
//
// Returns: { url } - the full FlexForm link; the browser should redirect to it.

const crypto = require("crypto");

const CLIENT_SUBACC = "0000";
const FLEX_ID = "19f62754-c051-404f-9960-be55ef3fd2f1";
const CURRENCY_CODE = "840"; // USD
const RECURRING_PRICE = 39.95; // the VIP fee, starting next cycle
const MIN_PRICE = 2.95;   // CCBill account-wide minimum
const MAX_PRICE = 100.00; // CCBill account-wide maximum per transaction
const PERIOD_DAYS = 30;
const NUM_REBILLS = 99;   // effectively "until cancelled" -- max allowed by CCBill's field

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "method not allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { userId, email, firstName, lastName, orderId } = body;
    const itemTotal = Math.round((Number(body.itemTotal) || 0) * 100) / 100;

    if (!userId) {
      return { statusCode: 400, body: JSON.stringify({ error: "userId is required" }) };
    }
    if (itemTotal < MIN_PRICE) {
      return {
        statusCode: 422,
        body: JSON.stringify({ error: `Order total must be at least $${MIN_PRICE.toFixed(2)} to check out.` }),
      };
    }
    if (itemTotal > MAX_PRICE) {
      return {
        statusCode: 422,
        body: JSON.stringify({ error: "Order total exceeds CCBill's $100 single-transaction limit. This order needs manual handling or a split charge." }),
      };
    }

    const salt = process.env.CCBILL_SALT_KEY;
    if (!salt) {
      console.error("ccbill-checkout-link: CCBILL_SALT_KEY is not set");
      return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
    }

    // Per CCBill's Dynamic Pricing spec, the digest source string is:
    // initialPrice + initialPeriod + currencyCode + salt, concatenated with no separators.
    // Recurring fields are NOT part of this hash.
    const digestSource = `${itemTotal.toFixed(2)}${PERIOD_DAYS}${CURRENCY_CODE}${salt}`;
    const formDigest = crypto.createHash("md5").update(digestSource).digest("hex");

    const params = new URLSearchParams({
      clientSubacc: CLIENT_SUBACC,
      initialPrice: itemTotal.toFixed(2),
      initialPeriod: String(PERIOD_DAYS),
      currencyCode: CURRENCY_CODE,
      recurringPrice: RECURRING_PRICE.toFixed(2),
      recurringPeriod: String(PERIOD_DAYS),
      numRebills: String(NUM_REBILLS),
      formDigest,
      customer_fname: firstName || "",
      customer_lname: lastName || "",
      email: email || "",
      // NOTE: X-userId / X-orderId custom passthrough params were removed here.
      // CCBill requires passthrough parameter names to be pre-registered with
      // Merchant Support before use -- sending an unregistered one appears to
      // trigger their edge firewall (503, "requested URL was rejected").
      // User/order correlation on the webhook side currently falls back to
      // matching by email. Once a passthrough parameter is registered with
      // CCBill support, add it back here under its approved name.
    });

    const url = `https://api.ccbill.com/wap-frontflex/flexforms/${FLEX_ID}?${params.toString()}`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    };
  } catch (err) {
    console.error("ccbill-checkout-link error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: "internal error" }) };
  }
};
