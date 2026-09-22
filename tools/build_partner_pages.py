#!/usr/bin/env python3
"""Builds the creator-program pages (partners.html, creator.html, dashboard.html) in the store's design,
using the shared header/footer from /privacy/. Run: python3 tools/build_partner_pages.py"""
import os, re, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tpl = open(os.path.join(ROOT, "privacy", "index.html"), encoding="utf-8").read()
HEAD = tpl[:tpl.index('<main id="main">')]
TAIL = tpl[tpl.index("</main>"):]
SCRIPTS = re.findall(r"<script[^>]*>.*?</script>", open(os.path.join(ROOT, "tools", "partner_src", "partners.scripts.html"), encoding="utf-8").read(), re.S)
FIREBASE = ('<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>\n'
            '<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"></script>')

def page(title, desc, path, body, extra_head="", extra_tail="", noindex=False):
    h = HEAD
    h = re.sub(r"<title>.*?</title>", "<title>%s</title>" % html.escape(title), h, 1, re.S)
    h = re.sub(r'<meta name="description" content=".*?">', '<meta name="description" content="%s">' % html.escape(desc, quote=True), h, 1)
    h = re.sub(r'<link rel="canonical" href=".*?">', '<link rel="canonical" href="https://intimacysupply.com%s">' % path, h, 1)
    if noindex: extra_head += '<meta name="robots" content="noindex, nofollow">'
    h = h.replace("</head>", extra_head + "</head>", 1)
    return h + '<main id="main">' + body + TAIL.replace("</footer></body></html>", "</footer>" + extra_tail + "</body></html>")

# ---------------------------------------------------------------- partners.html
def platform(name, label=None, sel=False):
    return '<button type="button" class="pill%s" onclick="togglePlatform(this,\'%s\')">%s</button>' % (" sel" if sel else "", name, label or name)

