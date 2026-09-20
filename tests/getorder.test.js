const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const fn = require("../netlify/functions/get-order");

const KEY = "k".repeat(24);
const order = {
  orderId: "IS-20260919-8399", accessKey: KEY, paymentStatus: "paid", vipMember: true,
  customer: { email: "a@b.co", phone: "9205709365", address: "1 Main St" },
  items: [{ name: "Test Vibe", size: "One Size", qty: 1, unitPrice: 28.95, lineTotal: 28.95, image: "x.jpg" }],
  pricing: { subtotal: 41.9, total: 41.43 },
};
const ev = (q) => ({ queryStringParameters: q });
const deps = (doc) => ({ fs: { getDoc: async () => doc } });

test("returns the receipt fields for the right key and nothing personal", async () => {
  const r = await fn.handle(ev({ orderId: "IS-20260919-8399", k: KEY }), deps(order));
  assert.equal(r.statusCode, 200);
  const b = JSON.parse(r.body);
  assert.equal(b.items[0].name, "Test Vibe");
  assert.equal(b.pricing.total, 41.43);
  assert.equal(b.paymentStatus, "paid");
  assert.ok(!/a@b\.co|9205709365|Main St/.test(r.body), "personal details leaked");
});

test("wrong key, missing order and bad ids are refused the same way", async () => {
  assert.equal((await fn.handle(ev({ orderId: "IS-20260919-8399", k: "z".repeat(24) }), deps(order))).statusCode, 404);
  assert.equal((await fn.handle(ev({ orderId: "IS-20260919-8399" }), deps(order))).statusCode, 404);
  assert.equal((await fn.handle(ev({ orderId: "IS-20260919-8399", k: KEY }), deps(null))).statusCode, 404);
  assert.equal((await fn.handle(ev({ orderId: "nope" }), deps(order))).statusCode, 400);
});

test("a database failure is a clean 500, and the file uses the shared client", async () => {
  const r = await fn.handle(ev({ orderId: "IS-20260919-8399", k: KEY }), { fs: { getDoc: async () => { throw new Error("boom"); } } });
  assert.equal(r.statusCode, 500);
  for (const f of fs.readdirSync(path.join(__dirname, "..", "netlify", "functions")).filter(f => f.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(__dirname, "..", "netlify", "functions", f), "utf8");
    assert.ok(!/datastore\.readonly/.test(src), f + " requests a read-only scope that Firestore rejects");
  }
});
