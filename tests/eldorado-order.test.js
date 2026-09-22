const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOrderXml, validateOrder, parseShipmentConfirmations } = require("../netlify/functions/_lib/eldorado-order");

const order = (o = {}) => ({
  orderId: "IS-20260921-1001",
  delivery: "standard",
  customer: { firstName: "Ann", lastName: "Lee", address: "123 Main St", address2: "Apt 4", city: "Neenah", state: "WI", zip: "54956", country: "United States", phone: "(920) 570-9365" },
  items: [{ productId: "VI-A0201", qty: 1 }, { productId: "EN-RD-2734", qty: 2 }],
  ...o,
});

test("builds a valid Eldorado order XML with all required fields", () => {
  process.env.ELDORADO_ACCOUNT_ID = "50164PF";
  const { fileName, xml } = buildOrderXml(order());
  assert.equal(fileName, "IS-20260921-1001.xml");
  assert.match(xml, /<AccountId>50164PF<\/AccountId>/);
  assert.match(xml, /<Name>Ann Lee<\/Name>/);
  assert.match(xml, /<AddressLine1>123 Main St<\/AddressLine1>/);
  assert.match(xml, /<AddressLine2>Apt 4<\/AddressLine2>/);
  assert.match(xml, /<StateCode>WI<\/StateCode>/);
  assert.match(xml, /<CountryCode>USA<\/CountryCode>/);
  assert.match(xml, /<PhoneNumber>9205709365<\/PhoneNumber>/);          // digits only, punctuation stripped
  assert.match(xml, /<ShipVia>B2CBR<\/ShipVia>/);
  assert.match(xml, /<SourceOrderNumber>IS-20260921-1001<\/SourceOrderNumber>/);
  assert.match(xml, /<Code>VI-A0201<\/Code><Quantity>1<\/Quantity>/);
  assert.match(xml, /<Code>EN-RD-2734<\/Code><Quantity>2<\/Quantity>/);
});

test("expedited delivery maps to FOR (FedEx One Rate)", () => {
  const { xml } = buildOrderXml(order({ delivery: "expedited" }));
  assert.match(xml, /<ShipVia>FOR<\/ShipVia>/);
});

test("special characters in the name/address are escaped, not broken", () => {
  const { xml } = buildOrderXml(order({ customer: { ...order().customer, firstName: "A&B", address: "12 O'Brien <St>" } }));
  assert.match(xml, /A&amp;B/);
  assert.match(xml, /O&apos;Brien &lt;St&gt;/);
});

test("refuses to build an order that is missing required fields", () => {
  assert.throws(() => validateOrder(order({ customer: { ...order().customer, address: "" } })), /address line 1/);
  assert.throws(() => validateOrder(order({ customer: { ...order().customer, phone: "12" } })), /phone/);
  assert.throws(() => validateOrder(order({ items: [] })), /items/);
  assert.throws(() => validateOrder(order({ items: [{ productId: "", qty: 1 }] })), /product code/);
});

test("parses shipment confirmation XML and matches by our order number", () => {
  const xml = `<?xml version="1.0"?><XML_Orders><Orders>
    <response_code>RECORD</response_code>
    <web_order_number>#98765</web_order_number>
    <supplier_order_number>IS-20260921-1001</supplier_order_number>
    <tracking_number>9400111899223456789012</tracking_number>
    <carrier>USPS Priority Mail</carrier>
    <order_date>2026-09-21 14:00:00</order_date>
  </Orders></XML_Orders>`;
  const out = parseShipmentConfirmations(xml);
  assert.equal(out.length, 1);
  assert.equal(out[0].orderId, "IS-20260921-1001");
  assert.equal(out[0].trackingNumber, "9400111899223456789012");
  assert.equal(out[0].carrier, "USPS Priority Mail");
});

test("ignores confirmation blocks with no tracking number yet", () => {
  const xml = `<Orders><supplier_order_number>IS-1</supplier_order_number></Orders>`;
  assert.equal(parseShipmentConfirmations(xml).length, 0);
});
