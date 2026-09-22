// Scheduled: sends newly-paid orders to Eldorado automatically over SFTP, per their
// Customer Integration Partner Portal spec — one XML file per order, dropped in /uploads.
//
// SAFE BY DEFAULT: only logs what it WOULD send until ELDORADO_ORDERS_LIVE=1 is set in Netlify.
// Read the log first (Netlify > Logs > Functions > send-orders-to-eldorado), then turn it on.
//
// Environment variables (reuses the same login as sync-stock):
//   ELDORADO_SFTP_HOST, ELDORADO_SFTP_USER, ELDORADO_SFTP_PASS
//   ELDORADO_ACCOUNT_ID     your Eldorado business partner # (required to build a valid order)
//   ELDORADO_ORDERS_LIVE    "1" to actually upload; anything else is a dry run
//   FIREBASE_SERVICE_ACCOUNT  base64 service account (already set)

const fs = require("./_lib/firestore");
const { buildOrderXml } = require("./_lib/eldorado-order");

function uploadFile(cfg, fileName, contents) {
  const { Client } = require("ssh2");
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => { conn.end(); reject(new Error("sftp timeout uploading " + fileName)); }, 24000);
    conn.on("ready", () => {
      conn.sftp((err, sftp) => {
        if (err) { clearTimeout(timer); conn.end(); return reject(err); }
        const path = (cfg.uploadDir || "uploads") + "/" + fileName;
        const ws = sftp.createWriteStream(path);
        ws.on("error", e => { clearTimeout(timer); conn.end(); reject(e); });
        ws.on("close", () => { clearTimeout(timer); conn.end(); resolve(); });
        ws.end(contents);
      });
    }).on("error", e => { clearTimeout(timer); reject(e); })
      .connect({ host: cfg.host, port: cfg.port || 22, username: cfg.user, password: cfg.pass, readyTimeout: 15000 });
  });
}

async function handle(deps) {
  const d = Object.assign({ fs, upload: uploadFile, env: process.env, sleep: ms => new Promise(r => setTimeout(r, ms)) }, deps || {});
  const live = d.env.ELDORADO_ORDERS_LIVE === "1";
  const cfg = {
    host: d.env.ELDORADO_SFTP_HOST, user: d.env.ELDORADO_SFTP_USER, pass: d.env.ELDORADO_SFTP_PASS,
    uploadDir: d.env.ELDORADO_UPLOAD_PATH || "uploads",
  };
  if (!cfg.host || !cfg.user || !cfg.pass || !d.env.ELDORADO_ACCOUNT_ID) {
    console.error("send-orders-to-eldorado: ELDORADO_SFTP_HOST/USER/PASS or ELDORADO_ACCOUNT_ID is not set");
    return { sent: 0, error: "not configured" };
  }

  // Orders that are paid, not cancelled/refunded, not yet sent to Eldorado.
  const orders = await d.fs.queryEq("orders", "paymentStatus", "paid", 200);
  const due = orders.filter(o => !o.eldoradoSentAt && o.status !== "cancelled" && o.status !== "refunded" && o.status !== "ordered" && o.status !== "shipped" && o.status !== "delivered");

  console.log("send-orders-to-eldorado summary", JSON.stringify({ live, paidOrders: orders.length, due: due.length }));
  if (!live) { console.log("send-orders-to-eldorado: DRY RUN, nothing sent (set ELDORADO_ORDERS_LIVE=1 to send)"); for (const o of due) { try { buildOrderXml(o); console.log("  would send", o.orderId); } catch (e) { console.error("  cannot send", o.orderId, "-", e.message); } } return { sent: 0, due: due.length }; }

  let sent = 0, failed = 0;
  for (const o of due) {
    let file;
    try { file = buildOrderXml(o); }
    catch (err) { console.error("send-orders-to-eldorado: skipping", o.orderId, "-", err.message); failed++; continue; }
    try {
      await d.upload(cfg, file.fileName, file.xml);
      await d.fs.patchDoc("orders/" + (o.orderId || o.id), { status: "ordered", eldoradoSentAt: new Date(), eldoradoFile: file.fileName });
      sent++;
    } catch (err) {
      console.error("send-orders-to-eldorado: upload failed for", o.orderId, "-", err.message);
      failed++;
    }
    await d.sleep(300);
  }
  console.log("send-orders-to-eldorado: sent", sent, "failed", failed, "of", due.length);
  return { sent, failed, due: due.length };
}

exports.handle = handle;
exports.handler = async function () { try { return { statusCode: 200, body: JSON.stringify(await handle()) }; } catch (err) { console.error("send-orders-to-eldorado failed:", err && err.message); return { statusCode: 500, body: "failed" }; } };
