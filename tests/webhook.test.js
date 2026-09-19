const test = require("node:test");
const assert = require("node:assert/strict");
const { _test } = require("../netlify/functions/ccbill-webhook");

test("charged amount is read from the CCBill fields in priority order", () => {
  assert.equal(_test.chargedAmount({ billedInitialPrice: "24.99", price: "1" }), 24.99);
  assert.equal(_test.chargedAmount({ accountingInitialPrice: "$31.50" }), 31.5);
  assert.equal(_test.chargedAmount({ price: "5" }), 5);
  assert.equal(_test.chargedAmount({}), null);
});

test("amount check: ok, underpaid, or unverifiable", () => {
  assert.equal(_test.checkAmount({ expectedTotal: 34.9 }, { billedInitialPrice: "34.90" }).status, "ok");
  assert.equal(_test.checkAmount({ expectedTotal: 34.9 }, { billedInitialPrice: "34.89" }).status, "ok");     // one cent of rounding slack
  assert.equal(_test.checkAmount({ expectedTotal: 34.9 }, { billedInitialPrice: "2.95" }).status, "underpaid");
  assert.equal(_test.checkAmount({ expectedTotal: 34.9 }, { billedInitialPrice: "40" }).status, "ok");        // paying more is not an under-payment
  assert.equal(_test.checkAmount({}, { billedInitialPrice: "10" }).status, "unverified");                     // older order without expectedTotal
  assert.equal(_test.checkAmount({ expectedTotal: 10 }, {}).status, "unverified");
});
