"use strict";
// Shared checkout preparation for both CCBill link functions.
// Authenticates the caller, loads THEIR unpaid order, recomputes the amount from the
// catalog, refuses tampered totals, and records the amount CCBill should bill.

const fs = require("./firestore");
const { verifyIdToken } = require("./auth");
const pricing = require("./pricing");

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// deps allows tests to inject fakes.
async function prepareCheckout(event, mode, deps) {
  const d = Object.assign({ fs, verifyIdToken, pricing }, deps && typeof deps === "object" ? deps : {});
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { throw new HttpError(400, "invalid request"); }

  if (!body.idToken) throw new HttpError(401, "please sign in again to check out");
  let claims;
  try { claims = await d.verifyIdToken(body.idToken, d.fs.PROJECT_ID); }
  catch (e) { console.warn("checkout: bad id token:", e.message); throw new HttpError(401, "please sign in again to check out"); }
  const uid = claims.sub;
  if (body.userId && body.userId !== uid) throw new HttpError(403, "account mismatch");

  const orderId = String(body.orderId || "");
  if (!/^IS-\d{8}-\d{4}$/.test(orderId)) throw new HttpError(400, "invalid order reference");
  const order = await d.fs.getDoc("orders/" + orderId);
  if (!order) throw new HttpError(404, "order not found");
  if (order.userId !== uid) throw new HttpError(403, "order does not belong to this account");
  if (order.paymentStatus !== "unpaid") throw new HttpError(409, "this order was already processed");

  const user = (await d.fs.getDoc("users/" + uid)) || {};
  const isMember = user.isVIP === true;
  const basis = (mode === "vip" || isMember) ? "vip" : "regular";
  const catalog = await d.pricing.loadCatalog((event.headers || {}).host);
  const items = (order.items || []).map(i => ({ productId: i.productId, qty: i.qty, redeemed: !!i.redeemed }));
  const totals = d.pricing.computeTotals(items, catalog, {
    basis, redeemAllowed: isMember, credits: Math.floor(Number(user.credits) || 0),
    delivery: order.delivery === "expedited" ? "expedited" : "standard",
  });
  if (totals.error) throw new HttpError(totals.outOfStock ? 409 : 422, totals.error);

  const clientTotal = d.pricing.round2(body.itemTotal);
  if (clientTotal < totals.total - 0.02) {
    console.error("checkout: PRICE MISMATCH order", orderId, "client", clientTotal, "server", totals.total);
    throw new HttpError(409, "your order total changed, please refresh and try again");
  }

  await d.fs.patchDoc("orders/" + orderId, {
    expectedTotal: totals.total, expectedTotalAt: new Date(), priceBasis: basis,
  });
  return { uid, orderId, expectedTotal: totals.total, totals, body };
}

function errorResponse(err) {
  if (err instanceof HttpError) return { statusCode: err.status, body: JSON.stringify({ error: err.message }) };
  console.error("checkout error:", err && err.message);
  return { statusCode: 500, body: JSON.stringify({ error: "internal error" }) };
}

module.exports = { prepareCheckout, errorResponse, HttpError };
