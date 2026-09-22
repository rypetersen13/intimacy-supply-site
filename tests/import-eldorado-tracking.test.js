const test = require("node:test");
const assert = require("node:assert/strict");
const fn = require("../netlify/functions/import-eldorado-tracking");

const CONF_XML = orderId => `<Orders><supplier_order_number>${orderId}</supplier_order_number><tracking_number>9400111899223456789012</tracking_number><carrier>USPS Priority Mail</carrier></Orders>`;

function deps(live, files, ordersDb) {
  const patches = [];
  return {
    env: { ELDORADO_SFTP_HOST: "h", ELDORADO_SFTP_USER: "u", ELDORADO_SFTP_PASS: "p", ELDORADO_ORDERS_LIVE: live ? "1" : "0" },
    listAndRead: async () => files,
    fs: { getDoc: async path => ordersDb[path.replace("orders/", "")], patchDoc: async (path, fields) => patches.push([path, fields]) },
    _patches: patches,
  };
}

test("dry run reports matches but writes nothing", async () => {
  const d = deps(false, [{ name: "a.xml", text: CONF_XML("IS-1") }], { "IS-1": { status: "ordered" } });
  const r = await fn.handle(d);
  assert.deepEqual(r, { updated: 0, seen: 1 });
  assert.equal(d._patches.length, 0);
});

test("live run marks the matching order shipped with tracking", async () => {
  const d = deps(true, [{ name: "a.xml", text: CONF_XML("IS-1") }], { "IS-1": { status: "ordered" } });
  const r = await fn.handle(d);
  assert.equal(r.updated, 1);
  assert.equal(d._patches[0][0], "orders/IS-1");
  assert.equal(d._patches[0][1].status, "shipped");
  assert.equal(d._patches[0][1].trackingNumber, "9400111899223456789012");
  assert.equal(d._patches[0][1].carrier, "USPS Priority Mail");
});

test("an order already shipped, or with no matching order, is left alone", async () => {
  const d = deps(true, [{ name: "a.xml", text: CONF_XML("IS-1") }, { name: "b.xml", text: CONF_XML("IS-MISSING") }], { "IS-1": { status: "shipped", trackingNumber: "old" } });
  const r = await fn.handle(d);
  assert.equal(r.updated, 0);
  assert.equal(d._patches.length, 0);
});

test("confirmations with no tracking number are ignored", async () => {
  const d = deps(true, [{ name: "a.xml", text: "<Orders><supplier_order_number>IS-1</supplier_order_number></Orders>" }], { "IS-1": { status: "ordered" } });
  const r = await fn.handle(d);
  assert.equal(r.seen, 0);
});

test("sends a discreet tracking email (no product names) when Resend is configured", async () => {
  const sent = [];
  const d = deps(true, [{ name: "a.xml", text: CONF_XML("IS-1") }], { "IS-1": { status: "ordered", userEmail: "a@b.co", customer: { firstName: "Ann" } } });
  d.sendTrackingEmail = async (order) => { sent.push(order); };
  const r = await fn.handle(d);
  assert.equal(r.updated, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].orderId, "IS-1");
  assert.equal(sent[0].trackingNumber, "9400111899223456789012");
});

test("sendTrackingEmail itself sends via Resend, discreetly, and no-ops without config", async () => {
  const mod = require("../netlify/functions/import-eldorado-tracking");
  const calls = [];
  const fakeFetch = async (u, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200 }; };
  await mod._sendTrackingEmail({ orderId: "IS-9", trackingNumber: "T1", carrier: "UPS", userEmail: "c@d.co", customer: { firstName: "Sam" } },
    { fetch: fakeFetch, env: { RESEND_API_KEY: "k", REVIEW_FROM_EMAIL: "Shop <orders@example.com>" } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].to[0], "c@d.co");
  assert.ok(!/vibrat|dildo|lingerie|toy|plug/i.test(calls[0].text));
  const calls2 = [];
  await mod._sendTrackingEmail({ orderId: "IS-9", userEmail: "c@d.co" }, { fetch: async (u, i) => { calls2.push(1); return { ok: true }; }, env: {} });
  assert.equal(calls2.length, 0);
});
