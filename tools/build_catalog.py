#!/usr/bin/env python3
"""Build the lean catalog, lazy description chunks, one page per product (sizes/colors grouped as options),
every category page and the sitemap. Requires node (only to reuse the shop's own grouping code in tools/basename.js).

Usage:  python3 tools/build_catalog.py            (writes into the repo root)
Source of truth: tools/source/products.raw.json (never served to shoppers by the app).
Python 3.8+, standard library only.
"""
import json, os, re, html, math, shutil, subprocess, sys, unicodedata

MAP_PRICES = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "source", "map_prices.json")))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "tools", "source", "products.raw.json")
OUT = sys.argv[1] if len(sys.argv) > 1 else ROOT
SITE = "https://intimacysupply.com"
PER_PAGE = 48
CHUNK = 100

CATS = {
    "lingerie": ("Lingerie", "Lingerie, babydolls, teddies and more at up to 34% off with VIP membership."),
    "toys": ("Vibrators & Toys", "Vibrators, massagers and toys at up to 34% off with VIP membership."),
    "couples": ("Couples", "Products for couples and partner play at up to 34% off with VIP membership."),
    "anal": ("Anal", "Plugs, trainers and anal play essentials at up to 34% off with VIP membership."),
    "wellness": ("Wellness", "Lubricants, care and wellness essentials at up to 34% off with VIP membership."),
}

# ---------- cleaning ----------
def clean_name(n):
    n = html.unescape(n or "")
    n = re.sub(r"\bw/\s*", "with ", n)
    n = re.sub(r"\s+&\s+", " & ", n)
    n = re.sub(r"\s{2,}", " ", n).strip(" -")
    return n

DROP_SENT = re.compile(r"(wholesale|\bMSRP\b|Item\s*#|\bSKU\b|\bUPC\b|package price|special offer)", re.I)
def clean_desc(s):
    s = html.unescape(s or "")
    s = re.sub(r"[\r\n\t]+", " ", s)
    # glued sentences: "...nerves.LANKYZ" -> "...nerves. LANKYZ"
    s = re.sub(r"(?<=[a-z0-9\)])([.!?])(?=[A-Z][a-z])", r"\1 ", s)
    s = re.sub(r"\s{2,}", " ", s).strip()
    parts = re.split(r"(?<=[.!?])\s+", s)
    parts = [p for p in parts if not DROP_SENT.search(p)]
    s = " ".join(parts)
    # long ALL-CAPS runs -> sentence case
    def fix_caps(m):
        words = m.group(0).lower().split()
        return " ".join(words).capitalize()
    s = re.sub(r"\b(?:[A-Z]{3,}[A-Z0-9'&-]*\s+){3,}[A-Z]{3,}[A-Z0-9'&-]*\b", fix_caps, s)
    return s.strip()

def slugify(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t.lower()).strip("-")
    return t[:90].strip("-")

def money(x): return "${:,.2f}".format(x)

