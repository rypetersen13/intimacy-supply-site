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

test("every item forced up to its MAP price shows a flat 40% VIP discount (regular = MAP / 0.60)", { skip: !fs.existsSync(catFile) }, () => {
  const map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
  const cat = JSON.parse(fs.readFileSync(catFile, "utf8"));
  let checkedAt40 = 0;
  for (const p of cat) {
    const m = map[String(p.model).trim().toUpperCase()];
    if (!m) continue;
    if (Math.abs(Number(p.price) - m) < 0.01 && Number(p.orig) - Number(p.price) > 0.5) {
      // this item's VIP price sits at the MAP floor and has a real discount applied -> regular price
      // must be at least MAP / 0.60 (a handful of unrelated items have zero natural discount and
      // happen to already sit at MAP with no markup at all; those are compliant but not part of this rule)
      const minOrig = Math.round((m / 0.60) * 100) / 100 - 0.02;
      assert.ok(Number(p.orig) >= minOrig, p.model + " regular price " + p.orig + " is below the 40%-implied floor (" + minOrig + ")");
      checkedAt40++;
    }
  }
  assert.ok(checkedAt40 > 1000, "expected over 1000 items sitting at the MAP floor, found " + checkedAt40);
});

test("the site's \"up to 40%\" claim is real: the highest VIP discount anywhere is exactly 40%, never more", { skip: !fs.existsSync(catFile) }, () => {
  const cat = JSON.parse(fs.readFileSync(catFile, "utf8"));
  let max = 0, at40 = 0;
  for (const p of cat) {
    if (Number(p.orig) <= 0) continue;
    const d = 1 - Number(p.price) / Number(p.orig);
    if (d > max) max = d;
    if (Math.abs(d - 0.40) < 0.002) at40++;
  }
  assert.ok(max <= 0.401, "some item exceeds the advertised 40% ceiling: " + (max * 100).toFixed(1) + "%");
  assert.ok(at40 > 1000, "\"up to 40%\" would be false — only " + at40 + " items actually reach it");
});
