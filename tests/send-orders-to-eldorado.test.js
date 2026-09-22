const test = require("node:test");
const assert = require("node:assert/strict");
const fn = require("../netlify/functions/send-orders-to-eldorado");

const order = (o = {}) => ({
  orderId: "IS-1", paymentStatus: "paid", status: "pending",
  customer: { firstName: "Ann", lastName: "Lee", address: "1 Main St", city: "Neenah", state: "WI", zip: "54956", phone: "9205709365" },
  items: [{ productId: "VI-A0201", qty: 1 }],
  ...o,
});

function deps(live, orders) {
  const uploads = [], patches = [];
  return {
    env: { ELDORADO_SFTP_HOST: "h", ELDORADO_SFTP_USER: "u", ELDORADO_SFTP_PASS: "p", ELDORADO_ACCOUNT_ID: "50164PF", ELDORADO_ORDERS_LIVE: live ? "1" : "0" },
    fs: {
      queryEq: async () => orders,
      patchDoc: async (path, fields) => { patches.push([path, fields]); },
    },
    upload: async (cfg, fileName, xml) => { uploads.push([fileName, xml]); },
    sleep: async () => {},
    _uploads: uploads, _patches: patches,
  };
}

test("dry run sends nothing but reports what is due", async () => {
  const d = deps(false, [order(), order({ orderId: "IS-2", status: "ordered" })]);   // IS-2 already sent
  const r = await fn.handle(d);
  assert.deepEqual(r, { sent: 0, due: 1 });
  assert.equal(d._uploads.length, 0);
});

test("live run uploads an XML file per due order and marks it ordered", async () => {
  const d = deps(true, [order()]);
  const r = await fn.handle(d);
  assert.deepEqual(r, { sent: 1, failed: 0, due: 1 });
  assert.equal(d._uploads.length, 1);
  assert.equal(d._uploads[0][0], "IS-1.xml");
  assert.match(d._uploads[0][1], /<SourceOrderNumber>IS-1<\/SourceOrderNumber>/);
  assert.deepEqual(d._patches[0][0], "orders/IS-1");
  assert.equal(d._patches[0][1].status, "ordered");
  assert.ok(d._patches[0][1].eldoradoSentAt);
});

test("already-ordered, cancelled, refunded and unpaid orders are never re-sent", async () => {
  const d = deps(true, [
    order({ orderId: "A", status: "ordered" }), order({ orderId: "B", status: "cancelled" }),
    order({ orderId: "C", status: "refunded" }), order({ orderId: "D", paymentStatus: "unpaid" }),
  ]);
  // queryEq is mocked to return exactly what we pass, but the real query only returns paymentStatus === "paid";
  // the function's own filter must still exclude the ordered/cancelled/refunded ones.
  d.fs.queryEq = async () => [order({ orderId: "A", status: "ordered" }), order({ orderId: "B", status: "cancelled" }), order({ orderId: "C", status: "refunded" })];
  const r = await fn.handle(d);
  assert.equal(r.sent, 0);
  assert.equal(d._uploads.length, 0);
});

test("an order missing required fields is skipped, not crashed on", async () => {
  const d = deps(true, [order({ orderId: "BAD", customer: { firstName: "X" } })]);
  const r = await fn.handle(d);
  assert.equal(r.sent, 0);
  assert.equal(r.failed, 1);
  assert.equal(d._uploads.length, 0);
});

test("refuses to run with missing configuration", async () => {
  const d = deps(true, [order()]);
  delete d.env.ELDORADO_ACCOUNT_ID;
  const r = await fn.handle(d);
  assert.equal(r.error, "not configured");
});