# ---------- load ----------
raw = json.load(open(SRC, encoding="utf-8"))
products, used = [], set()
for i, r in enumerate(raw):
    name = clean_name(r["name"])
    price = round(float(r["price"]), 2)
    orig = round(float(r["orig"]), 2)
    _disc = max(0.0, min(0.34, (orig - price) / orig)) if orig > 0 else 0.0   # this item's natural VIP discount, capped at the "up to 34%" ceiling
    if orig <= price:           # bad data: regular price below member price -> no discount shown
        orig = price
    # Eldorado MAP (minimum advertised price): neither price may go below it. The VIP price sits AT the
    # MAP floor, and the regular price is set above it so the item's usual VIP discount still applies —
    # MAP only limits the lowest price shown, not how large a discount can be advertised above it.
    # Source: tools/source/map_prices.json (parsed from Eldorado's "MAP and Shipping Restrictions 2026").
    _map = MAP_PRICES.get(str(r["model"]).strip().upper())
    if _map and price < _map - 0.005:
        price = _map
        orig = round(_map / (1 - (_disc if _disc > 0.01 else 0.30)), 2)
    elif _map and orig < _map - 0.005:
        orig = _map
    slug = slugify(name) + "-" + slugify(str(r["model"]))
    base, n = slug, 2
    while slug in used: slug = "%s-%d" % (base, n); n += 1
    used.add(slug)
    products.append(dict(
        model=str(r["model"]), name=name, cat=r["cat"], price=price, orig=orig,
        image=r["image"], brand=(r.get("brand") or "").strip(), desc=clean_desc(r["desc"]),
        material=(r.get("material") or "").strip(), inStock=r.get("inStock") is not False,
        isNew=bool(r.get("isNew")), rating=r.get("rating") or 0, reviews=r.get("reviews") or 0,
        slug=slug, b=i // CHUNK))

def w(path, text):
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f: f.write(text)


# ---------- 1) group sizes/colors into products, exactly like the shop does ----------
bases = json.loads(subprocess.run(["node", os.path.join(ROOT, "tools", "basename.js")],
                                  input=json.dumps([p["name"] for p in products]),
                                  stdout=subprocess.PIPE, universal_newlines=True, check=True).stdout)
groups, order = {}, []
for p, base in zip(products, bases):
    gk = (base, p["brand"].lower(), p["cat"])
    if gk not in groups:
        groups[gk] = {"name": base, "brand": p["brand"], "cat": p["cat"], "variants": []}
        order.append(gk)
    label = re.sub(r"^[-\s]+", "", p["name"].replace(base, "", 1).strip()).strip()
    p["label"] = label or "Default"
    groups[gk]["variants"].append(p)
glist, gslugs = [], set()
for gk in order:
    g = groups[gk]; vs = g["variants"]
    rep = next((v for v in vs if v["inStock"]), vs[0])
    g["rep"] = rep
    slug = slugify(g["name"]) + "-" + slugify(rep["model"])
    base_slug, n = slug, 2
    while slug in gslugs: slug = "%s-%d" % (base_slug, n); n += 1
    gslugs.add(slug); g["slug"] = slug
    imgs = []
    for v in sorted(vs, key=lambda v: not v["inStock"]):
        if v["image"] not in imgs: imgs.append(v["image"])
    g["images"] = imgs[:8]
    g["desc"] = rep["desc"] or next((v["desc"] for v in vs if v["desc"]), "")
    g["material"] = rep["material"] or next((v["material"] for v in vs if v["material"]), "")
    g["price"], g["orig"] = rep["price"], rep["orig"]
    g["inStock"] = any(v["inStock"] for v in vs)
    for v in vs: v["s"] = slug
    glist.append(g)


# ---------- featured ordering ----------
# The default "Featured" order shows what shoppers actually buy first: vibrators, outfits for women,
# dildos, butt plugs and chastity cages, mixed together and spread across brands, with books,
# games, oils, cleaners and similar items at the back.
FEAT_TYPES = [
    ("vibrator", re.compile(r"vibrat|rabbit|\bwand\b|bullet|clitoral|g-?spot|massager", re.I)),
    ("dildo",    re.compile(r"dildo|\bdong\b|realistic", re.I)),
    ("plug",     re.compile(r"\bplug\b", re.I)),
    ("cage",     re.compile(r"chastity|\bcage\b", re.I)),
]
FEAT_TIER2 = re.compile(r"strap-?on|harness|cock ?ring|c-?ring|stroker|masturbat|pocket pussy|prostate|nipple|restraint|cuff|paddle|ben wa|kegel", re.I)
FEAT_HIDE = re.compile(r"\bbooks?\b|\bgames?\b|\bdvd\b|batter|cleaner|\blube\b|lubric|\boils?\b|candle|gift card|sample|storage|\bbag\b|poster|\bcards?\b|\bdice\b|magazine|\bkit\b.*(care|clean)", re.I)
OUTFIT_BONUS = re.compile(r"babydoll|teddy|chemise|bodysuit|corset|bustier|\bset\b|dress|gown|robe|costume|catsuit|negligee|lingerie", re.I)
PATTERN = ["vibrator", "outfit", "dildo", "vibrator", "outfit", "plug", "dildo", "outfit", "cage", "vibrator", "outfit", "plug"]

def feat_type(g):
    name = g["name"]
    if FEAT_HIDE.search(name): return "other"
    if g["cat"] == "lingerie": return "outfit"
    for t, rx in FEAT_TYPES:
        if rx.search(name): return t
    if FEAT_TIER2.search(name): return "tier2"
    return "other"

def rank_featured(groups):
    brand_n = {}
    for g in groups: brand_n[g["brand"].lower()] = brand_n.get(g["brand"].lower(), 0) + 1
    def score(g):
        v = g["price"]; sc = 0.0
        if 25 <= v <= 130: sc += 30
        elif 15 <= v < 25 or 130 < v <= 220: sc += 10
        elif v < 10: sc -= 15
        sc += math.log(brand_n.get(g["brand"].lower(), 1) + 1) * 5
        if len(g["variants"]) > 1: sc += 8
        if any(x["isNew"] for x in g["variants"]): sc += 5
        if g["type"] == "outfit" and OUTFIT_BONUS.search(g["name"]): sc += 12
        return sc
    live = [g for g in groups if g["inStock"]]
    dead = [g for g in groups if not g["inStock"]]
    for g in groups: g["type"] = feat_type(g); g["fscore"] = score(g)
    queues = {}
    for g in live: queues.setdefault(g["type"], []).append(g)
    def diversify(items, gap=4):
        items = sorted(items, key=lambda g: -g["fscore"])
        out, recent, pool = [], [], items
        while pool:
            pick = next((g for g in pool if g["brand"].lower() not in recent), pool[0])
            pool.remove(pick); out.append(pick)
            recent.append(pick["brand"].lower())
            if len(recent) > gap: recent.pop(0)
        return out
    for t in list(queues): queues[t] = diversify(queues[t])
    order, idx = [], {t: 0 for t in queues}
    main = set(t for t in PATTERN)
    while any(idx.get(t, 0) < len(queues.get(t, [])) for t in main):
        for t in PATTERN:
            q = queues.get(t, [])
            if idx.get(t, 0) < len(q):
                order.append(q[idx[t]]); idx[t] += 1
    rest = []
    for t in queues:
        if t not in main: rest += queues[t]
    order += diversify(rest)
    order += sorted(dead, key=lambda g: -g["fscore"])
    for i, g in enumerate(order): g["rank"] = i
    return order

glist = rank_featured(glist)
for g in glist:
    for v in g["variants"]: v["f"] = g["rank"]

# ---------- brands ----------
brand_names, brands = {}, {}
for g in glist:
    if not g["brand"]: continue
    key = slugify(g["brand"])
    if not key: continue
    brand_names.setdefault(key, {}).setdefault(g["brand"], 0)
    brand_names[key][g["brand"]] += 1
    brands.setdefault(key, []).append(g)
brand_display = {k: max(v.items(), key=lambda kv: kv[1])[0] for k, v in brand_names.items()}
for g in glist:
    g["bslug"] = slugify(g["brand"]) if g["brand"] and slugify(g["brand"]) in brands else ""

# ---------- 2) lean catalog + lazy detail chunks (flat SKUs; the shop groups them itself) ----------
lean = []
for p in products:
    d = {"model": p["model"], "name": p["name"], "cat": p["cat"], "price": p["price"], "orig": p["orig"],
         "image": p["image"], "brand": p["brand"], "b": p["b"], "s": p["s"], "f": p["f"]}
    if not p["inStock"]: d["inStock"] = False
    if p["isNew"]: d["isNew"] = True
    if p["rating"]: d["rating"] = p["rating"]
    if p["reviews"]: d["reviews"] = p["reviews"]
    lean.append(d)
w("products.json", json.dumps(lean, separators=(",", ":"), ensure_ascii=False))
chunks = {}
for p in products:
    chunks.setdefault(p["b"], {})[p["model"]] = [p["desc"], p["material"]]
for b, data in chunks.items():
    w("data/d/%d.json" % b, json.dumps(data, separators=(",", ":"), ensure_ascii=False))

# ---------- 3) page shell (same header/footer as the info pages) ----------
tpl = open(os.path.join(ROOT, "privacy", "index.html"), encoding="utf-8").read()
head_end = tpl.index('<main id="main">')
tail_start = tpl.index("</main>")
HEAD_T, TAIL = tpl[:head_end], tpl[tail_start:]
def shell(title, desc, path, body, extra_head="", noindex=False):
    h = HEAD_T
    if not title.endswith("| Intimacy Supply"): title += " | Intimacy Supply"
    h = re.sub(r"<title>.*?</title>", "<title>%s</title>" % html.escape(title), h, 1, re.S)
    h = re.sub(r'<meta name="description" content=".*?">', '<meta name="description" content="%s">' % html.escape(desc, quote=True), h, 1)
    h = re.sub(r'<link rel="canonical" href=".*?">', '<link rel="canonical" href="%s%s">' % (SITE, path), h, 1)
    if noindex: extra_head += '<meta name="robots" content="noindex, follow">'
    h = h.replace("</head>", extra_head + "</head>", 1)
    return h + '<main id="main">' + body + TAIL

def pricebox(p, cls="pr"):
    if p["orig"] > p["price"]:
        pct = round((1 - p["price"] / p["orig"]) * 100)
        return ('<div class="%s"><div class="pr-vip"><b>%s</b><span>VIP price</span></div>'
                '<div class="pr-reg"><s>%s</s><span>Regular price</span></div>'
                '<div class="pr-save">Save %d%% with VIP</div></div>') % (cls, money(p["price"]), money(p["orig"]), pct)
    return '<div class="%s"><div class="pr-vip"><b>%s</b></div></div>' % (cls, money(p["price"]))

def card(g):
    opts = len(g["variants"])
    return ('<a class="card" href="/p/%s/"><div class="card-img"><img src="%s" alt="%s" loading="lazy" width="400" height="400"></div>'
            '<div class="card-name">%s</div>%s%s</a>') % (
        g["slug"], html.escape(g["images"][0]), html.escape(g["name"], quote=True), html.escape(g["name"]),
        pricebox(g, "pr pr-sm"), ('<div class="card-opts">%d options</div>' % opts) if opts > 1 else "")

by_cat = {}
for g in glist: by_cat.setdefault(g["cat"], []).append(g)

PDP_JS = """<script>(function(){var V=%s,img=document.getElementById('pdp-main'),box=document.getElementById('pdp-price'),
add=document.getElementById('pdp-add'),lab=document.getElementById('pdp-label'),chips=document.querySelectorAll('.chip');
function m(n){return '$'+n.toFixed(2)}
function pb(v){if(v.o>v.p){return '<div class="pr"><div class="pr-vip"><b>'+m(v.p)+'</b><span>VIP price</span></div><div class="pr-reg"><s>'+m(v.o)+'</s><span>Regular price</span></div><div class="pr-save">Save '+Math.round((1-v.p/v.o)*100)+'%% with VIP</div></div>'}return '<div class="pr"><div class="pr-vip"><b>'+m(v.p)+'</b></div></div>'}
function pick(i){var v=V[i];box.innerHTML=pb(v);if(v.i){img.src=v.i}lab.textContent=v.l==='Default'?'':v.l;
add.href='/?product='+encodeURIComponent(v.id);add.textContent=v.s?'Add to bag':'Sold out - view item';
chips.forEach(function(c,j){c.setAttribute('aria-pressed',j===i?'true':'false')})}
chips.forEach(function(c,i){c.addEventListener('click',function(){pick(i)})});
document.querySelectorAll('.thumbs img').forEach(function(t){t.addEventListener('click',function(){img.src=t.src})});})();</script>"""

# ---------- 4) one page per product ----------
for g in glist:
    catname = CATS.get(g["cat"], (g["cat"].title(), ""))[0]
    vs = g["variants"]; rep = g["rep"]
    pool = by_cat[g["cat"]]
    rel = [q for q in pool if q["brand"] == g["brand"] and q is not g][:4]
    if len(rel) < 4:
        start = (len(g["slug"]) * 13) % max(1, len(pool) - 8)
        rel += [q for q in pool[start:start + 12] if q is not g and q not in rel][:4 - len(rel)]
    vjs = json.dumps([{"id": v["model"], "l": v["label"], "p": v["price"], "o": v["orig"], "i": v["image"], "s": 1 if v["inStock"] else 0}
                      for v in vs], separators=(",", ":"))
    chips = ""
    if len(vs) > 1:
        chips = '<div class="opts"><div class="opts-h">Options: <span id="pdp-label">%s</span></div>%s</div>' % (
            html.escape(rep["label"] if rep["label"] != "Default" else ""),
            "".join('<button type="button" class="chip%s" aria-pressed="%s">%s</button>' % (
                "" if v["inStock"] else " chip-out", "true" if v is rep else "false", html.escape(v["label"])) for v in vs))
    else:
        chips = '<span id="pdp-label" hidden></span>'
    thumbs = "".join('<img src="%s" alt="" width="80" height="80" loading="lazy">' % html.escape(u) for u in g["images"][1:6]) if len(g["images"]) > 1 else ""
    lows = [v["orig"] for v in vs]
    offer = {"@type": "AggregateOffer", "priceCurrency": "USD", "lowPrice": "%.2f" % min(lows), "highPrice": "%.2f" % max(lows),
             "offerCount": len(vs), "availability": "https://schema.org/InStock" if g["inStock"] else "https://schema.org/OutOfStock"}
    schema = {"@context": "https://schema.org", "@type": "Product", "name": g["name"], "image": g["images"], "sku": rep["model"],
              "brand": {"@type": "Brand", "name": g["brand"]}, "description": g["desc"][:300], "offers": offer}
    body = ('<div class="crumbs"><a href="/">Home</a> / <a href="/c/%s/">%s</a> / %s</div>'
            '<div class="pdp"><div class="pdp-media"><div class="pdp-img"><img id="pdp-main" src="%s" alt="%s" width="800" height="800"></div>'
            '<div class="thumbs">%s</div></div>'
            '<div class="pdp-info"><div class="pdp-brand">%s</div><h1>%s</h1><div id="pdp-price">%s</div>%s'
            '<a id="pdp-add" class="btn-black" href="/?product=%s">%s</a>'
            '<p class="pdp-note">VIP members pay the VIP price. Everyone else pays the regular price. Add to your bag now; a free account is created at checkout.</p>'
            '<ul class="pdp-facts"><li>Plain packaging and discreet billing (DHARMA*INTIMACYSUP).</li>'
            '<li>Free shipping over $59.97. Standard delivery is 6&ndash;10 business days.</li>'
            '<li>30-day returns on unopened items. You pay return shipping unless the item is defective. <a href="/shipping-returns">Full policy</a></li></ul>'
            '<h2>Details</h2><p class="pdp-desc">%s</p>%s'
            '<p class="pdp-meta"><a href="/vip-membership">How VIP pricing works</a> &middot; <a href="/shipping-returns">Shipping &amp; returns</a></p></div></div>'
            '<h2 class="rel-h">You may also like</h2><div class="grid">%s</div>') % (
        g["cat"], catname, html.escape(g["name"]), html.escape(g["images"][0]), html.escape(g["name"], quote=True), thumbs,
        ('<a href="/b/%s/">%s</a>' % (g["bslug"], html.escape(brand_display[g["bslug"]])) if g["bslug"] else html.escape(g["brand"])),
        html.escape(g["name"]), pricebox(rep), chips, html.escape(rep["model"]),
        "Add to bag" if rep["inStock"] else "Sold out - view item", html.escape(g["desc"]),
        ('<p class="pdp-meta">Material: %s</p>' % html.escape(g["material"])) if g["material"] else "",
        "".join(card(q) for q in rel)) + (PDP_JS % vjs if len(vs) > 1 else "")
    write_desc = (g["desc"][:150] + "…") if len(g["desc"]) > 150 else g["desc"]
    w("p/%s/index.html" % g["slug"], shell(g["name"], write_desc, "/p/%s/" % g["slug"], body,
        '<script type="application/ld+json">%s</script>' % json.dumps(schema, ensure_ascii=False)))

# ---------- 5) category pages ----------
urls = []
def pager(base, page, pages):
    if pages <= 1: return ""
    def href(n): return base if n == 1 else "%spage/%d/" % (base, n)
    out = ['<nav class="pager" aria-label="Pages">']
    if page > 1: out.append('<a href="%s" rel="prev">Previous</a>' % href(page - 1))
    for n in range(max(1, page - 2), min(pages, page + 2) + 1):
        out.append('<a href="%s"%s>%d</a>' % (href(n), ' aria-current="page"' if n == page else "", n))
    if page < pages: out.append('<a href="%s" rel="next">Next</a>' % href(page + 1))
    out.append("</nav>")
    return "".join(out)

for cat, items in by_cat.items():
    name, blurb = CATS.get(cat, (cat.title(), ""))
    pages = math.ceil(len(items) / PER_PAGE)
    base = "/c/%s/" % cat
    for pg in range(1, pages + 1):
        chunk = items[(pg - 1) * PER_PAGE: pg * PER_PAGE]
        path = base if pg == 1 else "%spage/%d/" % (base, pg)
        body = ('<div class="crumbs"><a href="/">Home</a> / %s</div><h1>%s</h1><p class="lede">%s</p>'
                '<div class="count">%d products%s</div><div class="grid">%s</div>%s') % (
            name, name, html.escape(blurb), len(items), " &middot; page %d of %d" % (pg, pages) if pages > 1 else "",
            "".join(card(g) for g in chunk), pager(base, pg, pages))
        t = name if pg == 1 else "%s, page %d" % (name, pg)
        w(path.strip("/") + "/index.html", shell(t, blurb, path, body))
        urls.append(path)

dir_body = '<h1>Shop all</h1><p class="lede">Every category, one page each.</p><ul class="dir">%s</ul>' % "".join(
    '<li><a href="/c/%s/">%s</a> <span>%d products</span></li>' % (c, CATS.get(c, (c.title(),))[0], len(v)) for c, v in by_cat.items())
w("p/index.html", shell("Shop all", "Browse every Intimacy Supply category.", "/p/", dir_body))
urls.append("/p/")

# ---------- 5b) brand pages ----------
brand_urls = []
for key, items in sorted(brands.items()):
    name = brand_display[key]
    pages = math.ceil(len(items) / PER_PAGE)
    base = "/b/%s/" % key
    for pg in range(1, pages + 1):
        chunk = items[(pg - 1) * PER_PAGE: pg * PER_PAGE]
        path = base if pg == 1 else "%spage/%d/" % (base, pg)
        body = ('<div class="crumbs"><a href="/">Home</a> / <a href="/brands/">Brands</a> / %s</div><h1>%s</h1>'
                '<p class="lede">Shop %s at up to 34%% off with VIP membership. Every item shows the VIP price and the regular price.</p>'
                '<div class="count">%d products%s</div><div class="grid">%s</div>%s') % (
            html.escape(name), html.escape(name), html.escape(name), len(items),
            " &middot; page %d of %d" % (pg, pages) if pages > 1 else "",
            "".join(card(g) for g in chunk), pager(base, pg, pages))
        t = name if pg == 1 else "%s, page %d" % (name, pg)
        w(path.strip("/") + "/index.html", shell(t, "Shop %s at Intimacy Supply. VIP price and regular price on every item." % name, path, body))
        brand_urls.append(path)

letters = {}
for key in sorted(brands, key=lambda k: brand_display[k].lower()):
    n = brand_display[key]
    L = n[0].upper() if n[0].isalpha() else "#"
    letters.setdefault(L, []).append((key, n, len(brands[key])))
dir_html = "".join('<h2 id="%s">%s</h2><ul class="dir">%s</ul>' % (L, L, "".join(
    '<li><a href="/b/%s/">%s</a> <span>%d</span></li>' % (k, html.escape(n), c) for k, n, c in v)) for L, v in sorted(letters.items()))
jump = " ".join('<a href="#%s">%s</a>' % (L, L) for L in sorted(letters))
w("brands/index.html", shell("Brands", "Shop %d brands at Intimacy Supply." % len(brands), "/brands/",
    '<div class="crumbs"><a href="/">Home</a> / Brands</div><h1>Brands</h1><p class="lede">%d brands. Pick one to see everything we carry from them.</p><p class="jump">%s</p>%s' % (len(brands), jump, dir_html)))
brand_urls.append("/brands/")

top = sorted(brands.items(), key=lambda kv: -len(kv[1]))[:24]
w("data/brands-top.json", json.dumps({"brands": len(brands), "products": len(glist),
    "top": [{"n": brand_display[k], "s": k} for k, _ in top]}, separators=(",", ":"), ensure_ascii=False))

# ---------- 6) sitemap ----------
static_pages = ["/", "/vip-membership/", "/about/", "/faq/", "/contact/", "/shipping-returns/", "/refund-policy/", "/terms/",
                "/privacy/", "/do-not-sell/", "/gdpr/", "/accessibility/", "/recognize-a-charge/", "/complaints/",
                "/affiliate-disclosure/", "/affiliate-terms/", "/compliance/", "/email-preferences/", "/partners.html"]
all_urls = static_pages + urls + brand_urls + ["/p/%s/" % g["slug"] for g in glist]
w("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n%s</urlset>\n' %
  "".join("  <url><loc>%s%s</loc></url>\n" % (SITE, u) for u in all_urls))
print("SKUs:", len(products), "-> products:", len(glist), "| with options:", sum(1 for g in glist if len(g["variants"]) > 1),
      "| category pages:", len(urls) - 1, "| brand pages:", len(brand_urls), "| sitemap urls:", len(all_urls))