partners_body = """<section class="vip-hero">
<div class="vip-hero-in">
<div class="eyebrow-w">Creator partner program</div>
<h1>Earn 5% on every order you refer</h1>
<p class="lede">Share your link. When someone you refer places an order within 90 days, you earn 5% of the net sale. No follower minimum. Your audience shops at up to 40% off with VIP membership.</p>
<a class="btn-red" href="#apply">Apply to partner</a> <a class="btn-ghost" href="#how">How it works</a>
<div class="facts">
<div><b>5%</b><span>of net revenue on referred orders</span></div>
<div><b>90 days</b><span>your link is remembered</span></div>
<div><b>$25</b><span>minimum payout</span></div>
<div><b>Monthly</b><span>payments for the prior month</span></div>
</div>
</div>
</section>
<div class="narrow">
<h2 id="how">How it works</h2>
<ol class="steps">
<li><strong>Apply</strong>Fill out the short form below. We review every application and reply within 48 hours. We look at audience fit, not follower count.</li>
<li><strong>Get your link</strong>Approved partners receive a personal link, a landing page with their handle on it, and a private dashboard.</li>
<li><strong>Share it</strong>Post it wherever your audience is. When someone follows your link and places an order within 90 days, we credit you automatically.</li>
<li><strong>Get paid</strong>Commissions are calculated on net revenue after refunds and chargebacks, confirmed 30 days after payment, and paid monthly.</li>
</ol>

<h2>What you earn</h2>
<table class="cmp"><thead><tr><th></th><th class="vip">Partner</th></tr></thead><tbody>
<tr><th scope="row">Commission rate</th><td class="vip">5%</td></tr>
<tr><th scope="row">Paid on</th><td class="vip">Net revenue (order total less tax and shipping, after refunds and chargebacks)</td></tr>
<tr><th scope="row">Referral window</th><td class="vip">90 days</td></tr>
<tr><th scope="row">Confirmed</th><td class="vip">30 days after the customer's payment</td></tr>
<tr><th scope="row">Minimum payout</th><td class="vip">$25</td></tr>
</tbody></table>
<p class="cmp-note">Example of the arithmetic: if orders from your link total $1,000 in net revenue in a month, 5% is $50. This is an illustration only, not an estimate or guarantee of what you will earn. Results depend on your audience and your effort.</p>

<h2>What partners get</h2>
<ul class="perks">
<li><strong>A tracked link</strong>A personal link that remembers your referral for 90 days.</li>
<li><strong>Your own landing page</strong>Your link opens a page with your handle on it and today's VIP offer.</li>
<li><strong>A live dashboard</strong>Orders, commissions, confirmed balance and payout history in one place.</li>
<li><strong>Product access</strong>Approved partners may receive products to review or feature.</li>
<li><strong>No minimums</strong>No follower count or traffic threshold. If your audience is engaged, you qualify.</li>
<li><strong>Email support</strong>Reach the partner team at hello@intimacysupply.com.</li>
</ul>

<h2>Rules that keep everyone safe</h2>
<ul class="perks">
<li><strong>Disclose your link</strong>Say: "I may earn a commission if you purchase through my link. I am a partner of Intimacy Supply."</li>
<li><strong>Adults only</strong>You and your audience must be 18 or older. No promotion to minors.</li>
<li><strong>Honest claims</strong>No false or misleading statements about products or earnings, no spam, and no bidding on our brand name in paid search.</li>
</ul>
<p>Read the full <a href="/affiliate-terms/">Affiliate Program Terms</a> and the <a href="/affiliate-disclosure/">Affiliate Disclosure</a>.</p>

<h2>Common questions</h2>
<details class="q"><summary>When do I get paid?</summary><p>Commissions are calculated monthly for the prior month's verified orders. We may hold commissions up to 30 days to cover refunds. The minimum payout is $25, paid by PayPal.</p></details>
<details class="q"><summary>What counts as an order from my link?</summary><p>A customer who follows your link and places a paid order within 90 days. Unpaid, cancelled, refunded or charged-back orders do not earn commission.</p></details>
<details class="q"><summary>Can I see who bought?</summary><p>No. For customer privacy your dashboard shows dates, amounts and commissions, never names, contact details or items.</p></details>
<details class="q"><summary>Do I need a big audience?</summary><p>No. We approve based on audience fit and how you would promote us.</p></details>

<h2 id="apply">Partner application</h2>
<p class="lede-d">Takes about three minutes. We review every application and respond within 48 hours.</p>
<div id="application-form" class="pf">
<div class="pf-row">
<div class="pf-g"><label for="f-fname">First name *</label><input id="f-fname" type="text" autocomplete="given-name" placeholder="First name"></div>
<div class="pf-g"><label for="f-lname">Last name *</label><input id="f-lname" type="text" autocomplete="family-name" placeholder="Last name"></div>
</div>
<div class="pf-g"><label for="f-email">Email address *</label><input id="f-email" type="email" autocomplete="email" placeholder="you@example.com"></div>
<div class="pf-g"><label for="f-handle">Primary handle or username *</label><input id="f-handle" type="text" placeholder="u/yourname or @yourhandle"></div>
<div class="pf-g"><label>Where is your primary audience? *</label><div class="pills">__PLATFORMS__</div></div>
<div class="pf-g"><label for="f-reach">Approximate monthly reach *</label>
<select id="f-reach"><option value="">Select your reach</option><option value="under-1k">Under 1,000</option><option value="1k-5k">1,000 to 5,000</option><option value="5k-25k">5,000 to 25,000</option><option value="25k-100k">25,000 to 100,000</option><option value="100k-500k">100,000 to 500,000</option><option value="500k+">500,000+</option></select></div>
<div class="pf-g"><label for="f-link">Link to your profile or content *</label><input id="f-link" type="url" placeholder="https://"></div>
<div class="pf-g"><label>Content niche (choose any)</label><div class="pills">__NICHES__</div></div>
<div class="pf-g"><label for="f-why">Tell us about your audience and why you would be a good partner *</label><textarea id="f-why" rows="4" placeholder="Who follows you and what they care about"></textarea></div>
<div class="pf-g"><label for="f-promo">How do you plan to promote us?</label><textarea id="f-promo" rows="3" placeholder="Posts, reviews, pinned links, stories"></textarea></div>
<p class="pf-note">By applying you confirm you are 18 or older and that your audience is primarily 18+. Partner content must follow platform rules and FTC disclosure guidelines. Payouts have a $25 minimum. See the <a href="/affiliate-terms/">Affiliate Program Terms</a>.</p>
<button class="btn-black btn-submit" type="button" onclick="submitApplication()">Submit application</button>
</div>
<div id="success-state" class="pf-success" style="display:none">
<h3>Application received</h3>
<p>We review every application personally and will reply within 48 hours at the email you provided. Check your spam folder just in case.</p>
<a class="btn-black" href="/">Back to the shop</a>
</div>
<div id="toast" class="toast"></div>
</div>""".replace("__PLATFORMS__", "".join([platform("Reddit", sel=True), platform("OnlyFans"), platform("Twitter/X", "Twitter / X"), platform("TikTok"), platform("Instagram"), platform("Other", "Other / Blog")])).replace("__NICHES__", "".join([platform("Adult Lifestyle", sel=True), platform("Lingerie / Fashion", "Lingerie / Fashion"), platform("Couples / Relationship", "Couples"), platform("Wellness / Health", "Wellness")]))
# application logic (original, unchanged) + Firebase
partners_scripts = SCRIPTS[0] + "\n" + FIREBASE + "\n" + SCRIPTS[3] + "\n"
open(os.path.join(ROOT, "partners.html"), "w", encoding="utf-8").write(page(
    "Creator partner program", "Earn 5% commission on orders from customers you refer to Intimacy Supply. No follower minimum.", "/partners.html",
    partners_body, extra_tail=partners_scripts))

