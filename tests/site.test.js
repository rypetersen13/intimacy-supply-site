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

test("wishlist buttons quote product ids and Klaviyo phones are normalized", { skip: !haveSite }, () => {
  const js = fs.readdirSync(path.join(root, "assets")).filter(f => /^app\..*\.js$/.test(f)).map(f => read("assets/" + f)).join("\n");
  assert.ok(!/removeWL\(\$\{id\}\)/.test(js) && !/addToCart\(\$\{id\}\);closeWL/.test(js), "wishlist buttons pass an unquoted product id");
  assert.ok(/function klaviyoPhone/.test(js) && /phone_number = ph/.test(js));
});

test("guests can browse and fill a bag; the account step happens at checkout", { skip: !haveSite }, () => {
  const js = fs.readdirSync(path.join(root, "assets")).filter(f => /^app\..*\.js$/.test(f)).map(f => read("assets/" + f)).join("\n");
  assert.ok(!/openQuiz\('product_click'\)/.test(js) && !/openQuiz\('add_to_cart_gate'\)/.test(js), "guests are still blocked from products or the bag");
  assert.ok(/function openAccountGate/.test(js) && /function resumeAfterAuth/.test(js));
  assert.ok(!/UNLOCK VIP PRICING|Claim Your VIP Discount|VIP Membership Active/.test(js), "sign-up screens still claim VIP for a free account");
  assert.ok(!/function startVIPCountdown\(\)\{\s*const/.test(js), "the fake countdown timer is back");
  assert.ok(/id="start-here"/.test(read("index.html")) && /id="fs-pill"/.test(read("index.html")));
});

test("return wording is the same everywhere: full refund for unopened items, no store-credit-only language", () => {
  for (const f of ["shipping-returns/index.html", "refund-policy/index.html", "terms/index.html", "faq/index.html"]) {
    const s = read(f);
    assert.ok(!/store credit|member credit/i.test(s), f + " still mentions store or member credit");
  }
  assert.ok(/full refund to your original payment method/.test(read("shipping-returns/index.html")));
  assert.ok(/9\.95/.test(read("shipping-returns/index.html")) && !/\$5\.95/.test(read("shipping-returns/index.html")));
});

test("return shipping is paid by the customer unless the item is defective, on every policy page", () => {
  for (const f of ["shipping-returns/index.html", "refund-policy/index.html", "terms/index.html", "faq/index.html"]) {
    assert.ok(/return shipping is paid by (the customer|you)/i.test(read(f)), f + " does not say who pays return shipping");
  }
});

test("top spacing comes from the real header height (no hard-coded 56px that hides the hero)", { skip: !haveSite }, () => {
  const js = fs.readdirSync(path.join(root, "assets")).filter(f => /^app\..*\.js$/.test(f)).map(f => read("assets/" + f)).join("\n");
  assert.ok(!/paddingTop\s*=\s*'56px'/.test(js) && !/paddingTop\s*=\s*\(56 \+/.test(js), "the page offset is hard-coded again");
  assert.ok(/function showVIPBanner\(\)\{[^}]*syncHeaderOffset\(\)/.test(js));
});
