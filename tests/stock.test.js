const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { parseFeed, computeOos, mapReport, guardCheck } = require("../netlify/functions/_lib/stock");

const HEADER = ["PRODUCTS_MODEL", "PRODUCTS_NAME", "PRODUCTS_QUANTITY", "discontinued", "closeout", "map_price"].join("\t");
const feedText = [HEADER,
  "A1\tIn stock\t12\tNo\tNo\t10.00",
  "B2\tSold out\t0\tNo\tNo\t",
  "C3\tDiscontinued\t50\tYes\tNo\t20.00",
  "D4\tLow\t1\tNo\tYes\t5.00",
  "bad line",
].join("\n");

test("parseFeed reads models, quantity, discontinued, closeout and MAP; skips bad lines", () => {
  const f = parseFeed(feedText);
  assert.equal(f.size, 4);
  assert.deepEqual(f.get("A1"), { qty: 12, discontinued: false, closeout: false, map: 10 });
  assert.equal(f.get("C3").discontinued, true);
  assert.equal(f.get("D4").closeout, true);
  assert.equal(f.get("B2").map, null);
});

test("parseFeed refuses a file without the expected columns", () => {
  assert.throws(() => parseFeed("foo\tbar\n1\t2"), /PRODUCTS_MODEL/);
  assert.throws(() => parseFeed(""), /PRODUCTS_MODEL/);
});

test("computeOos marks missing, discontinued and zero-quantity models only", () => {
  const f = parseFeed(feedText);
  assert.deepEqual(computeOos(f, ["A1", "B2", "C3", "D4", "NOT_IN_FEED"]), ["B2", "C3", "NOT_IN_FEED"]);
});

test("mapReport lists items whose VIP price is under the minimum advertised price", () => {
  const f = parseFeed(feedText);
  const r = mapReport(f, [{ model: "A1", price: 8 }, { model: "D4", price: 5 }, { model: "C3", price: 19.99 }]);
  assert.deepEqual(r.map(x => x.model), ["A1", "C3"]);
});

test("guard blocks truncated feeds and sudden jumps", () => {
  assert.equal(guardCheck({ feedRows: 100, catalogSize: 8000, oosCount: 10 }).ok, false);
  assert.equal(guardCheck({ feedRows: 16000, catalogSize: 8000, oosCount: 5000 }).ok, false);
  assert.equal(guardCheck({ feedRows: 16000, catalogSize: 8000, oosCount: 2500, previousOosCount: 300 }).ok, false);
  assert.equal(guardCheck({ feedRows: 16000, catalogSize: 8000, oosCount: 400, previousOosCount: 300 }).ok, true);
  assert.equal(guardCheck({ feedRows: 16000, catalogSize: 8000, oosCount: 400, previousOosCount: null }).ok, true);
});