# ---------------------------------------------------------------- creator.html (referral landing page)
creator_body = """<section class="vip-hero">
<div class="vip-hero-in">
<div class="eyebrow-w" id="c-eyebrow">VIP offer</div>
<h1 id="c-h1">Up to 40% off everything</h1>
<p class="lede" id="c-sub">VIP members save up to 40% on every order, get a $50 Member Token each month, and can skip or cancel any time. Orders ship in plain packaging with discreet billing.</p>
<a class="btn-red" id="c-cta" href="/">Shop VIP prices</a>
<div class="facts">
<div><b>Up to 40%</b><span>off every item, applied automatically</span></div>
<div><b>$50</b><span>Member Token each month</span></div>
<div><b>Plain</b><span>packaging, discreet billing</span></div>
<div><b>Skip or cancel</b><span>any time, no fee</span></div>
</div>
</div>
</section>
<div class="narrow">
<h2>Popular right now</h2>
<p class="lede-d">Every item shows the VIP price and the regular price.</p>
<div class="grid" id="c-grid"></div>
<h2>How VIP works</h2>
<ol class="steps">
<li><strong>Shop</strong>Browse over 7,000 products from 550+ brands. Create a free account to add items to your bag.</li>
<li><strong>Choose VIP at checkout</strong>VIP membership is $39.95 a month, billed on the 6th. You are charged at VIP prices on your first order, and your card statement shows Dharma Media &amp; Technology LLC.</li>
<li><strong>Use your monthly token</strong>Each token covers up to $50 toward an item. Skip a month between the 1st and 5th and you are not charged.</li>
<li><strong>Cancel any time</strong>Cancel online or by phone. No cancellation fees. Full terms are in the <a href="/vip-membership">VIP membership details</a> and the <a href="/terms">Terms of Service</a>.</li>
</ol>
<a class="btn-red" id="c-cta2" href="/">Start shopping</a>
<p class="cmp-note" style="margin-top:22px">This page contains a referral link. The person who shared it may earn a commission if you purchase. Adults 18+ only.</p>
</div>"""
creator_js = """<script>
(function(){
  var p = new URLSearchParams(location.search);
  var handle = (p.get('ref') || p.get('creator') || p.get('c') || '').replace(/[^a-zA-Z0-9_.\\-]/g, '').slice(0, 60);
  var q = handle ? '?ref=' + handle : '';
  function el(id){ return document.getElementById(id); }
  if (handle) {
    document.title = '@' + handle + ' shared a VIP offer | Intimacy Supply';
    el('c-eyebrow').textContent = 'Shared by @' + handle;
    el('c-h1').textContent = 'Up to 40% off everything';
    el('c-sub').textContent = '@' + handle + ' is a partner of Intimacy Supply. VIP members save up to 40% on every order, get a $50 Member Token each month, and can skip or cancel any time.';
  }
  document.querySelectorAll('a[href="/"]').forEach(function(a){ a.href = '/' + q; });
  fetch('/products.json').then(function(r){ return r.json(); }).then(function(list){
    var seen = {}, out = [];
    list.filter(function(x){ return x.inStock !== false && x.f != null; }).sort(function(a, b){ return a.f - b.f; }).forEach(function(x){
      if (out.length < 4 && !seen[x.s]) { seen[x.s] = 1; out.push(x); }
    });
    el('c-grid').innerHTML = out.map(function(x){
      var save = x.orig > x.price ? Math.round((1 - x.price / x.orig) * 100) : 0;
      var img = '<img src="' + x.image.replace(/"/g, '&quot;') + '" alt="" loading="lazy" width="400" height="400">';
      var name = x.name.replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; });
      return '<a class="card" href="/' + (q ? q + '&' : '?') + 'product=' + encodeURIComponent(x.model) + '"><div class="card-img">' + img + '</div><div class="card-name">' + name + '</div>' +
        '<div class="pr pr-sm"><div class="pr-vip"><b>$' + x.price.toFixed(2) + '</b><span>VIP price</span></div>' +
        (save ? '<div class="pr-reg"><s>$' + x.orig.toFixed(2) + '</s><span>Regular price</span></div><div class="pr-save">Save ' + save + '% with VIP</div>' : '') + '</div></a>';
    }).join('');
  }).catch(function(){ el('c-grid').innerHTML = ''; });
})();
</script>"""
open(os.path.join(ROOT, "creator.html"), "w", encoding="utf-8").write(page(
    "VIP offer", "Up to 40% off everything with VIP membership at Intimacy Supply. Plain packaging and discreet billing.", "/creator.html",
    creator_body, extra_tail=creator_js))

