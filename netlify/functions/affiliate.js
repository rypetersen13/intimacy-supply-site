// Creator dashboard API. The browser never reads orders, payouts or access codes directly:
// partners sign in here with their handle and access code and receive only their own totals.
//
// POST { action: "login", handle, code }        -> { token, summary }
// POST { action: "summary", token }             -> { summary }
// POST { action: "payout", token, paypalEmail } -> { ok: true }

const crypto = require("crypto");
const fs = require("./_lib/firestore");
const aff = require("./_lib/affiliate");

function secret() {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString("utf8") || "{}");
  if (!sa.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set");
  return crypto.createHash("sha256").update(sa.private_key + ":affiliate-session").digest();
}
const reply = (status, obj) => ({ statusCode: status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(obj) });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function summaryFor(handle) {
  const [orders, payouts] = await Promise.all([fs.queryEq("orders", "affiliate", handle, 500), fs.queryEq("payouts", "handle", handle, 200)]);
  return aff.buildSummary(handle, orders, payouts, Date.now());
}

exports.handler = async function (event, context, deps) {
  if (event.httpMethod !== "POST") return reply(405, { error: "method not allowed" });
  const d = Object.assign({ fs, secret, now: () => Date.now(), sleep }, deps && typeof deps === "object" ? deps : {});
  let body; try { body = JSON.parse(event.body || "{}"); } catch (e) { return reply(400, { error: "invalid request" }); }
  try {
    const key = d.secret();
    if (body.action === "login") {
      const handle = aff.cleanHandle(body.handle);
      const ip = String((event.headers || {})["x-nf-client-connection-ip"] || (event.headers || {})["x-forwarded-for"] || "");
      const now = d.now();
      if (!handle || !body.code || handle.length > 60) return reply(400, { error: "Enter your handle and access code." });
      if (aff.throttled("h:" + handle, now) || aff.throttled("i:" + ip, now)) return reply(429, { error: "Too many attempts. Please wait 15 minutes and try again." });
      const doc = await d.fs.getDoc("affiliates/" + encodeURIComponent(handle));
      const ok = !!(doc && doc.status === "approved" && doc.accessCode && aff.safeEqual(String(body.code).trim(), doc.accessCode));
      if (!ok) {
        aff.noteFailure("h:" + handle, now); aff.noteFailure("i:" + ip, now);
        await d.sleep(400);
        return reply(401, { error: "Handle or access code not recognized. Contact support@intimacysupply.com." });
      }
      aff.clearFailures("h:" + handle);
      return reply(200, { token: aff.sign(handle, key, now), summary: await (d.summaryFor || summaryFor)(handle) });
    }
    const handle = aff.verify(body.token, key, d.now());
    if (!handle) return reply(401, { error: "Your session expired. Please sign in again." });
    if (body.action === "summary") return reply(200, { summary: await (d.summaryFor || summaryFor)(handle) });
    if (body.action === "payout") {
      const email = String(body.paypalEmail || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return reply(400, { error: "Enter a valid PayPal email." });
      const s = await (d.summaryFor || summaryFor)(handle);
      if (!s.payout.canRequest) return reply(409, { error: s.payout.open ? "You already have a payout request in progress." : "Minimum payout is $" + aff.MIN_PAYOUT + " of confirmed commission." });
      await d.fs.createDoc("payouts", { handle, paypalEmail: email, status: "pending", amount: s.totals.confirmedBalance, createdAt: new Date() });
      return reply(200, { ok: true });
    }
    return reply(400, { error: "unknown action" });
  } catch (err) {
    console.error("affiliate error:", err && err.message);
    return reply(500, { error: "Something went wrong. Please try again." });
  }
};
