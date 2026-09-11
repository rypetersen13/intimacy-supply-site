// Builds a signed CCBill FlexForm Dynamic Pricing URL server-side, so the
// salt/encryption key never touches client-side code (it would be visible
// to anyone who views page source if computed in the browser).
//
// The $39.95 VIP membership charge is always flat and standalone -- it is
// billed as its own transaction, separate from any physical item cost.
// (CCBill's own subaccount rules don't cleanly support mixing a one-time
// cart charge with a recurring subscription in a single transaction, so
// item costs are charged through a different path, not this function.)
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
//   }
//
// Returns: { url } - the full FlexForm link; the browser should redirect to it.

const crypto = require("crypto");

const CLIENT_SUBACC = "0000";
const FLEX_ID = "19f62754-c051-404f-9960-be55ef3fd2f1";
const CURRENCY_CODE = "840"; // USD
const PRICE = 39.95; // flat, every charge -- initial and every rebill
const PERIOD_DAYS = 30;
const NUM_REBILLS = 99; // effectively "until cancelled" -- max allowed by CCBill's field

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "method not allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { userId, email, firstName, lastName, orderId } = body;

    if (!userId) {
      return { statusCode: 400, body: JSON.stringify({ error: "userId is required" }) };
    }

    const salt = process.env.CCBILL_SALT_KEY;
    if (!salt) {
      console.error("ccbill-checkout-link: CCBILL_SALT_KEY is not set");
      return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
    }

    // Per CCBill's Dynamic Pricing spec, the digest source string is:
    // initialPrice + initialPeriod + currencyCode + salt, concatenated with no separators.
    // Recurring fields are NOT part of this hash.
    const digestSource = `${PRICE.toFixed(2)}${PERIOD_DAYS}${CURRENCY_CODE}${salt}`;
    const formDigest = crypto.createHash("md5").update(digestSource).digest("hex");

    const params = new URLSearchParams({
      clientSubacc: CLIENT_SUBACC,
      initialPrice: PRICE.toFixed(2),
      initialPeriod: String(PERIOD_DAYS),
      currencyCode: CURRENCY_CODE,
      recurringPrice: PRICE.toFixed(2),
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