# ---------------------------------------------------------------- dashboard.html
dash_body = """<div id="login-screen" class="dash-login">
<h1>Partner dashboard</h1>
<p class="lede-d">Sign in with your creator handle and access code.</p>
<div class="pf">
<div class="pf-g"><label for="d-handle">Creator handle</label><input id="d-handle" type="text" autocomplete="username" placeholder="u/yourname or @yourhandle"></div>
<div class="pf-g"><label for="d-code">Access code</label><input id="d-code" type="password" autocomplete="current-password" placeholder="Provided by Intimacy Supply"></div>
<div class="pf-err" id="dash-err" style="display:none"></div>
<button class="btn-black login-btn" type="button" onclick="dashLogin()">Sign in</button>
<p class="pf-note">Not a partner yet? <a href="/partners.html">Apply here</a>. Questions? <a href="mailto:hello@intimacysupply.com">hello@intimacysupply.com</a></p>
</div>
</div>
<div id="app" style="display:none">
<div class="dash-top"><div><div class="eyebrow-d">Creator partner</div><h1 id="dash-welcome">Welcome</h1></div><button class="btn-line" type="button" onclick="dashLogout()">Sign out</button></div>

<div class="stat-grid" id="dash-stats"></div>

<h2>Your referral link</h2>
<div class="copybox"><span id="ref-link-display">https://intimacysupply.com/?ref=</span><button type="button" id="copy-link-btn" onclick="copyLink()">Copy</button></div>
<p class="cmp-note">Anyone who follows this link and places a paid order within 90 days is credited to you. Always disclose: "I may earn a commission if you purchase through my link. I am a partner of Intimacy Supply."</p>
<div class="copybox"><span id="page-link-display">https://intimacysupply.com/creator.html?ref=</span><button type="button" onclick="copyPage()">Copy</button></div>
<p class="cmp-note">Your landing page, with your handle on it.</p>

<h2>Payout</h2>
<div class="card-flat">
<p id="payout-status-msg" class="cmp-note"></p>
<div id="payout-form" class="pf">
<div class="pf-g"><label for="payout-paypal">PayPal email</label><input id="payout-paypal" type="email" placeholder="you@example.com"></div>
<button class="btn-black" id="payout-btn" type="button" onclick="requestPayout()">Request payout</button>
</div>
</div>

<h2>Recent orders from your link</h2>
<div class="tbl"><div class="tbl-h"><span>Date</span><span>Order</span><span>Net sale</span><span>Commission</span><span>Status</span></div><div id="signup-history"></div></div>
<p class="cmp-note">Customer names and details are never shown. Commissions are 5% of net revenue and confirm 30 days after payment.</p>

<h2>Payout history</h2>
<div class="tbl tbl-3"><div class="tbl-h"><span>Date</span><span>Amount</span><span>Status</span></div><div id="payout-history"></div></div>
<div id="toast" class="toast"></div>
</div>"""
dash_js = """<script>
var DASH_TOKEN = 'is_dash_token', currentHandle = '';
function cleanHandle(raw){ return (raw || '').trim().replace(/^https?:\\/\\/(www\\.)?reddit\\.com/i, '').replace(/^\\/?(u|user)\\//i, '').replace(/^@/, '').replace(/\\s+/g, '').toLowerCase(); }
function $(id){ return document.getElementById(id); }
function money(n){ return '$' + (Number(n) || 0).toFixed(2); }
function showErr(m){ var e = $('dash-err'); e.textContent = m; e.style.display = 'block'; }
function showToast(m){ var t = $('toast'); t.textContent = m; t.classList.add('show'); setTimeout(function(){ t.classList.remove('show'); }, 2800); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function api(body){ return fetch('/.netlify/functions/affiliate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(function(r){ return r.json().then(function(j){ j.status = r.status; return j; }); }); }

function dashLogin(){
  var handle = cleanHandle($('d-handle').value), code = $('d-code').value.trim();
  if(!handle || !code){ showErr('Enter your handle and access code.'); return; }
  var btn = document.querySelector('.login-btn'); btn.textContent = 'Checking...'; btn.disabled = true;
  api({ action:'login', handle:handle, code:code }).then(function(j){
    if(j.token){ sessionStorage.setItem(DASH_TOKEN, j.token); show(j.summary); }
    else { showErr(j.error || 'Could not sign in.'); btn.textContent = 'Sign in'; btn.disabled = false; }
  }).catch(function(){ showErr('Could not reach the server. Try again in a minute.'); btn.textContent = 'Sign in'; btn.disabled = false; });
}
function dashLogout(){ sessionStorage.removeItem(DASH_TOKEN); location.reload(); }
function refresh(){
  var t = sessionStorage.getItem(DASH_TOKEN); if(!t) return;
  api({ action:'summary', token:t }).then(function(j){ if(j.summary) show(j.summary); else { sessionStorage.removeItem(DASH_TOKEN); } });
}
function show(s){
  currentHandle = s.handle;
  $('login-screen').style.display = 'none'; $('app').style.display = 'block';
  $('dash-welcome').textContent = '@' + s.handle;
  $('ref-link-display').textContent = 'https://intimacysupply.com/?ref=' + s.handle;
  $('page-link-display').textContent = 'https://intimacysupply.com/creator.html?ref=' + s.handle;
  var t = s.totals;
  $('dash-stats').innerHTML = [['Orders', t.orders, 'Paid, all time'], ['This month', s.thisMonth.orders, money(s.thisMonth.commission) + ' earned'],
    ['Confirmed balance', money(t.confirmedBalance), 'Ready to withdraw'], ['Pending', money(t.pendingBalance), 'Confirms after ' + s.payout.holdDays + ' days'],
    ['Paid out', money(t.paidOut), 'All time']].map(function(x){ return '<div class="stat"><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b><em>' + esc(x[2]) + '</em></div>'; }).join('');
  var msg = $('payout-status-msg'), form = $('payout-form');
  if(s.payout.open){ msg.textContent = 'You have a payout request in progress. We process requests within 5 business days.'; form.style.display = 'none'; }
  else if(!s.payout.canRequest){ msg.textContent = 'The minimum payout is ' + money(s.payout.minimum) + ' of confirmed commission. Your confirmed balance is ' + money(t.confirmedBalance) + '.'; form.style.display = 'none'; }
  else { msg.textContent = 'You can withdraw ' + money(t.confirmedBalance) + '.'; form.style.display = 'block'; }
  $('signup-history').innerHTML = s.recentOrders.length ? s.recentOrders.map(function(o){
    return '<div class="tbl-r"><span>' + esc(o.date) + '</span><span>' + esc(o.ref) + '</span><span>' + money(o.net) + '</span><span>' + money(o.commission) + '</span><span class="st-' + esc(o.status) + '">' + esc(o.status.charAt(0).toUpperCase() + o.status.slice(1)) + '</span></div>';
  }).join('') : '<div class="tbl-empty">No paid orders yet. Share your link to start earning.</div>';
  $('payout-history').innerHTML = s.payouts.length ? s.payouts.map(function(p){
    return '<div class="tbl-r"><span>' + esc(p.date) + ' ' + esc(p.to) + '</span><span>' + money(p.amount) + '</span><span class="st-' + esc(p.status) + '">' + (p.status === 'paid' ? 'Paid' : 'Pending') + '</span></div>';
  }).join('') : '<div class="tbl-empty">No payouts yet.</div>';
}
function requestPayout(){
  var email = $('payout-paypal').value.trim(), t = sessionStorage.getItem(DASH_TOKEN);
  if(!email || email.indexOf('@') < 1){ showToast('Enter a valid PayPal email.'); return; }
  var b = $('payout-btn'); b.textContent = 'Submitting...'; b.disabled = true;
  api({ action:'payout', token:t, paypalEmail:email }).then(function(j){
    if(j.ok){ showToast('Payout request submitted.'); refresh(); } else { showToast(j.error || 'Could not submit.'); b.textContent = 'Request payout'; b.disabled = false; }
  }).catch(function(){ showToast('Could not reach the server.'); b.textContent = 'Request payout'; b.disabled = false; });
}
function copyText(txt, ok){ (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function(){ showToast(ok); }).catch(function(){ showToast('Copy this: ' + txt); }); }
function copyLink(){ copyText('https://intimacysupply.com/?ref=' + currentHandle, 'Link copied'); }
function copyPage(){ copyText('https://intimacysupply.com/creator.html?ref=' + currentHandle, 'Page link copied'); }
if(sessionStorage.getItem(DASH_TOKEN)) refresh();
document.addEventListener('keydown', function(e){ if(e.key === 'Enter' && $('login-screen').style.display !== 'none') dashLogin(); });
</script>"""
open(os.path.join(ROOT, "dashboard.html"), "w", encoding="utf-8").write(page(
    "Partner dashboard", "Sign in to see your orders, commissions and payouts.", "/dashboard.html", dash_body, extra_tail=dash_js, noindex=True))
print("wrote partners.html, creator.html, dashboard.html")
