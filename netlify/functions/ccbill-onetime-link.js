// Builds a signed CCBill FlexForm URL for a ONE-TIME purchase (no membership, no recurring
// charge) on subaccount 0001. VIP members who pay the remainder of an order after redeeming
// tokens also use this flow.
//
// As with the VIP link, the amount is recomputed on the server from the signed-in
// customer's own unpaid order (see _lib/checkout.js) and stored as order.expectedTotal.
//
// Required Netlify environment variables:
//   CCBILL_SALT_KEY            Encryption Key for the subaccount used here
//   FIREBASE_SERVICE_ACCOUNT   base64 service account JSON
//
// POST body (JSON): { idToken, orderId, email, firstName, lastName, itemTotal }
// Returns: { url }

const crypto = require("crypto");
const { prepareCheckout, errorResponse } = require("./_lib/checkout");

const CLIENT_SUBACC = "0001"; // one-time purchases (0000 is the VIP membership subaccount)
const FLEX_ID = "19f62754-c051-404f-9960-be55ef3fd2f1"; // same Flex ID for both subaccounts, per CCBill
const CURRENCY_CODE = "840"; // USD
const MIN_PRICE = 2.95;
const PERIOD_DAYS = 30; // required field even for a one-time charge; no rebill fields are sent

async function handle(event, context, deps) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "method not allowed" };
  }
  try {
    const salt = process.env.CCBILL_SALT_KEY;
    if (!salt) {
      console.error("ccbill-onetime-link: CCBILL_SALT_KEY is not set");
      return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
    }
    const prep = await prepareCheckout(event, "onetime", deps);
    const itemTotal = prep.expectedTotal;
    if (itemTotal < MIN_PRICE) {
      return { statusCode: 422, body: JSON.stringify({ error: `Order total must be at least $${MIN_PRICE.toFixed(2)} to check out.` }) };
    }
    const { email, firstName, lastName } = prep.body;

    // One-time digest: initialPrice + initialPeriod + currencyCode + salt.
    const digestSource = `${itemTotal.toFixed(2)}${PERIOD_DAYS}${CURRENCY_CODE}${salt}`;
    const formDigest = crypto.createHash("md5").update(digestSource).digest("hex");

    const params = new URLSearchParams({
      clientSubacc: CLIENT_SUBACC,
      initialPrice: itemTotal.toFixed(2),
      initialPeriod: String(PERIOD_DAYS),
      currencyCode: CURRENCY_CODE,
      formDigest,
      customer_fname: firstName || "",
      customer_lname: lastName || "",
      email: email || "",
    });
    const url = `https://api.ccbill.com/wap-frontflex/flexforms/${FLEX_ID}?${params.toString()}`;
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) };
  } catch (err) {
    return errorResponse(err);
  }
}

// Node 24 runs handlers with three or more parameters as callback-style handlers and refuses them,
// so the real handler takes exactly (event) and the injectable version is exported for tests.
exports.handle = handle;
exports.handler = async function (event) { return handle(event, {}); };
