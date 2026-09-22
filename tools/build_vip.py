#!/usr/bin/env python3
"""Regenerates /vip-membership/index.html (the standalone VIP page) using the shared header/footer from /privacy/."""
import os, re, html
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tpl = open(os.path.join(ROOT, "privacy", "index.html"), encoding="utf-8").read()
head = tpl[:tpl.index('<main id="main">')]
tail = tpl[tpl.index("</main>"):]
title = "VIP membership | Intimacy Supply"
desc = "Up to 40% off everything for $39.95 a month. Monthly $50 Member Token, skip any month, cancel any time."
head = re.sub(r"<title>.*?</title>", "<title>%s</title>" % title, head, 1, re.S)
head = re.sub(r'<meta name="description" content=".*?">', '<meta name="description" content="%s">' % html.escape(desc, quote=True), head, 1)
head = re.sub(r'<link rel="canonical" href=".*?">', '<link rel="canonical" href="https://intimacysupply.com/vip-membership/">', head, 1)

CHECK, DASH = "&#10003;", "&ndash;"
rows = [("Up to 40% off retail prices", CHECK, DASH),
        ("First access to new drops every month", CHECK, DASH),
        ("A $50 Member Token every month", CHECK, DASH),
        ("Plain packaging and discreet billing", CHECK, CHECK),
        ("Price you pay", "Up to 40% off", "Regular price")]
table = "".join('<tr><th scope="row">%s</th><td class="vip">%s</td><td>%s</td></tr>' % r for r in rows)

body = """<section class="vip-hero">
<div class="vip-hero-in">
<h1>VIP membership</h1>
<p class="lede">Up to 40% off every order, one Member Token each month, and the freedom to skip or cancel whenever you want.</p>
<a class="btn-red" href="/">Start shopping</a>
<div class="facts">
<div><b>$39.95</b><span>per month, billed on the 6th</span></div>
<div><b>40%</b><span>off everything, applied automatically</span></div>
<div><b>$50</b><span>toward an item with each token</span></div>
<div><b>$0</b><span>to skip (1st&ndash;5th) or to cancel</span></div>
</div>
</div>
</section>
<div class="narrow">
<h2>VIP or regular</h2>
<table class="cmp"><thead><tr><th></th><th class="vip">VIP member</th><th>Non-member</th></tr></thead><tbody>__TABLE__</tbody></table>
<p class="cmp-note">Every item in the shop shows both prices. Add items to your bag, then choose VIP pricing at checkout.</p>
<h2>How billing works</h2>
<ol class="steps">
<li><strong>Billed monthly</strong>You are charged $39.95 on the 6th of each month for your membership benefits, unless you skip.</li>
<li><strong>Skip any month</strong>Sign in, open My Account, then Overview, and tap Skip This Month between the 1st and 5th. You are not charged and your tokens carry forward.</li>
<li><strong>Tokens</strong>Each token covers up to $50 toward an item. Pricier items use more tokens ($60 uses 2, $189 uses 4). Tokens expire 12 months after they are issued.</li>
<li><strong>Cancel any time</strong>Cancel online, or call or text (559) 334-0826. No cancellation fees. Unused tokens stay usable for 60 days after you cancel.</li>
</ol>
<p>Your card statement shows Dharma Media &amp; Technology LLC, never Intimacy Supply. Full details are in the <a href="/terms">Terms of Service</a> and the <a href="/refund-policy">Refund &amp; Cancellation Policy</a>.</p>
<a class="btn-red" href="/">Start shopping</a>
</div>""".replace("__TABLE__", table)

out = head + '<main id="main">' + body + tail
os.makedirs(os.path.join(ROOT, "vip-membership"), exist_ok=True)
open(os.path.join(ROOT, "vip-membership", "index.html"), "w", encoding="utf-8").write(out)
print("wrote vip-membership/index.html", len(out), "bytes")
