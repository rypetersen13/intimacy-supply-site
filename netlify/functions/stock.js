// Public, cached list of unavailable models for the storefront: GET /.netlify/functions/stock
// If the list cannot be read the storefront simply shows the catalog as built (fail open for display).
const fs = require("./_lib/firestore");

exports.handler = async function () {
  let body = { oos: [], updatedAt: null };
  try {
    const doc = await fs.getDoc("meta/stock");
    if (doc && Array.isArray(doc.oos)) body = { oos: doc.oos, updatedAt: doc.updatedAt || null };
  } catch (e) { console.error("stock: could not read meta/stock:", e.message); }
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    body: JSON.stringify(body),
  };
};
