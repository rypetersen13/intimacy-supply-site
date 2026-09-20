#!/usr/bin/env python3
"""Builds order-confirmation.html in the store's design, using the shared header and footer from /privacy/.
Run: python3 tools/build_confirmation.py"""
import os, re, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tpl = open(os.path.join(ROOT, "privacy", "index.html"), encoding="utf-8").read()
HEAD = tpl[:tpl.index('<main id="main">')]
TAIL = tpl[tpl.index("</main>"):]

BODY = """<div class="conf">
<div class="conf-hd">
<div class="conf-check" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
<div class="eyebrow">Order confirmed</div>
<h1 id="cf-title">Thank you. Your order is in.</h1>
<p class="conf-meta">Order <b id="cf-num">&nbsp;</b> <span class="dot">&middot;</span> <span id="cf-date"></span></p>
<p class="conf-msg" id="confText">CCBill will email your payment receipt.</p>
</div>
<div class="conf-grid">
<section class="conf-card" aria-labelledby="cf-items-h">
<h2 id="cf-items-h">Your items</h2>
<div id="orderList" class="conf-items"><div class="conf-skel"></div><div class="conf-skel"></div></div>
<div id="orderBreakdown" class="conf-totals"></div>
</section>
<aside class="conf-side">
<section class="conf-card"><h2>Delivery</h2><div id="cf-ship" class="conf-ship">Loading&hellip;</div></section>
<section class="conf-card"><h2>What happens next</h2>
<ol class="conf-steps">
<li><b>We prepare your order.</b> It ships within 1&ndash;2 business days of payment.</li>
<li><b>Plain packaging.</b> An unmarked brown box. Your statement shows DHARMA*INTIMACYSUP.</li>
<li><b>Tracking by email.</b> You will get it once your order ships. Standard delivery is 6&ndash;10 business days.</li>
</ol></section>
<section id="cf-vip" class="conf-card conf-vip" hidden><h2>VIP membership</h2>
<p>Your VIP membership starts with this order. Starting next cycle you are billed $39.95 on the 6th of each month unless you skip between the 1st and 5th. Each cycle adds one Member Token, good for up to $50 toward any item. Cancel any time online.</p></section>
</aside>
</div>
<p class="conf-actions"><a class="btn-red" href="/">Continue shopping</a></p>
<p class="conf-help">Questions about your order? Email <a href="mailto:hello@intimacysupply.com">hello@intimacysupply.com</a> or call <a href="tel:+15593340826">(559) 334-0826</a>. <a href="/refund-policy">Cancellation &amp; refunds</a></p>
</div>"""

