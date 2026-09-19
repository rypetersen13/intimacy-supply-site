"use strict";
// Creator dashboard logic. Everything a partner sees is computed here on the server from
// PAID orders only, and contains no customer names, emails, addresses or items.

const crypto = require("crypto");

const RATE = 0.05;          // 5% of net revenue (order total less tax and shipping)
const MIN_PAYOUT = 25;      // matches the published affiliate terms
const HOLD_DAYS = 30;       // commissions confirm 30 days after payment (refund window)
const SESSION_HOURS = 12;

const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function cleanHandle(raw) {
  return String(raw || "").trim()
    .replace(/^https?:\/\/(www\.)?reddit\.com/i, "").replace(/^\/?(u|user)\//i, "").replace(/^@/, "")
    .replace(/\s+/g, "").toLowerCase();
}

function safeEqual(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  if (A.length !== B.length) { crypto.timingSafeEqual(A, A); return false; }
  return crypto.timingSafeEqual(A, B);
}

// ---- session tokens (HMAC, 12 hours) ----
function sign(handle, secret, now) {
  const payload = Buffer.from(JSON.stringify({ h: handle, exp: (now || Date.now()) + SESSION_HOURS * 3600 * 1000 })).toString("base64url");
  const mac = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return payload + "." + mac;
}
function verify(token, secret, now) {
  const [payload, mac] = String(token || "").split(".");
  if (!payload || !mac) return null;
  const expect = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (!safeEqual(mac, expect)) return null;
  let d; try { d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch (e) { return null; }
  if (!d || typeof d.h !== "string" || !(d.exp > (now || Date.now()))) return null;
  return d.h;
}

// ---- login throttling (per function instance; a second line of defense behind the access code) ----
const failures = new Map();
function throttled(key, now) {
  const f = failures.get(key);
  return !!(f && f.count >= 5 && now - f.first < 15 * 60 * 1000);
}
function noteFailure(key, now) {
  const f = failures.get(key);
  if (!f || now - f.first >= 15 * 60 * 1000) failures.set(key, { count: 1, first: now });
  else f.count++;
}
function clearFailures(key) { failures.delete(key); }

// ---- numbers ----
function orderNet(o) {
  const p = o && o.pricing;
  if (!p || typeof p.total !== "number") return null;
  return Math.max(0, p.total - (Number(p.tax) || 0) - (Number(p.shipping) || 0));
}
function ts(v) { const n = Date.parse(v); return isNaN(n) ? 0 : n; }
function maskEmail(e) {
  const s = String(e || ""); const i = s.indexOf("@");
  return i > 0 ? s[0] + "***" + s.slice(i) : "";
}

function buildSummary(handle, orders, payouts, now) {
  const t = now || Date.now();
  const month = new Date(t).getUTCMonth(), year = new Date(t).getUTCFullYear();
  const rows = [];
  for (const o of orders || []) {
    if (o.paymentStatus !== "paid") continue;                     // unpaid, abandoned or under-paid orders earn nothing
    const net = orderNet(o); if (net === null) continue;
    const paidAt = ts(o.paidAt) || ts(o.timestamp) || ts(o.createdAt);
    const ageDays = paidAt ? (t - paidAt) / 86400000 : 0;
    const status = o.commissionStatus === "paid" ? "paid"
      : (o.commissionStatus === "confirmed" || ageDays >= HOLD_DAYS) ? "confirmed" : "pending";
    rows.push({ id: String(o.id || o.orderId || ""), paidAt, net: round2(net), commission: round2(net * RATE), status });
  }
  rows.sort((a, b) => b.paidAt - a.paidAt);
  const sum = (arr, f) => round2(arr.reduce((s, r) => s + f(r), 0));
  const inMonth = rows.filter(r => { const d = new Date(r.paidAt); return d.getUTCMonth() === month && d.getUTCFullYear() === year; });
  const openPayout = (payouts || []).some(p => p.status === "pending");
  const confirmedBalance = sum(rows.filter(r => r.status === "confirmed"), r => r.commission);
  return {
    handle,
    totals: {
      orders: rows.length, lifetimeCommission: sum(rows, r => r.commission),
      paidOut: sum(rows.filter(r => r.status === "paid"), r => r.commission),
      confirmedBalance, pendingBalance: sum(rows.filter(r => r.status === "pending"), r => r.commission),
    },
    thisMonth: { orders: inMonth.length, commission: sum(inMonth, r => r.commission) },
    payout: { minimum: MIN_PAYOUT, open: openPayout, canRequest: !openPayout && confirmedBalance >= MIN_PAYOUT, holdDays: HOLD_DAYS },
    recentOrders: rows.slice(0, 20).map(r => ({
      date: r.paidAt ? new Date(r.paidAt).toISOString().slice(0, 10) : "",
      ref: r.id ? "IS-****" + r.id.slice(-4) : "", net: r.net, commission: r.commission, status: r.status,
    })),
    payouts: (payouts || []).map(p => ({
      date: ts(p.createdAt) ? new Date(ts(p.createdAt)).toISOString().slice(0, 10) : "",
      amount: round2(p.amount || 0), status: p.status === "paid" ? "paid" : "pending", to: maskEmail(p.paypalEmail),
    })).sort((a, b) => (b.date > a.date ? 1 : -1)),
  };
}

module.exports = { RATE, MIN_PAYOUT, HOLD_DAYS, cleanHandle, safeEqual, sign, verify, throttled, noteFailure, clearFailures, buildSummary, maskEmail, round2 };
