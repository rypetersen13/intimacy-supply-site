// Builds a signed CCBill FlexForm URL for a genuine ONE-TIME purchase --
// no recurring billing at all -- on subaccount 0001 (tangible purchases,
// separate from the VIP membership subaccount 0000).
//
// Per CCBill Merchant Support (confirmed directly): the same FlexForm/Flex ID
// works for both subaccounts; only clientSubacc changes. For a one-time
// purchase, only these fields are sent -- no recurringPrice, recurringPeriod,
// or numRebills at all:
//   clientSubacc, initialPrice, initialPeriod, currencyCode, formDigest
//
// The formDigest for a one-time purchase (no recurring fields present) uses
// the simpler formula: initialPrice + initialPeriod + currencyCode + salt.
// This is DIFFERENT from the membership digest in ccbill-checkout-link.js,
// which includes recurring fields because that transaction has them.
//
// Required Netlify environment variables:
//   CCBILL_SALT_KEY   same salt used for the membership FlexForm

const crypto = require("crypto");

const CLIENT_SUBACC = "0001"; // one-time purchases (0000 is the VIP membership subaccount)
const FLEX_ID = "19f62754-c051-404f-9960-be55ef3fd2f1"; // same Flex ID for both subaccounts, per CCBill
const CURRENCY_CODE = "840"; // USD
const MIN_PRICE = 2.95;
const MAX_PRICE = 100.00;
const PERIOD_DAYS = 30; // required field even for a one-time charge; has no rebill consequence since no recurring fields are sent

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
      return { statusCode: 422, body: JSON.stringify({ error: `Order total must be at least $${MIN_PRICE.toFixed(2)} to check out.` }) };
    }
    if (itemTotal > MAX_PRICE) {
      return { statusCode: 422, body: JSON.stringify({ error: "Order total exceeds CCBill's $100 single-transaction limit. This order needs manual handling." }) };
    }

    const salt = process.env.CCBILL_SALT_KEY;
    if (!salt) {
      console.error("ccbill-onetime-link: CCBILL_SALT_KEY is not set");
      return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
    }

    // One-time purchase digest: NO recurring fields in the hash, since none are sent.
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

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    };
  } catch (err) {
    console.error("ccbill-onetime-link error:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: "internal error" }) };
  }
};
