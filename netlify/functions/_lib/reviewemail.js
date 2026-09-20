"use strict";
// Post-order review request emails: which orders are due, and what the email says.
// The email is deliberately discreet: no product names, nothing that describes the purchase.

const DAY = 86400000;
const FIRST_AFTER_DAYS = 14;   // standard shipping is 6-10 business days, so most orders have arrived
const LAST_AFTER_DAYS = 60;    // do not chase old orders

function ts(v) { const n = Date.parse(v); return isNaN(n) ? 0 : n; }

function emailOf(o) {
  const e = (o.customer && o.customer.email) || o.userEmail || "";
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e.trim().toLowerCase() : "";
}

// Orders that should get a request now. One email per customer per run.
function pickDue(orders, now, opts) {
  const t = now || Date.now();
  const max = (opts && opts.max) || 40;
  const seen = new Set();
  const due = [];
  for (const o of orders || []) {
    if (o.paymentStatus !== "paid") continue;
    if (o.reviewRequestSentAt || o.reviewOptOut) continue;
    if (o.status === "cancelled" || o.refundStatus === "refunded") continue;
    const paid = ts(o.paidAt) || 0;
    if (!paid) continue;
    const age = (t - paid) / DAY;
    if (age < FIRST_AFTER_DAYS || age > LAST_AFTER_DAYS) continue;
    const to = emailOf(o);
    if (!to || seen.has(to)) continue;
    seen.add(to);
    due.push({ id: o.id || o.orderId, to, firstName: (o.customer && o.customer.firstName) || "" });
    if (due.length >= max) break;
  }
  return due;
}

function buildEmail(d) {
  const name = String(d.firstName || "").trim().replace(/[<>&"]/g, "").slice(0, 40);
  const hi = name ? "Hi " + name + "," : "Hi,";
  const text = [
    hi, "",
    "Thanks for shopping with Intimacy Supply. If your order has arrived, we would love to hear how it went. Reviews help other shoppers choose with confidence.",
    "",
    "Sign in, open any product you bought, and use the Reviews section at the bottom of its page:",
    "https://intimacysupply.com/", "",
    "If anything was wrong with your order, reply to this email or contact hello@intimacysupply.com or (559) 334-0826 and we will make it right.",
    "",
    "Dharma Media & Technology LLC, c/o Northwest Registered Agent, 30 N Gould St Ste N, Sheridan, WY 82801",
    "To stop these emails: https://intimacysupply.com/email-preferences",
  ].join("\n");
  return { subject: "How was your order?", text };
}

module.exports = { FIRST_AFTER_DAYS, LAST_AFTER_DAYS, pickDue, buildEmail, emailOf };
