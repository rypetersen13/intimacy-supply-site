// Builds a signed CCBill FlexForm Dynamic Pricing URL server-side, so the
// salt/encryption key never touches client-side code.
//
// VIP checkout: the customer pays for their cart today (at VIP pricing) and is enrolled
// in the VIP membership at the same time; the $39.95 membership fee starts with the NEXT
// billing cycle (CCBill Dynamic Pricing supports a different initial vs recurring price).
//
// The amount is NOT taken from the browser. It is recomputed on the server from the
// signed-in customer's own unpaid order and the catalog (see _lib/checkout.js), and the
// expected amount is stored on the order so the webhook can verify what was actually paid.
//
// Required Netlify environment variables:
//   CCBILL_SALT_KEY            Encryption Key for subaccount 0000
//   FIREBASE_SERVICE_ACCOUNT   base64 service account JSON
//
// POST body (JSON): { idToken, orderId, email, firstName, lastName, itemTotal }
//   idToken   Firebase Auth ID token of the signed-in customer (required)
//   itemTotal what the browser displayed; only used to detect tampering
// Returns: { url } - the FlexForm link the browser should redirect to.

const crypto = require("crypto");
const { prepareCheckout, errorResponse } = require("./_lib/checkout");

const CLIENT_SUBACC = "0000";
const FLEX_ID = "19f62754-c051-404f-9960-be55ef3fd2f1";
const CURRENCY_CODE = "840"; // USD
const RECURRING_PRICE = 39.95; // the VIP fee, starting next cycle
const MIN_PRICE = 2.95;   // CCBill account-wide minimum
const PERIOD_DAYS = 30;
const NUM_REBILLS = 99;   // effectively "until cancelled" -- max allowed by CCBill's field

exports.handler = async function (event, context, deps) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "method not allowed" };
  }
  try {
    const salt = process.env.CCBILL_SALT_KEY;
    if (!salt) {
      console.error("ccbill-checkout-link: CCBILL_SALT_KEY is not set");
      return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
    }
    const prep = await prepareCheckout(event, "vip", deps);
    const itemTotal = prep.expectedTotal;
    if (itemTotal < MIN_PRICE) {
      return { statusCode: 422, body: JSON.stringify({ error: `Order total must be at least $${MIN_PRICE.toFixed(2)} to check out.` }) };
    }
    const { email, firstName, lastName } = prep.body;

    // CCBill's digest for a subscription with initial and recurring pricing: every pricing
    // field in this exact order, then currencyCode, then the salt.
    const digestSource = `${itemTotal.toFixed(2)}${PERIOD_DAYS}${RECURRING_PRICE.toFixed(2)}${PERIOD_DAYS}${NUM_REBILLS}${CURRENCY_CODE}${salt}`;
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
      // No custom X- passthrough parameters: CCBill's edge firewall rejects any that are not
      // pre-registered with Merchant Support (it returned a 503). The webhook matches the
      // paid order by user and verifies the amount against order.expectedTotal.
    });
    const url = `https://api.ccbill.com/wap-frontflex/flexforms/${FLEX_ID}?${params.toString()}`;
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) };
  } catch (err) {
    return errorResponse(err);
  }
};
