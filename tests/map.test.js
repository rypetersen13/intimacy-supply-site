const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const mapFile = path.join(root, "tools", "source", "map_prices.json");
const catFile = path.join(root, "products.json");

test("MAP price list is present and large", () => {
  const map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
  assert.ok(Object.keys(map).length > 4000);
  for (const [k, v] of Object.entries(map)) assert.ok(v > 0 && v < 5000, "odd MAP price for " + k);
});

test("no item is priced below its Eldorado MAP price, regular or VIP", { skip: !fs.existsSync(catFile) }, () => {
  const map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
  const cat = JSON.parse(fs.readFileSync(catFile, "utf8"));
  let checked = 0;
  for (const p of cat) {
    const m = map[String(p.model).trim().toUpperCase()];
    if (!m) continue;
    checked++;
    assert.ok(Number(p.price) >= m - 0.005, p.model + " VIP price " + p.price + " is below MAP " + m);
    assert.ok(Number(p.orig) >= m - 0.005, p.model + " regular price " + p.orig + " is below MAP " + m);
  }
  assert.ok(checked > 1500, "expected to check the items that have a MAP price, checked " + checked);
});

test("VIP price is never above the regular price", { skip: !fs.existsSync(catFile) }, () => {
  const cat = JSON.parse(fs.readFileSync(catFile, "utf8"));
  for (const p of cat) assert.ok(Number(p.price) <= Number(p.orig) + 0.005, p.model + " has a VIP price above its regular price");
});
