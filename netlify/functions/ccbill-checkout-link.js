// Builds a signed CCBill FlexForm Dynamic Pricing URL server-side, so the
// salt/encryption key never touches client-side code (it would be visible
// to anyone who views page source if computed in the browser).
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
//     overageAmount     // dollar amount of physical items NOT covered by
//                       // Member Tokens (0 if fully covered or cart is empty)
//   }
//
// Returns: { url } - the full FlexForm link; the browser should redirect to it.
//
// Pricing model: the FIRST charge (initialPrice) is the $39.95 VIP fee plus
// any cart overage not covered by tokens. Every charge AFTER that
// (recurringPrice) is a flat $39.95/month -- overage is only ever collected
// at initial signup with this function. A returning VIP member buying
// something that exceeds their token balance needs a separate Upsell/
// Cross-sell charge against their existing subscription (not yet built).

const crypto = require("crypto");

const CLIENT_SUBACC = "0000";
const FLEX_ID = "19f62754-c051-404f-9960-be55ef3fd2f1";
const CURRENCY_CODE = "840"; // USD
const BASE_PRICE = 39.95;
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
    const overageAmount = Math.max(0, Number(body.overageAmount) || 0);

    if (!userId) {
      return { statusCode: 400, body: JSON.stringify({ error: "userId is required" }) };
    }

    const initialPrice = Math.round((BASE_PRICE + overageAmount) * 100) / 100;

    if (initialPrice > MAX_PRICE) {
      return {
        statusCode: 422,
        body: JSON.stringify({
          error: "Order total plus membership exceeds CCBill's $100 single-transaction limit. This order needs manual handling or a split charge.",
        }),
      };
    }
    if (initialPrice < MIN_PRICE) {
      return { statusCode: 422, body: JSON.stringify({ error: "Price is below CCBill's minimum." }) };
    }

    const salt = process.env.CCBILL_SALT_KEY;
    if (!salt) {
      console.error("ccbill-checkout-link: CCBILL_SALT_KEY is not set");
      return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
    }

    // Per CCBill's Dynamic Pricing spec, the digest source string is:
    // initialPrice + initialPeriod + currencyCode + salt, concatenated with no separators.
    // Recurring fields are NOT part of this hash.
    const digestSource = `${initialPrice.toFixed(2)}${PERIOD_DAYS}${CURRENCY_CODE}${salt}`;
    const formDigest = crypto.createHash("md5").update(digestSource).digest("hex");

    const params = new URLSearchParams({
      clientSubacc: CLIENT_SUBACC,
      initialPrice: initialPrice.toFixed(2),
      initialPeriod: String(PERIOD_DAYS),
      currencyCode: CURRENCY_CODE,
      recurringPrice: BASE_PRICE.toFixed(2),
      recurringPeriod: String(PERIOD_DAYS),
      numRebills: String(NUM_REBILLS),
      formDigest,
      customer_fname: firstName || "",
      customer_lname: lastName || "",
      email: email || "",
      "X-userId": userId,
      "X-orderId": orderId || "",
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
