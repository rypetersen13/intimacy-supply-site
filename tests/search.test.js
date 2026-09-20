const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const S = require("../tools/src/search-core.js");

const small = [
  { name: "Evolved 7\" Girthy Vibrating Dong - Light", brand: "Evolved", cat: "toys", f: 1 },
  { name: "Ouch! 7\" Curvy G-Spot Dildo - Metallic Purple", brand: "Shots Ouch", cat: "toys", f: 2 },
  { name: "Master Series Bull Chastity Cage", brand: "Master Series", cat: "couples", f: 3 },
  { name: "Rock Bottom Tap Beaded Anal Probe - Black", brand: "Rock Bottom", cat: "anal", f: 4 },
  { name: "Floral Embroidered Teddy with Underwire Cup Garters", brand: "Mapale", cat: "lingerie", f: 5 },
  { name: "Silicone Butt Plug Kit", brand: "VeDO", cat: "anal", f: 6 },
  { name: "Water Based Lubricant 4 oz", brand: "Escante", cat: "wellness", f: 7 },
  { name: "Leather Handcuffs", brand: "Spartacus", cat: "couples", f: 8 },
];
const idx = new S.Index(small);
const names = r => r.results.map(p => p.name);

test("plurals, word order and partial words work", () => {
  assert.ok(names(idx.search("dildos"))[0].includes("Dildo"));
  assert.ok(names(idx.search("plugs")).some(n => n.includes("Butt Plug")));
  assert.ok(names(idx.search("plug butt"))[0].includes("Butt Plug"));
  assert.ok(names(idx.search("chast"))[0].includes("Chastity"));
  assert.equal(idx.search("purple dildo").results.length, 1);
});

test("synonyms map what people type to what products say", () => {
  assert.ok(names(idx.search("vibe"))[0].includes("Vibrating"));
  assert.ok(names(idx.search("lube"))[0].includes("Lubricant"));
  assert.ok(names(idx.search("cuffs"))[0].includes("Handcuffs"));
  assert.ok(names(idx.search("cage"))[0].includes("Chastity"));
  assert.ok(names(idx.search("lingerie"))[0].includes("Teddy"));
});

test("typos are corrected and reported", () => {
  const r = idx.search("vibrater");
  assert.equal(r.corrected, true);
  assert.ok(r.results[0].name.includes("Vibrating"));
  assert.equal(idx.search("chastety cage").corrected, true);
  assert.equal(idx.search("dildoo").corrected, true);
  assert.equal(idx.search("lubricent").corrected, true);
});

test("nonsense returns nothing and never throws", () => {
  assert.equal(idx.search("zzzzqqq").results.length, 0);
  assert.equal(idx.search("").results.length, 0);
  assert.equal(idx.search("   ").results.length, 0);
  assert.equal(idx.search("<script>alert(1)</script>").results.length, 0);
});

test("brand words match, and the featured rank breaks ties", () => {
  assert.equal(idx.search("mapale")[0]?.name, undefined);   // .results, not array
  assert.ok(names(idx.search("mapale"))[0].includes("Teddy"));
  const two = new S.Index([{ name: "Plug B", brand: "X", cat: "anal", f: 9 }, { name: "Plug A", brand: "X", cat: "anal", f: 1 }]);
  assert.equal(two.search("plug").results[0].name, "Plug A");
});

test("on the real catalog: common searches return results and typos are fixed", { skip: !fs.existsSync(path.join(__dirname, "..", "products.json")) }, () => {
  const cat = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "products.json"), "utf8")).map(p => ({ name: p.name, brand: p.brand, cat: p.cat, f: p.f, id: p.model }));
  const real = new S.Index(cat);
  for (const q of ["dildos", "vibrators", "butt plug", "chastity cage", "cock ring", "strap on", "lube", "lingerie", "handcuffs", "nipple clamps", "wand", "teddy"]) {
    assert.ok(real.search(q).results.length > 0, "no results for " + q);
  }
  for (const q of ["vibrater", "dildoo", "lingere", "chastety"]) {
    const r = real.search(q);
    assert.ok(r.results.length > 0 && r.corrected, "typo not fixed: " + q);
  }
  assert.ok(real.search("handcufs").results.length > 0);
  const t0 = Date.now(); real.search("vibrater"); assert.ok(Date.now() - t0 < 1500, "typo search is too slow");
});
