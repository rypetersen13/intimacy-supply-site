// Cancels a CCBill subscription for real, via the Datalink Subscription
// Management API (https://ccbill.com/doc/ccbill-api-cancel-subscription).
//
// This replaces the manual-email stopgap: previously the site told customers
// "Membership Cancelled" while CCBill kept billing them every month.
//
// IMPORTANT: CCBill's Data Link Extract System may restrict API access by IP.
// Netlify Functions call from dynamic IPs, so if CCBill has an IP restriction
// on this Data Link user, these calls will be rejected. The response is logged
// and surfaced so that failure is visible rather than silent -- and the caller
// still falls back to alerting the operator.
//
// Env vars:
//   CCBILL_DATALINK_USER   Data Link username
//   CCBILL_DATALINK_PASS   Data Link password (may contain & and !, so it is
//                          URL-encoded below -- sending it raw would truncate
//                          the query string at the ampersand)

const CLIENT_ACCNUM = "955607";
const VIP_SUBACC = "0000"; // the recurring membership subaccount

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "method not allowed" };
  }

  try {
    const { subscriptionId } = JSON.parse(event.body || "{}");

    if (!subscriptionId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "subscriptionId is required" }),
      };
    }

    const username = process.env.CCBILL_DATALINK_USER;
    const password = process.env.CCBILL_DATALINK_PASS;
    if (!username || !password) {
      console.error("ccbill-cancel: CCBILL_DATALINK_USER / CCBILL_DATALINK_PASS not set");
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: false, error: "not_configured" }),
      };
    }

    // encodeURIComponent on every value -- the password contains & and !, which
    // would otherwise break or truncate the query string.
    const params = new URLSearchParams({
      action: "cancelSubscription",
      clientAccnum: CLIENT_ACCNUM,
      usingSubacc: VIP_SUBACC,
      subscriptionId: String(subscriptionId),
      username,
      password,
      returnXML: "1",
    });

    const url = `https://datalink.ccbill.com/utils/subscriptionManagement.cgi?${params.toString()}`;

    const res = await fetch(url, { method: "GET" });
    const text = await res.text();

    // Success is <results>1</results>. Anything else is an error code.
    const match = text.match(/<results>\s*(-?\d+)\s*<\/results>/i);
    const code = match ? match[1] : null;
    const success = code === "1";

    if (!success) {
      // Log loudly: a silent failure here means a customer keeps getting billed
      // after being told their membership was cancelled.
      console.error(
        "ccbill-cancel: cancellation FAILED for subscription",
        subscriptionId,
        "http:", res.status,
        "response:", text.slice(0, 300)
      );
    } else {
      console.log("ccbill-cancel: cancelled subscription", subscriptionId);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: success,
        code,
        raw: success ? undefined : text.slice(0, 300),
      }),
    };
  } catch (err) {
    console.error("ccbill-cancel error:", err.message);
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: "internal" }) };
  }
};