SCRIPT = r"""<script>
(function(){
  var listEl = document.getElementById('orderList'), totEl = document.getElementById('orderBreakdown');
  var shipEl = document.getElementById('cf-ship'), numEl = document.getElementById('cf-num');
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function money(n){ return '$' + Number(n || 0).toFixed(2); }
  function itemRow(i){
    var det = [i.size && i.size !== 'One Size' ? 'Size ' + i.size : '', i.colorName && i.colorName !== 'Standard' ? i.colorName : '', 'Qty ' + (i.qty || 1)].filter(Boolean).join(' \u00b7 ');
    var img = i.image ? '<img src="' + esc(i.image) + '" alt="" loading="lazy" width="88" height="88">' : '<span class="ph"></span>';
    var name = i.slug ? '<a href="/p/' + esc(i.slug) + '/">' + esc(i.name) + '</a>' : esc(i.name);
    return '<div class="conf-item"><div class="conf-img">' + img + '</div><div class="conf-info"><div class="conf-name">' + name + '</div><div class="conf-det">' + esc(det) + '</div></div><div class="conf-price">' + money(i.lineTotal != null ? i.lineTotal : (i.unitPrice || 0) * (i.qty || 1)) + '</div></div>';
  }
  function totals(p){
    var rows = [];
    var sub = p.subtotalOriginal != null ? p.subtotalOriginal : (p.afterDiscounts != null ? p.afterDiscounts : p.subtotal || 0);
    rows.push(['Items subtotal', money(sub)]);
    if (p.vipDiscount > 0) rows.push(['VIP savings', '\u2212' + money(p.vipDiscount), 'save']);
    if (p.tokenValueCovered > 0) rows.push(['Member Token', '\u2212' + money(p.tokenValueCovered), 'save']);
    if (p.promoDiscount > 0) rows.push(['Promo', '\u2212' + money(p.promoDiscount), 'save']);
    rows.push(['Shipping', (p.shipping || 0) === 0 ? 'Free' : money(p.shipping)]);
    rows.push(['Estimated tax', money(p.tax)]);
    var html = rows.map(function(r){ return '<div class="conf-row' + (r[2] ? ' ' + r[2] : '') + '"><span>' + r[0] + '</span><span>' + r[1] + '</span></div>'; }).join('');
    return html + '<div class="conf-row total"><span>Total</span><span>' + money(p.total) + '</span></div>';
  }
  function ship(d){
    var s = d.shipTo || {}, line2 = [s.city, [s.state, s.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    shipEl.innerHTML = '<div><b>' + esc(s.name || 'Your address') + '</b></div><div>' + esc(s.address) + (s.address2 ? ', ' + esc(s.address2) : '') + '</div><div>' + esc(line2) + '</div>'
      + '<div class="conf-method">' + (d.delivery === 'expedited' ? 'Expedited, 3&ndash;4 business days' : 'Standard, 6&ndash;10 business days') + '</div>';
  }
  function fallback(){
    listEl.innerHTML = '<p class="conf-note">Your payment was received. We could not load your item list just now. Your order number is shown above.</p>';
    totEl.innerHTML = ''; shipEl.innerHTML = 'Your delivery details are on your payment receipt.';
  }
  var params = new URLSearchParams(window.location.search), orderId = '', orderKey = '';
  try { orderId = params.get('X-orderId') || params.get('orderId') || localStorage.getItem('is_pending_order') || ''; orderKey = localStorage.getItem('is_pending_key') || ''; } catch (e) {}
  document.getElementById('cf-date').textContent = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  if (!orderId) { numEl.textContent = ''; fallback(); return; }
  numEl.textContent = '#' + orderId;
  try {
    var em = localStorage.getItem('is_last_email'), flag = 'is_conf_' + orderId;
    if (em && !localStorage.getItem(flag)) {
      localStorage.setItem(flag, '1');
      fetch('https://a.klaviyo.com/client/events/?company_id=UFRYNs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'revision': '2023-02-22' },
        body: JSON.stringify({ data: { type: 'event', attributes: { metric: { data: { type: 'metric', attributes: { name: 'Purchase Confirmed' } } }, profile: { data: { type: 'profile', attributes: { email: em } } }, properties: { orderId: orderId }, time: new Date().toISOString() } } }) }).catch(function(){});
    }
  } catch (e) {}
  var load = function(attempt){
    fetch('/.netlify/functions/get-order?orderId=' + encodeURIComponent(orderId) + '&k=' + encodeURIComponent(orderKey))
      .then(function(res){ if (!res.ok) throw new Error('lookup failed'); return res.json(); })
      .then(function(d){
        var first = (d.shipTo && d.shipTo.firstName) || '';
        document.getElementById('cf-title').textContent = first ? 'Thank you, ' + first + '. Your order is in.' : 'Thank you. Your order is in.';
        if (d.placedAt) { var dt = new Date(d.placedAt); if (!isNaN(dt)) document.getElementById('cf-date').textContent = dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
        listEl.innerHTML = (d.items && d.items.length ? d.items.map(itemRow).join('') : '<p class="conf-note">Your order details will appear on your payment receipt.</p>');
        totEl.innerHTML = d.pricing ? totals(d.pricing) : '';
        ship(d);
        if (d.vipMember) document.getElementById('cf-vip').hidden = false;
      })
      .catch(function(err){
        console.error('[order-confirmation] could not load order (try ' + attempt + '):', err);
        if (attempt < 3) setTimeout(function(){ load(attempt + 1); }, 1500 * attempt); else fallback();
      });
  };
  load(1);
})();
</script>"""

h = HEAD
h = re.sub(r"<title>.*?</title>", "<title>Order confirmed | Intimacy Supply</title>", h, 1, re.S)
h = re.sub(r'<meta name="description" content=".*?">', '<meta name="description" content="Your Intimacy Supply order confirmation.">', h, 1)
h = re.sub(r'<link rel="canonical" href=".*?">', '<link rel="canonical" href="https://intimacysupply.com/order-confirmation">', h, 1)
h = h.replace("</head>", '<meta name="robots" content="noindex, nofollow"></head>', 1)
out = h + '<main id="main">' + BODY + SCRIPT + TAIL
open(os.path.join(ROOT, "order-confirmation.html"), "w", encoding="utf-8").write(out)
print("order-confirmation.html:", len(out), "bytes")
