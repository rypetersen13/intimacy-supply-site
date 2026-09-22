"use strict";
// Builds and validates an Eldorado XML order file from one of our orders, per their
// Customer Integration Partner Portal spec (May 2026): one <Order> per XML document,
// AccountId, Name (<=50 chars), AddressLine1/2, City, StateCode, ZipCode, CountryCode,
// PhoneNumber (digits only, <=20), ShipVia, SpecialInstructions (<=254), SourceOrderNumber,
// signatureRequired, and one <Product><Code>/<Quantity></Product> per line item.

const SHIP_VIA = { standard: "B2CBR", expedited: "FOR" };  // B2CBR = their "best rate" default; FOR = FedEx One Rate, 2 business day guarantee

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function clip(s, n) { return String(s == null ? "" : s).slice(0, n); }
function digits(s, n) { return String(s == null ? "" : s).replace(/\D/g, "").slice(0, n); }

// Throws with a clear reason if the order is missing something Eldorado requires.
function validateOrder(order) {
  const c = order.customer || {};
  const missing = [];
  if (!c.firstName && !c.lastName) missing.push("customer name");
  if (!c.address) missing.push("address line 1");
  if (!c.city) missing.push("city");
  if (!c.state) missing.push("state");
  if (!c.zip) missing.push("zip");
  if (digits(c.phone, 20).length < 7) missing.push("phone number");
  if (!Array.isArray(order.items) || order.items.length === 0) missing.push("items");
  else for (const it of order.items) {
    if (!it.productId) missing.push("a product code on an item");
    if (!it.qty || it.qty < 1) missing.push("a quantity on an item");
  }
  if (missing.length) throw new Error("order " + (order.orderId || "?") + " is missing: " + missing.join(", "));
}

function buildOrderXml(order) {
  validateOrder(order);
  const c = order.customer || {};
  const name = clip([c.firstName, c.lastName].filter(Boolean).join(" ").trim(), 50);
  const shipVia = SHIP_VIA[order.delivery] || SHIP_VIA.standard;
  const country = clip((c.country || "USA").replace(/^united states$/i, "USA").replace(/^u\.?s\.?a?\.?$/i, "USA"), 3) || "USA";
  const state = clip(String(c.state || "").toUpperCase(), 3);
  const products = order.items.map(it =>
    "<Product><Code>" + esc(it.productId) + "</Code><Quantity>" + Math.max(1, parseInt(it.qty, 10) || 1) + "</Quantity></Product>"
  ).join("");
  const special = clip(order.adminNote || "", 254);

  const xml = "<?xml version=\"1.0\"?>\n<Order>" +
    "<AccountId>" + esc(process.env.ELDORADO_ACCOUNT_ID || "") + "</AccountId>" +
    "<Name>" + esc(name) + "</Name>" +
    "<AddressLine1>" + esc(clip(c.address, 100)) + "</AddressLine1>" +
    "<AddressLine2>" + esc(clip(c.address2 || "", 100)) + "</AddressLine2>" +
    "<City>" + esc(clip(c.city, 100)) + "</City>" +
    "<StateCode>" + esc(state) + "</StateCode>" +
    "<ZipCode>" + esc(clip(c.zip, 20)) + "</ZipCode>" +
    "<CountryCode>" + esc(country) + "</CountryCode>" +
    "<PhoneNumber>" + esc(digits(c.phone, 20)) + "</PhoneNumber>" +
    "<ShipVia>" + esc(shipVia) + "</ShipVia>" +
    "<SpecialInstructions>" + esc(special) + "</SpecialInstructions>" +
    "<SourceOrderNumber>" + esc(order.orderId) + "</SourceOrderNumber>" +
    "<signatureRequired>N</signatureRequired>" +
    "<Products>" + products + "</Products>" +
    "</Order>";

  // The doc requires each order's file name to be unique, and encourages including the order # or a timestamp.
  const fileName = String(order.orderId).replace(/[^A-Za-z0-9\-]/g, "") + ".xml";
  return { fileName, xml };
}

// Parses one <Orders> block from a shipment-confirmation XML file (their format, per the doc's example).
function parseShipmentConfirmations(xmlText) {
  const out = [];
  const blocks = String(xmlText || "").match(/<Orders>[\s\S]*?<\/Orders>/g) || [];
  const field = (block, tag) => { const m = block.match(new RegExp("<" + tag + ">([\\s\\S]*?)<\\/" + tag + ">")); return m ? m[1].trim() : ""; };
  for (const b of blocks) {
    const sourceOrderNumber = field(b, "supplier_order_number") || field(b, "source_order_number");
    const tracking = field(b, "tracking_number");
    const carrier = field(b, "carrier");
    const shipDate = field(b, "order_date") || field(b, "ship_date");
    if (!sourceOrderNumber || !tracking) continue;   // not enough to act on
    out.push({ orderId: sourceOrderNumber, trackingNumber: tracking, carrier: carrier || "", shipDate: shipDate || "" });
  }
  return out;
}

module.exports = { buildOrderXml, validateOrder, parseShipmentConfirmations, SHIP_VIA };
