// Checks on the built storefront and generated data. Runs in CI on every push.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const exists = p => fs.existsSync(path.join(root, p));
const haveSite = exists("index.html");

test("index.html and every script it loads parse", { skip: !haveSite }, () => {
  const html = read("index.html");
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(inline.length > 0);
  inline.forEach(js => new vm.Script(js));
  const srcs = [...html.matchAll(/<script[^>]+src="(\/assets\/[^"]+)"/g)].map(m => m[1]);
  srcs.forEach(s => { assert.ok(exists(s.slice(1)), "missing " + s); new vm.Script(read(s.slice(1))); });
  const css = [...html.matchAll(/<link[^>]+href="(\/assets\/[^"]+\.css)"/g)].map(m => m[1]);
  css.forEach(c => assert.ok(exists(c.slice(1)), "missing " + c));
});

test("catalog data is valid", { skip: !exists("products.json") }, () => {
  const list = JSON.parse(read("products.json"));
  assert.ok(list.length > 5000);
  const ids = new Set();
  for (const p of list) {
    assert.ok(p.model && p.name && p.cat, "missing field on " + JSON.stringify(p).slice(0, 80));
    assert.ok(p.price > 0 && p.orig >= p.price, "bad price on " + p.model);
    assert.ok(!ids.has(p.model), "duplicate model " + p.model);
    ids.add(p.model);
  }
});

test("sitemap URLs point at real pages (sample)", { skip: !exists("sitemap.xml") }, () => {
  const urls = [...read("sitemap.xml").matchAll(/<loc>https:\/\/intimacysupply\.com([^<]*)<\/loc>/g)].map(m => m[1]);
  assert.ok(urls.length > 100);
  const step = Math.max(1, Math.floor(urls.length / 300));
  for (let i = 0; i < urls.length; i += step) {
    const u = urls[i];
    const file = u.endsWith("/") ? u.slice(1) + "index.html" : u.slice(1);
    assert.ok(exists(file || "index.html"), "sitemap points to a missing page: " + u);
  }
});

test("no secrets or third-party brand names in served files", { skip: !haveSite }, () => {
  const bad = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /ghp_[A-Za-z0-9]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/, /sk_live_[A-Za-z0-9]+/, /re_[A-Za-z0-9]{24,}/];
  const files = ["index.html", ...fs.readdirSync(path.join(root, "assets")).map(f => "assets/" + f)].filter(exists);
  for (const f of files) {
    const s = read(f);
    bad.forEach(rx => assert.ok(!rx.test(s), f + " contains something that looks like a secret"));
    assert.ok(!/fabletics/i.test(s), f + " mentions another retailer");
  }
});

test("payment pages send a signed-in token, never a bare userId", { skip: !haveSite }, () => {
  const all = ["index.html", ...fs.readdirSync(path.join(root, "assets")).filter(f => f.endsWith(".js")).map(f => "assets/" + f)].map(read).join("\n");
  assert.ok(/getIdTokenPromise\(\)/.test(all));
  assert.ok(/idToken:\s+idToken/.test(all));
});

test("featured order leads with what shoppers buy, spread across brands", { skip: !exists("products.json") }, () => {
  const list = JSON.parse(read("products.json")).sort((a, b) => a.f - b.f);
  const seen = new Set(), top = [];
  for (const p of list) { if (seen.has(p.s)) continue; seen.add(p.s); top.push(p); if (top.length === 60) break; }
  const hidden = /\bbooks?\b|\bgames?\b|batter|cleaner|\boils?\b|candle|gift card/i;
  assert.ok(top.every(p => !hidden.test(p.name)), "books, games, oils or cleaners are in the first 60");
  assert.ok(new Set(top.map(p => p.brand.toLowerCase())).size >= 15, "first 60 come from too few brands");
  const has = rx => top.filter(p => rx.test(p.name)).length;
  assert.ok(has(/vibrat|rabbit|wand|bullet/i) >= 4 && has(/dildo|dong/i) >= 4 && has(/teddy|babydoll|chemise|bodysuit|corset|bustier|set/i) >= 4);
});

test("partner pages carry no invented claims and the dashboard never reads Firestore directly", { skip: !exists("partners.html") }, () => {
  const pages = ["partners.html", "creator.html", "dashboard.html"].map(read).join("\n");
  for (const bad of [/50K\+/, /5M\b/, /\$69\.95/, /\$3\.50/, /Sarah M\./, /picsum\.photos/, /legal\?type/, /Real Members/]) assert.ok(!bad.test(pages), "found: " + bad);
  const dash = read("dashboard.html");
  assert.ok(!/collection\(/.test(dash) && !/accessCode/.test(dash), "dashboard reads data or codes directly");
  assert.ok(/\/\.netlify\/functions\/affiliate/.test(dash));
  assert.ok(/\$25/.test(read("partners.html")) && !/\$50 minimum/.test(read("partners.html")));
});

test("function handlers take at most two arguments (Node 24 rejects callback-style handlers)", () => {
  const dir = path.join(root, "netlify", "functions");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
  assert.ok(files.length >= 8);
  for (const f of files) {
    const mod = require(path.join(dir, f));
    assert.equal(typeof mod.handler, "function", f + " has no handler");
    assert.ok(mod.handler.length <= 2, f + " handler takes " + mod.handler.length + " arguments");
  }
});
