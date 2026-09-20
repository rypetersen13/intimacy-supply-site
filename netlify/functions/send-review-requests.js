// Scheduled daily: asks recent buyers for a review about two weeks after they paid.
// SAFE BY DEFAULT: until REVIEW_EMAILS_LIVE=1 it only logs how many emails it WOULD send.
//
// Environment variables:
//   RESEND_API_KEY, REVIEW_FROM_EMAIL (a sender on a domain verified in Resend, e.g.
//   "Intimacy Supply <orders@intimacysupply.com>"), REVIEW_EMAILS_LIVE ("1" to send),
//   FIREBASE_SERVICE_ACCOUNT (already set)

const fs = require("./_lib/firestore");
const { pickDue, buildEmail } = require("./_lib/reviewemail");

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function handle(deps) {
  const d = Object.assign({ fs, fetch: (...a) => fetch(...a), now: () => Date.now(), sleep, env: process.env }, deps || {});
  const live = d.env.REVIEW_EMAILS_LIVE === "1";
  const orders = await d.fs.queryEq("orders", "paymentStatus", "paid", 500);
  const due = pickDue(orders, d.now());
  console.log("send-review-requests summary", JSON.stringify({ live, paidOrders: orders.length, due: due.length }));
  if (!live) { console.log("send-review-requests: DRY RUN, nothing sent (set REVIEW_EMAILS_LIVE=1 to send)"); return { sent: 0, due: due.length }; }
  if (!d.env.RESEND_API_KEY || !d.env.REVIEW_FROM_EMAIL) { console.error("send-review-requests: RESEND_API_KEY or REVIEW_FROM_EMAIL is not set"); return { sent: 0, due: due.length, error: "not configured" }; }
  let sent = 0;
  for (const o of due) {
    const mail = buildEmail(o);
    const res = await d.fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + d.env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: d.env.REVIEW_FROM_EMAIL, to: [o.to], subject: mail.subject, text: mail.text }),
    });
    if (!res.ok) { console.error("send-review-requests: send failed for an order, status", res.status); continue; }
    await d.fs.patchDoc("orders/" + o.id, { reviewRequestSentAt: new Date(d.now()) });
    sent++;
    await d.sleep(250);
  }
  console.log("send-review-requests: sent", sent, "of", due.length);
  return { sent, due: due.length };
}

exports.handle = handle;
exports.handler = async function (event) {
  try { await handle(); return { statusCode: 200, body: "ok" }; }
  catch (err) { console.error("send-review-requests failed:", err && err.message); return { statusCode: 500, body: "failed" }; }
};
