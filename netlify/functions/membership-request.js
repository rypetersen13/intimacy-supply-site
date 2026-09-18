// Membership action alerts (skip / cancel).
//
// WHY THIS EXISTS: skipping a month and cancelling a membership both require
// telling CCBill to stop or suspend the recurring charge. CCBill's Datalink API
// requires IP whitelisting, and Netlify Functions run from dynamic IPs, so the
// site cannot call it directly yet.
//
// Until a static-IP path exists, this function emails the operator immediately
// so the action can be performed manually in the CCBill admin portal before the
// next billing date. This matters legally as well as operationally: the site
// tells customers they will not be charged, so the charge must actually stop.
//
// Env vars: RESEND_API_KEY, ORDER_NOTIFY_EMAIL

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "method not allowed" };
  }

  try {
    const { action, userId, email, firstName, lastName, subscriptionId, monthKey } =
      JSON.parse(event.body || "{}");

    if (!action || !["skip", "cancel"].includes(action)) {
      return { statusCode: 400, body: JSON.stringify({ error: "action must be 'skip' or 'cancel'" }) };
    }

    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.ORDER_NOTIFY_EMAIL;
    if (!apiKey || !to) {
      console.error("membership-request: RESEND_API_KEY or ORDER_NOTIFY_EMAIL not set");
      // Still return 200 so the customer's action isn't blocked by our config.
      return { statusCode: 200, body: JSON.stringify({ ok: true, emailed: false }) };
    }

    const isCancel = action === "cancel";
    const deadline = isCancel
      ? "Cancel in CCBill BEFORE the 6th to stop the next charge."
      : "Suspend this month's rebill in CCBill BEFORE the 6th.";

    const subject = isCancel
      ? `ACTION REQUIRED: Cancel CCBill subscription - ${email || userId}`
      : `ACTION REQUIRED: Skip month for ${email || userId}`;

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px">
        <h2 style="color:#DC2626;margin-bottom:4px">${isCancel ? "Cancellation" : "Skip"} requested</h2>
        <p style="color:#444;font-size:14px;margin-top:0">${deadline}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px">
          <tr><td style="padding:6px 0;color:#666">Customer</td><td style="padding:6px 0"><strong>${[firstName, lastName].filter(Boolean).join(" ") || "-"}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666">Email</td><td style="padding:6px 0">${email || "-"}</td></tr>
          <tr><td style="padding:6px 0;color:#666">User ID</td><td style="padding:6px 0">${userId || "-"}</td></tr>
          <tr><td style="padding:6px 0;color:#666">CCBill subscription</td><td style="padding:6px 0">${subscriptionId || "not on file"}</td></tr>
          ${monthKey ? `<tr><td style="padding:6px 0;color:#666">Month</td><td style="padding:6px 0">${monthKey}</td></tr>` : ""}
          <tr><td style="padding:6px 0;color:#666">Requested</td><td style="padding:6px 0">${new Date().toISOString()}</td></tr>
        </table>
        <p style="font-size:13px;color:#666;margin-top:20px">
          Action it at <a href="https://admin.ccbill.com/loginMM.cgi">admin.ccbill.com</a>.
          The customer has already been told this ${isCancel ? "cancellation" : "skip"} is confirmed.
        </p>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Intimacy Supply <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      console.error("membership-request: email send failed", res.status, await res.text());
      return { statusCode: 200, body: JSON.stringify({ ok: true, emailed: false }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, emailed: true }) };
  } catch (err) {
    console.error("membership-request error:", err.message);
    return { statusCode: 200, body: JSON.stringify({ ok: true, emailed: false }) };
  }
};
