// Scheduled: reads Eldorado's shipping_confirmation folder (updated every 2 hours, per their
// docs, with a rolling 7 days of files) and marks our matching orders shipped, with tracking.
//
// SAFE BY DEFAULT: only logs what it WOULD update until ELDORADO_ORDERS_LIVE=1 is set (shared
// with send-orders-to-eldorado — both are part of the same automatic fulfillment pipeline).
//
// Environment variables: same SFTP login as sync-stock / send-orders-to-eldorado.
//   ELDORADO_CONFIRM_PATH   optional, default "shipping_confirmation"

const fs = require("./_lib/firestore");
const { parseShipmentConfirmations } = require("./_lib/eldorado-order");

// A short, discreet tracking email — no product names, matching the tone of the review-request email.
async function sendTrackingEmail(order, deps) {
  const d = Object.assign({ fetch: (...a) => fetch(...a), env: process.env }, deps || {});
  const to = order.userEmail || (order.customer && order.customer.email);
  if (!to || !d.env.RESEND_API_KEY || !d.env.REVIEW_FROM_EMAIL) return;
  const text = [
    "Hi" + ((order.customer && order.customer.firstName) ? " " + order.customer.firstName : "") + ",", "",
    "Your Intimacy Supply order " + order.orderId + " has shipped.",
    (order.carrier || "Carrier") + " tracking number: " + order.trackingNumber,
    "", "Questions? Reply to this email or contact hello@intimacysupply.com or (559) 334-0826.",
    "", "Dharma Media & Technology LLC, c/o Northwest Registered Agent, 30 N Gould St Ste N, Sheridan, WY 82801",
  ].join("\n");
  const res = await d.fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + d.env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: d.env.REVIEW_FROM_EMAIL, to: [to], subject: "Your order has shipped", text }),
  });
  if (!res.ok) throw new Error("resend status " + res.status);
}

function listAndReadDir(cfg) {
  const { Client } = require("ssh2");
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => { conn.end(); reject(new Error("sftp timeout")); }, 25000);
    conn.on("ready", () => {
      conn.sftp((err, sftp) => {
        if (err) { clearTimeout(timer); conn.end(); return reject(err); }
        sftp.readdir(cfg.dir, (err, list) => {
          if (err) { clearTimeout(timer); conn.end(); return reject(err); }
          const files = list.filter(f => /\.xml$/i.test(f.filename));
          let remaining = files.length;
          if (remaining === 0) { clearTimeout(timer); conn.end(); return resolve([]); }
          const out = [];
          files.forEach(f => {
            const chunks = [];
            const rs = sftp.createReadStream(cfg.dir + "/" + f.filename);
            rs.on("data", c => chunks.push(c));
            rs.on("error", () => { if (--remaining === 0) { clearTimeout(timer); conn.end(); resolve(out); } });
            rs.on("end", () => {
              out.push({ name: f.filename, text: Buffer.concat(chunks).toString("utf8") });
              if (--remaining === 0) { clearTimeout(timer); conn.end(); resolve(out); }
            });
          });
        });
      });
    }).on("error", e => { clearTimeout(timer); reject(e); })
      .connect({ host: cfg.host, port: cfg.port || 22, username: cfg.user, password: cfg.pass, readyTimeout: 15000 });
  });
}

async function handle(deps) {
  const d = Object.assign({ fs, listAndRead: listAndReadDir, sendTrackingEmail, env: process.env }, deps || {});
  const live = d.env.ELDORADO_ORDERS_LIVE === "1";
  const cfg = {
    host: d.env.ELDORADO_SFTP_HOST, user: d.env.ELDORADO_SFTP_USER, pass: d.env.ELDORADO_SFTP_PASS,
    dir: d.env.ELDORADO_CONFIRM_PATH || "shipping_confirmation",
  };
  if (!cfg.host || !cfg.user || !cfg.pass) {
    console.error("import-eldorado-tracking: ELDORADO_SFTP_HOST/USER/PASS is not set");
    return { updated: 0, error: "not configured" };
  }
  let files;
  try { files = await d.listAndRead(cfg); } catch (err) { console.error("import-eldorado-tracking: could not read folder:", err.message); return { updated: 0, error: err.message }; }
  const confirmations = files.flatMap(f => parseShipmentConfirmations(f.text));
  console.log("import-eldorado-tracking summary", JSON.stringify({ live, filesRead: files.length, confirmations: confirmations.length }));

  let updated = 0;
  for (const c of confirmations) {
    let existing;
    try { existing = await d.fs.getDoc("orders/" + c.orderId); } catch (e) { continue; }
    if (!existing || existing.status === "shipped" || existing.status === "delivered" || existing.trackingNumber === c.trackingNumber) continue;
    if (!live) { console.log("  would mark shipped:", c.orderId, c.carrier, c.trackingNumber); continue; }
    await d.fs.patchDoc("orders/" + c.orderId, { status: "shipped", trackingNumber: c.trackingNumber, carrier: c.carrier, shippedAt: new Date(), trackingSource: "eldorado-auto" });
    updated++;
    try { await d.sendTrackingEmail(Object.assign({}, existing, c)); } catch (e) { console.error("import-eldorado-tracking: tracking email failed for", c.orderId, "-", e.message); }
  }
  if (!live) console.log("import-eldorado-tracking: DRY RUN, nothing written (set ELDORADO_ORDERS_LIVE=1 to write)");
  else console.log("import-eldorado-tracking: updated", updated, "orders");
  return { updated, seen: confirmations.length };
}

exports.handle = handle;
exports._sendTrackingEmail = sendTrackingEmail;
exports.handler = async function () { try { return { statusCode: 200, body: JSON.stringify(await handle()) }; } catch (err) { console.error("import-eldorado-tracking failed:", err && err.message); return { statusCode: 500, body: "failed" }; } };
