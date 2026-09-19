// Scheduled function: reads the distributor's product feed over SFTP, works out which of our
// products are unavailable, and stores that list in Firestore (meta/stock) for the storefront
// and for checkout to use. Runs twice a day (schedule in netlify.toml).
//
// SAFE BY DEFAULT: it only logs what it WOULD do until you set SYNC_LIVE=1 in Netlify.
// Read the log first (Netlify > Logs > Functions > sync-stock), then turn it on.
//
// Environment variables:
//   ELDORADO_SFTP_HOST, ELDORADO_SFTP_USER, ELDORADO_SFTP_PASS   the feed login
//   ELDORADO_FEED_PATH   optional, default "feeds/product_feed.tsv"
//   SYNC_LIVE            "1" to write the result; anything else is a dry run
//   FIREBASE_SERVICE_ACCOUNT  base64 service account (already set)

const fs = require("./_lib/firestore");
const stock = require("./_lib/stock");

function fetchFeed(cfg) {
  const { Client } = require("ssh2");   // loaded only when needed
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => { conn.end(); reject(new Error("sftp timeout")); }, 24000);
    conn.on("ready", () => {
      conn.sftp((err, sftp) => {
        if (err) { clearTimeout(timer); conn.end(); return reject(err); }
        const chunks = [];
        const rs = sftp.createReadStream(cfg.path);
        rs.on("data", c => chunks.push(c));
        rs.on("error", e => { clearTimeout(timer); conn.end(); reject(e); });
        rs.on("end", () => { clearTimeout(timer); conn.end(); resolve(Buffer.concat(chunks).toString("utf8")); });
      });
    }).on("error", e => { clearTimeout(timer); reject(e); })
      .connect({ host: cfg.host, port: cfg.port || 22, username: cfg.user, password: cfg.pass, readyTimeout: 15000 });
  });
}

exports.handler = async function () {
  const live = process.env.SYNC_LIVE === "1";
  const cfg = {
    host: process.env.ELDORADO_SFTP_HOST, user: process.env.ELDORADO_SFTP_USER, pass: process.env.ELDORADO_SFTP_PASS,
    path: process.env.ELDORADO_FEED_PATH || "feeds/product_feed.tsv",
  };
  if (!cfg.host || !cfg.user || !cfg.pass) {
    console.error("sync-stock: ELDORADO_SFTP_HOST/USER/PASS are not set");
    return { statusCode: 500, body: "not configured" };
  }
  try {
    const [feedText, catRes] = await Promise.all([fetchFeed(cfg), fetch("https://intimacysupply.com/products.json")]);
    if (!catRes.ok) throw new Error("could not load our catalog: " + catRes.status);
    const catalog = await catRes.json();
    const feed = stock.parseFeed(feedText);
    const oos = stock.computeOos(feed, catalog.map(p => p.model));
    let previous = null;
    try { const prev = await fs.getDoc("meta/stock"); if (prev && Array.isArray(prev.oos)) previous = prev.oos.length; } catch (e) { /* first run */ }
    const guard = stock.guardCheck({ feedRows: feed.size, catalogSize: catalog.length, oosCount: oos.length, previousOosCount: previous });
    const map = stock.mapReport(feed, catalog);
    console.log("sync-stock summary", JSON.stringify({
      live, feedRows: feed.size, catalog: catalog.length, unavailable: oos.length, previousUnavailable: previous,
      guard, belowMinAdvertisedPrice: map.length, mapSample: map.slice(0, 5),
    }));
    if (!guard.ok) { console.error("sync-stock: NOT publishing:", guard.reason); return { statusCode: 200, body: "guard: " + guard.reason }; }
    if (live) {
      await fs.patchDoc("meta/stock", { oos, count: oos.length, feedRows: feed.size, updatedAt: new Date() });
      console.log("sync-stock: published", oos.length, "unavailable models");
    } else {
      console.log("sync-stock: DRY RUN, nothing written (set SYNC_LIVE=1 to publish)");
    }
    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("sync-stock failed:", err && err.message);
    return { statusCode: 500, body: "failed" };
  }
};

// Exposed for the integration test.
exports._test = { fetchFeed };
