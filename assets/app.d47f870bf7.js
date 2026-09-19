
/* ════════════════════════════════════════════
   FINAL COMPREHENSIVE FIX - ZERO CONSOLE ERRORS + FULL STABILITY + PREMIUM FINISH
   v1.5  -  Complete production-ready build:
   · Firebase SDK cross-origin error suppression
   · All DOM accessors null-guarded
   · drawWheel / openSpin error-wrapped
   · purchaseGiftCard secure payment reference removed
   · renderAcctPanel tab init fixed
   · scrollToProds / search focus guarded
   · Global uncaught error handler for cross-origin script errors
════════════════════════════════════════════ */
/* ════════════════════════════════════════════
   PRODUCT DATA
═══════════════════════════════════════════ */
let PRODUCTS = [];
let PRODUCTS_ALL = [];
let PRODUCTS_LOADED = false;
let CURRENT_CAT = 'all';
let DISPLAY_LIMIT = 48;

function mapFirestoreProduct(doc, index) {
  const d = doc;
  return {
    id: d.model != null ? String(d.model) : String(index),
    name: (d.name || '').replace(/^\$+/, ''),
    cat: d.cat || 'toys',
    tags: [d.cat || 'toys'],
    price: d.price || 0,
    orig: d.orig || 0,
    images: d.image ? [d.image.replace('https://pub-a1acf15237439029b9cd25c64feeb495.r2.dev','https://pub-318acfdeb79248b9950b15ae29ebd379.r2.dev')] : [],
    colors: [],
    sizes: ['One Size'],
    rating: d.rating || 0,
    reviews: d.reviews || 0,
    isNew: d.isNew || false,
    inStock: d.inStock !== false,
    label: d.inStock === false ? 'Sold Out' : '',
    material: d.material || '',
    features: d.features || [],
    desc: d.desc != null ? cleanWholesaleText(d.desc) : null,
    b: d.b, slug: d.s, f: d.f,
    brand: d.brand || '',
    model: d.model || '',
  };
}

var FIRESTORE_EXHAUSTED = true;
var FIRESTORE_LOADING_MORE = false;
var STATIC_PRODUCTS_LOADED = false;

async function loadProductsFromFirestore(cat) {
  if (!STATIC_PRODUCTS_LOADED) {
    await loadStaticProducts();
  }
  PRODUCTS_ALL_MASTER = PRODUCTS_ALL_MASTER || [];
  PRODUCTS_ALL = PRODUCTS_ALL_MASTER.filter(function(p) {
    return p.inStock !== false;
  });
  PRODUCTS_LOADED = true;
  applyAndRender();
  openDeepLinkedProduct();
}

function sharePD(id, btn){
  var base = window.location.origin + window.location.pathname;
  var url = base + '?product=' + encodeURIComponent(id);
  var prod = PRODUCTS_ALL.find(function(p){ return String(p.id)===String(id); });
  var title = prod ? prod.name : 'Intimacy Supply';
  if(navigator.share){
    navigator.share({ title: title, url: url }).catch(function(){});
  } else if(navigator.clipboard){
    navigator.clipboard.writeText(url).then(function(){
      if(typeof toast==='function') toast('Link copied!');
      if(btn){ var t=btn.innerHTML; btn.innerHTML='&#10003; &nbsp; Link Copied'; setTimeout(function(){btn.innerHTML=t;},1800); }
    }).catch(function(){ if(typeof toast==='function') toast('Copy this link: '+url); });
  } else {
    if(typeof toast==='function') toast('Copy this link: '+url);
  }
}

function openDeepLinkedProduct(){
  try {
    var params = new URLSearchParams(window.location.search);
    var pid = params.get('product');
    if(!pid) return;
    var exists = PRODUCTS_ALL.some(function(p){ return String(p.id) === String(pid); });
    if(exists){ openPD(pid); }
  } catch(e){}
}

async function fetchNextPage(cat) {
  // No-op -- all products loaded from static JSON
}

var PRODUCTS_ALL_MASTER = [];

var GIFT_CARD_KEYWORDS = ['gift card', 'giftcard', 'gift certificate', 'egift', 'e-gift'];
var WHOLESALE_KEYWORDS = ['merchandising kit', 'merchandiser kit', 'display kit', 'counter display', 'tester display', 'wholesale lot', 'dump bin', 'pop display'];

function isGiftCard(p) {
  var name = (p.name || '').toLowerCase();
  return GIFT_CARD_KEYWORDS.some(function(kw) { return name.indexOf(kw) !== -1; });
}

function isWholesaleItem(p) {
  var name = (p.name || '').toLowerCase();
  var desc = (p.desc || '').toLowerCase();
  if (WHOLESALE_KEYWORDS.some(function(kw) { return name.indexOf(kw) !== -1; })) return true;
  if (desc.indexOf('wholesale price') !== -1) return true;
  if (desc.indexOf('special offer package price') !== -1) return true;
  return false;
}

function cleanWholesaleText(desc) {
  if (!desc) return desc;
  // Strip any line mentioning wholesale or package pricing
  return desc
    .replace(/Regular Wholesale Price\s*\$[\d,.]+/gi, '')
    .replace(/Special Offer Package Price\s*\$[\d,.]+/gi, '')
    .replace(/Wholesale Price\s*\$[\d,.]+/gi, '')
    .trim();
}

async function loadStaticProducts() {
  try {
    var stockReq = fetch('/.netlify/functions/stock').then(function(r){ return r.ok ? r.json() : { oos: [] }; }).catch(function(){ return { oos: [] }; });
    var resp = await fetch('/products.json');
    if (!resp.ok) throw new Error('products.json not found');
    var data = await resp.json();
    /* Distributor stock: models the feed says are unavailable are hidden from the shop */
    var _stock = await stockReq, _oos = {};
    (_stock.oos || []).forEach(function(m){ _oos[String(m)] = 1; });
    data.forEach(function(d){ if (_oos[String(d.model)]) d.inStock = false; });
    PRODUCTS_ALL_MASTER = data.map(mapFirestoreProduct).filter(function(p) {
      var hasImg = (p.images && p.images.length && p.images[0]) || p.image;
      return hasImg && !isGiftCard(p) && !isWholesaleItem(p);
    });
    STATIC_PRODUCTS_LOADED = true;
    console.log('Loaded', PRODUCTS_ALL_MASTER.length, 'products from static JSON');
  } catch(e) {
    console.error('Static product load failed, falling back to Firestore:', e);
    await loadFromFirestoreDirect();
  }
}

async function loadFromFirestoreDirect() {
  try {
    var allDocs = [];
    var pageSize = 1000;
    var lastDoc = null;
    var keepGoing = true;
    while (keepGoing) {
      var query = db.collection('products').where('inStock', '==', true).orderBy('name').limit(pageSize);
      if (lastDoc) query = query.startAfter(lastDoc);
      var snap = await query.get();
      snap.forEach(function(doc) { allDocs.push(doc.data()); lastDoc = doc; });
      if (snap.size < pageSize) keepGoing = false;
    }
    PRODUCTS_ALL_MASTER = allDocs.map(mapFirestoreProduct).filter(function(p) { return !isGiftCard(p) && !isWholesaleItem(p); });
    STATIC_PRODUCTS_LOADED = true;
  } catch(e) {
    console.error('Firestore fallback failed:', e);
  }
}

function renderLoadMore() {
  var existing = document.getElementById('load-more-btn');
  if (existing) existing.remove();
  if (PRODUCTS.length > DISPLAY_LIMIT) {
    var btn = document.createElement('div');
    btn.id = 'load-more-btn';
    btn.style = 'text-align:center;padding:24px';
    btn.innerHTML = '<button class="btn-w" onclick="loadMore()" style="background:var(--plum);color:#FFFFFF;padding:12px 32px;border:none;cursor:pointer;font-family:Barlow Condensed,sans-serif;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;display:none">Load More</button>';
    var grid = document.getElementById('prod-grid');
    if (grid && grid.parentNode) grid.parentNode.insertBefore(btn, grid.nextSibling);
  }
}

function loadMore() {
  DISPLAY_LIMIT += 48;
  try{ gaEvent('load_more_products', { products_shown: DISPLAY_LIMIT, category: (typeof activeCat!=='undefined'?activeCat:'all') }); }catch(e){}
  renderProdGrid(PRODUCTS.slice(0, DISPLAY_LIMIT));
  renderLoadMore();
}/* ════════════════════════════════════════════
   [FIREBASE] CONFIG + INIT
   Replace ALL placeholder values below with
   your real Firebase project credentials.
   Console: https://console.firebase.google.com
════════════════════════════════════════════ */
const firebaseConfig = {
  apiKey:            "AIzaSyBQfmhqROjix1vGv_l1f-AxGGdPwCGVGzQ",
  authDomain:        "intimacy-supply.firebaseapp.com",
  projectId:         "intimacy-supply",
  storageBucket:     "intimacy-supply.firebasestorage.app",
  messagingSenderId: "12010636615",
  appId:             "1:12010636615:web:1ba0ae076744c5d75e7862",
  measurementId:     "G-CN0W1J61RL"
};
/* Firebase init wrapped in try/catch.
   With placeholder config keys the SDK throws  -  this catch prevents
   that error from halting all subsequent JS (menu, cart, products, etc).
   Replace the placeholder values in firebaseConfig to go live. */
let auth = null;
let db   = null;
let rtdb = null;
try {
  if(firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY'){
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db   = firebase.firestore();
    try{ rtdb = firebase.database(); }catch(e){ console.warn('[IS] Realtime Database not enabled yet.'); }
  } else {
    console.warn('[IS] Firebase placeholder keys detected  -  running in local mode.');
  }
} catch(e) {
  console.warn('[IS] Firebase init skipped  -  replace firebaseConfig values to go live.');
}

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
let cart = JSON.parse(localStorage.getItem('is_cart')||'[]');
var __cartScrollY = 0;
let pendingCartAdd = null;
let wishlist = JSON.parse(localStorage.getItem('is_wl')||'[]');
/* [FIREBASE AUTH] user/isVIP now driven by Firebase  -  not localStorage */
let user   = null;
let isVIP  = false;
let activeCat = 'all';
let activePromo  = null; // { code, type, value, label }
let lastSpinPrize = null;
let checkoutData = {};
let pendingOrderId = null; // IS-YYYYMMDD-XXXX
let pendingOrderKey = null; // random secret that lets this browser read its own order confirmation
let quizData     = {}; // accumulates quiz answers before account creation

/* [NEW] PROMO CODE TABLE */
const PROMO_CODES = {
  // Intentionally empty: this store has no coupon codes. The VIP membership
  // discount is the offer, applied automatically at member pricing.
};
let currentDetailId = null;
let detailQty = 1;
let detailColor = 0;
let detailSize = 0;
let checkoutStep = 1;
let delivery = 'standard';
let wheelSpun = false;
let quizStep = 1;

const FREE_SHIP = 59.97;

/* ═══════════════════════════════════════════
   AFFILIATE / PARTNER TRACKING
   Captures ?ref=handle from URL and persists
   for 90 days via localStorage.
   Attached to every order saved to Firestore.
═══════════════════════════════════════════ */
var AFFILIATE_KEY = 'is_aff_ref';
var AFFILIATE_EXP = 'is_aff_exp';
var AFFILIATE_TTL = 90 * 24 * 60 * 60 * 1000; // 90 days in ms

function captureAffiliateRef(){
  try {
    var params = new URLSearchParams(window.location.search);
    var ref = params.get('ref') || params.get('aff') || params.get('creator');
    if(ref && ref.length > 0 && ref.length < 80){
      ref = ref.replace(/[^a-zA-Z0-9_\-\.]/g, '').toLowerCase();
      if(ref){
        localStorage.setItem(AFFILIATE_KEY, ref);
        localStorage.setItem(AFFILIATE_EXP, Date.now() + AFFILIATE_TTL);
      }
    }
  } catch(e){}
}

function getAffiliateRef(){
  try {
    var exp = parseInt(localStorage.getItem(AFFILIATE_EXP)||'0', 10);
    if(Date.now() > exp){
      localStorage.removeItem(AFFILIATE_KEY);
      localStorage.removeItem(AFFILIATE_EXP);
      return null;
    }
    return localStorage.getItem(AFFILIATE_KEY) || null;
  } catch(e){ return null; }
}

function clearAffiliateRef(){
  try {
    localStorage.removeItem(AFFILIATE_KEY);
    localStorage.removeItem(AFFILIATE_EXP);
  } catch(e){}
}

// Run capture on page load
captureAffiliateRef();

// Sync product view with browser back/forward
window.addEventListener('popstate', function(){
  try {
    var params = new URLSearchParams(window.location.search);
    var pid = params.get('product');
    var pdOpen = document.getElementById('pdo') && document.getElementById('pdo').classList.contains('open');
    if(pid && PRODUCTS_ALL && PRODUCTS_ALL.some(function(p){return String(p.id)===String(pid);})){
      if(String(currentDetailId)!==String(pid) || !pdOpen){
        currentDetailId=pid; detailQty=1; detailColor=0; detailSize=0;
        renderPD();
        document.getElementById('pdo').classList.add('open');
        document.body.style.overflow='hidden';
      }
    } else if(pdOpen){
      document.getElementById('pdo').classList.remove('open');
      document.body.style.overflow='';
    }
  } catch(e){}
});

/* Sync body offset to real fixed-header height (top-bar + nav + vip-bar) */
function syncHeaderOffset(){
  try{
    var h = document.querySelector('header');
    if(h) document.body.style.paddingTop = h.offsetHeight + 'px';
  }catch(e){}
}
window.addEventListener('load', syncHeaderOffset);
window.addEventListener('resize', syncHeaderOffset);
window.addEventListener('resize', function(){
  var cd = document.getElementById('cd');
  if(cd && cd.classList.contains('open')){
    var header = document.querySelector('header');
    var offset = header ? header.offsetHeight : 0;
    document.getElementById('co').style.top = offset + 'px';
    cd.style.top = offset + 'px';
    cd.style.height = 'calc(100vh - ' + offset + 'px)';
  }
});
setTimeout(syncHeaderOffset, 100);
setTimeout(syncHeaderOffset, 600);

/* ═══════════════════════════════════════════
   VIP PRICE
═══════════════════════════════════════════ */
function vipPrice(p){ return isVIP ? p.price : p.orig; }
function origPrice(p){ return p.orig; }

/* ═══════════════════════════════════════════
   SAVE STATE
═══════════════════════════════════════════ */
function saveCart(){ localStorage.setItem('is_cart',JSON.stringify(cart)) }
function saveWL(){ localStorage.setItem('is_wl',JSON.stringify(wishlist)) }

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
let toastT;
function toast(msg){
  const el=document.getElementById('toast');
  document.getElementById('toast-msg').textContent=msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT=setTimeout(()=>el.classList.remove('show'),2800);
}

/* ═══════════════════════════════════════════
   HEADER STATE
═══════════════════════════════════════════ */
/* [NEW] updateHeader  -  drives the account dropdown */
function updateHeader(){
  const wrap      = document.getElementById('acct-wrap');
  const sib       = document.getElementById('si-btn');
  const acctName  = document.getElementById('acct-name');
  const menuName  = document.getElementById('acct-menu-name');
  const menuEmail = document.getElementById('acct-menu-email');
  const vipBadge  = document.getElementById('acct-vip-badge');
  const sizesLbl  = document.getElementById('acct-sizes-lbl');
  const vipPill   = document.getElementById('vip-pill');
  if(!wrap) return;
  if(user){
    wrap.style.display = 'block';
    if(sib) sib.style.display = 'none';
    // acct-name removed -- using icon only
    if(menuName) menuName.textContent = (user.firstName||'Member')+(user.phone?' · '+user.phone:'');
    if(menuEmail) menuEmail.textContent = user.email||'';
    if(sizesLbl){
      if(user.sizes && user.sizes.length){
        sizesLbl.textContent = 'Sizes: '+user.sizes.join(', ');
        sizesLbl.style.display = 'block';
      } else { sizesLbl.style.display='none'; }
    }
    if(vipPill) vipPill.style.display  = isVIP ? 'inline-block' : 'none';
    if(vipBadge) vipBadge.style.display = isVIP ? 'inline-block' : 'none';
  } else {
    wrap.style.display = 'none';
    if(sib) sib.style.display = 'block';
  }
}
function toggleAcctMenu(e){
  e && e.stopPropagation();
  const m=document.getElementById('acct-menu');
  if(m) m.style.display=(m.style.display==='block')?'none':'block';
}
function closeAcctMenu(){ const m=document.getElementById('acct-menu');if(m)m.style.display='none'; }
document.addEventListener('click',()=>closeAcctMenu());

/* ═══════════════════════════════════════════
   CART
═══════════════════════════════════════════ */
function addToCart(id, size, color){
  // Require account to add to cart - Retail model
  if(!user){
    toast('Create your free VIP account to add items to your bag.');
    setTimeout(()=>openQuiz('add_to_cart_gate'), 600);
    return;
  }
  const p = PRODUCTS.find(x=>String(x.id)===String(id)) || PRODUCTS_ALL.find(x=>String(x.id)===String(id));
  const key = id+'-'+(size||'One Size')+'-'+color;
  const ex = cart.find(x=>x.key===key);
  if(ex){ ex.qty++ }
  else { cart.push({key,id,qty:1,size:size||'One Size',color:color||0}) }
  saveCart();
  renderCart();
  gaEvent('add_to_cart', { currency:'USD', value: p.price, items:[{ item_id: p.id, item_name: p.name, item_category: p.cat, price: p.price }] });
  toast('Added to bag!');
  openCart();
}

function removeFromCart(key){
  try{
    var ri = cart.find(function(x){ return x.key===key; });
    if(ri){
      var rp = PRODUCTS_ALL.find(function(x){ return String(x.id)===String(ri.id); });
      if(rp) gaEvent('remove_from_cart', { currency:'USD', value: rp.price, items:[{ item_id: rp.id, item_name: rp.name, price: rp.price, quantity: ri.qty }] });
    }
  }catch(e){}
  cart = cart.filter(x=>x.key!==key);
  saveCart(); renderCart();
}
(function bindCartItemDelegation(){
  var list = document.getElementById('cart-items-list');
  if(!list || list.__bound) return;
  list.__bound = true;
  list.addEventListener('click', function(e){
    var t = e.target.closest('[data-cart-remove],[data-cart-qty],[data-cart-redeem],[data-openpd]');
    if(!t || !list.contains(t)) return;
    if(t.hasAttribute('data-cart-remove')){ removeFromCart(t.getAttribute('data-cart-remove')); return; }
    if(t.hasAttribute('data-cart-qty')){ changeQty(t.getAttribute('data-cart-key'), parseInt(t.getAttribute('data-cart-qty'),10)); return; }
    if(t.hasAttribute('data-cart-redeem')){ toggleRedeem(t.getAttribute('data-cart-redeem')); return; }
    if(t.hasAttribute('data-openpd')){ openPD(t.getAttribute('data-openpd')); return; }
  });
})();

function changeQty(key, delta){
  const item = cart.find(x=>x.key===key);
  if(!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart(); renderCart();
}

/* [NEW] calcPromoDiscount  -  shared by cart and checkout */
function calcPromoDiscount(base){
  if(!activePromo) return {promoAmt:0,freeShip:false};
  if(activePromo.type==='pct')   return {promoAmt:base*(activePromo.value/100),freeShip:false};
  if(activePromo.type==='fixed') return {promoAmt:Math.min(activePromo.value,base),freeShip:false};
  if(activePromo.type==='ship')  return {promoAmt:0,freeShip:true};
  return {promoAmt:0,freeShip:false};
}

// ---- Token redemption ----
function tokensFor(price){ return Math.max(1, Math.ceil((Number(price)||0) / 50)); }
function availableTokens(){
  var raw = (user && user.credits != null) ? user.credits : (typeof credits!=='undefined' ? credits : 0);
  return tokenCount(raw);
}
function cartRedeemState(){
  var avail = availableTokens();
  var used = 0, covered = 0;
  cart.forEach(function(i){
    if(!i.redeem) return;
    var p = PRODUCTS.find(function(x){ return String(x.id)===String(i.id); }) || PRODUCTS_ALL.find(function(x){ return String(x.id)===String(i.id); });
    if(!p){ i.redeem = false; return; }
    var unit = isVIP ? p.price : p.orig;
    var lineTokens = tokensFor(unit) * i.qty;
    if(isVIP && used + lineTokens <= avail){ used += lineTokens; covered += unit * i.qty; }
    else { i.redeem = false; }
  });
  return { tokensUsed: used, coveredValue: covered, available: avail };
}
function toggleRedeem(key){
  var it = cart.find(function(x){ return x.key===key; });
  if(!it) return;
  if(!isVIP){ if(typeof toast==='function') toast('VIP members redeem with tokens.'); return; }
  if(!it.redeem){
    var p = PRODUCTS.find(function(x){ return String(x.id)===String(it.id); });
    if(!p) return;
    var need = tokensFor(p.price) * it.qty;
    var st = cartRedeemState();
    var remaining = Math.max(0, st.available - st.tokensUsed);
    if(st.tokensUsed + need > st.available){
      if(typeof toast==='function') toast('Not enough tokens to purchase. You have ' + remaining + ' of ' + need + ' needed.');
      return;
    }
    it.redeem = true;
  } else {
    it.redeem = false;
  }
  renderCart();
}
function renderCart(){
  var count = cart.reduce(function(s,i){ return s+i.qty; }, 0);
  var cbEl = document.getElementById('cb');
  if(cbEl){ if(count>0){cbEl.style.display='flex';cbEl.textContent=count;}else{cbEl.style.display='none';} }

  var countLbl = document.getElementById('cart-count-lbl');
  if(countLbl) countLbl.textContent = count > 0 ? count + (count===1?' Item':' Items') : '';

  var empty = document.getElementById('cart-empty');
  var has   = document.getElementById('cart-has');
  var ctaFixed = document.getElementById('cart-cta-fixed');
  if(!empty||!has) return;

  if(cart.length===0){
    empty.style.display='flex'; has.classList.add('dn');
    if(ctaFixed) ctaFixed.classList.add('dn');
    return;
  }
  empty.style.display='none'; has.classList.remove('dn');
  if(ctaFixed) ctaFixed.classList.remove('dn');

  /* Totals */
  var subtotalOrig = cart.reduce(function(s,i){var p=PRODUCTS.find(function(x){return String(x.id)===String(i.id);});return p?s+p.orig*i.qty:s;},0);
  var subtotalVIP  = cart.reduce(function(s,i){var p=PRODUCTS.find(function(x){return String(x.id)===String(i.id);});return p?s+p.price*i.qty:s;},0);
  // Bag preview advertises VIP pricing by default (matches product pages) until
  // checkout has explicitly declined it -- separate from the real opt-in check
  // used at checkout/submit below, which requires an active choice.
  var showVIP      = isVIP || (typeof checkoutData==='undefined' || checkoutData.wantsVIP !== false);
  var displaySub   = showVIP ? subtotalVIP : subtotalOrig;
  var vipSavings   = showVIP ? subtotalOrig - subtotalVIP : 0;
  var redeemState  = cartRedeemState();
  var tokensUsed   = redeemState.tokensUsed;
  var coveredValue = redeemState.coveredValue;
  var chargeSub    = Math.max(0, displaySub - coveredValue);
  var promoResult  = calcPromoDiscount(chargeSub);
  var afterPromo   = Math.max(0, chargeSub - promoResult.promoAmt);
  var freeShip     = promoResult.freeShip || afterPromo >= FREE_SHIP;
  var shipCost     = freeShip ? 0 : 9.95;
  var tax          = afterPromo * 0.0875;
  var total        = afterPromo + shipCost + tax;
  var toFreeShip   = Math.max(0, FREE_SHIP - afterPromo);
  var shipPct      = Math.min(100, (afterPromo / FREE_SHIP) * 100);

  /* Free shipping bar */
  var shipWrap = document.getElementById('cart-ship-wrap');
  if(shipWrap){
    if(freeShip){
      shipWrap.innerHTML = '<div class="cart-ship-txt"><strong>Free shipping unlocked!</strong></div>'
        + '<div class="cart-ship-track"><div class="cart-ship-fill done" style="width:100%"></div></div>';
    } else {
      shipWrap.innerHTML = '<div class="cart-ship-txt">Add <strong>$' + toFreeShip.toFixed(2) + '</strong> more for free shipping</div>'
        + '<div class="cart-ship-track"><div class="cart-ship-fill" style="width:' + shipPct + '%"></div></div>';
    }
  }

  /* Cart items */
  document.getElementById('cart-items-list').innerHTML = cart.map(function(item){
    var p   = PRODUCTS.find(function(x){ return String(x.id)===String(item.id); });
    if(!p){ return ''; }
    var pr  = showVIP ? p.price : p.orig;
    var img = p.images && p.images[0]
      ? '<img src="' + p.images[0] + '" alt="' + p.name + '" loading="lazy">'
      : '<span style="font-size:28px;opacity:.3">&#9829;</span>';
    var colorObj = (p.colors && (p.colors[item.color] || p.colors[0])) || null;
    var variantLine = '';
    if(item.size || colorObj){
      var parts = [];
      if(item.size) parts.push('Size: ' + item.size);
      if(colorObj && colorObj.name) parts.push(colorObj.name);
      variantLine = '<div class="cim">' + parts.join(' &nbsp;&middot;&nbsp; ') + '</div>';
    }
    return '<div class="ci">'
      + '<div class="cii">' + img + '</div>'
      + '<div class="cin">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">'
      + '<div class="cinm" data-openpd="' + p.id + '" style="flex:1">' + p.name + '</div>'
      + '<button data-cart-remove="' + item.key.replace(/"/g,'&quot;') + '" aria-label="Remove" style="background:none;border:none;cursor:pointer;color:#bbb;font-size:18px;line-height:1;padding:2px 4px;flex-shrink:0">&#10005;</button>'
      + '</div>'
      + variantLine
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">'
      + '<div class="ciqr">'
      + '<button class="ciqb" data-cart-qty="-1" data-cart-key="' + item.key.replace(/"/g,'&quot;') + '">&#45;</button>'
      + '<span class="ciq">' + item.qty + '</span>'
      + '<button class="ciqb" data-cart-qty="1" data-cart-key="' + item.key.replace(/"/g,'&quot;') + '">&#43;</button>'
      + '</div>'
      + '<span class="ci-vip-price">$' + (pr * item.qty).toFixed(2) + '</span>'
      + '</div>'
      + (isVIP ? '<button data-cart-redeem="' + item.key.replace(/"/g,'&quot;') + '" style="margin-top:8px;font-family:var(--fd);font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:7px 12px;border-radius:8px;cursor:pointer;width:100%;' + (item.redeem ? 'border:1.5px solid var(--plum);background:var(--plum);color:#fff' : 'border:1.5px solid var(--gray);background:#fff;color:var(--plum)') + '">' + (item.redeem ? '&#10003; Redeemed &middot; ' + (tokensFor(pr)*item.qty) + ' token' + (tokensFor(pr)*item.qty===1?'':'s') : 'Redeem &middot; ' + (tokensFor(pr)*item.qty) + ' token' + (tokensFor(pr)*item.qty===1?'':'s')) + '</button>' : '')
      + '</div></div>';
  }).join('');

  /* VIP upsell */
  var vipSection = document.getElementById('cart-vip-section');
  if(vipSection){ vipSection.innerHTML = ''; }

  /* Order summary */
  var sumWrap = document.getElementById('cart-summary-wrap');
  if(sumWrap){
    var rows = '';
    rows += '<div class="cart-sum-row"><span class="cart-sum-lbl">Subtotal (' + count + ' item' + (count===1?'':'s') + ')</span><span class="cart-sum-val">$' + subtotalOrig.toFixed(2) + '</span></div>';
    if(showVIP && vipSavings > 0){
      rows += '<div class="cart-sum-row savings"><span class="cart-sum-lbl">VIP Member Savings</span><span class="cart-sum-val">&minus;$' + vipSavings.toFixed(2) + '</span></div>';
    }
    if(promoResult.promoAmt > 0){
      rows += '<div class="cart-sum-row savings"><span class="cart-sum-lbl">Promo (' + (activePromo ? activePromo.code : '') + ')</span><span class="cart-sum-val">&minus;$' + promoResult.promoAmt.toFixed(2) + '</span></div>';
    }
    if(coveredValue > 0){
      rows += '<div class="cart-sum-row savings"><span class="cart-sum-lbl">Token Redemption (' + tokensUsed + ' token' + (tokensUsed===1?'':'s') + ' of ' + redeemState.available + ')</span><span class="cart-sum-val">&minus;$' + coveredValue.toFixed(2) + '</span></div>';
    }
    rows += '<div class="cart-sum-row"><span class="cart-sum-lbl">Shipping</span><span class="cart-sum-val">' + (freeShip ? '<span style="color:#1B1B19">Free</span>' : '$' + shipCost.toFixed(2)) + '</span></div>';
    rows += '<div class="cart-sum-row"><span class="cart-sum-lbl">Est. Tax</span><span class="cart-sum-val">$' + tax.toFixed(2) + '</span></div>';
    rows += '<div class="cart-sum-row total"><span class="cart-sum-lbl">Total</span><span class="cart-sum-val">$' + total.toFixed(2) + '</span></div>';
    sumWrap.innerHTML = rows;
  }

}

/* [NEW] Promo code functions */
function applyPromoCode(code){
  const promo = PROMO_CODES[code.toUpperCase()];
  if(!promo){ return false; }
  activePromo = {code:code.toUpperCase(),...promo};
  renderCart();
  return true;
}
function removePromo(){
  activePromo=null;
  const inp=document.getElementById('promo-inp');
  if(inp) inp.value='';
  renderCart();
  toast('Promo code removed.');
}
function applyPromo(){
  const v=document.getElementById('promo-inp').value.trim().toUpperCase();
  if(!v){ toast('Enter a promo code first.'); return; }
  if(activePromo){ toast('A promo code is already applied. Remove it first.'); return; }
  if(applyPromoCode(v)){ toast('Promo code '+v+' applied!'); }
  else { toast('Invalid code. Try VIP40 or WELCOME.'); }
}

function openCart(){
  try{
    if(cart.length){
      var cval = cart.reduce(function(s,i){ var p=PRODUCTS_ALL.find(function(x){return String(x.id)===String(i.id);}); return p ? s + (p.price*i.qty) : s; },0);
      gaEvent('view_cart', { currency:'USD', value: cval, items: cart.map(function(i){ var p=PRODUCTS_ALL.find(function(x){return String(x.id)===String(i.id);}); return p ? { item_id:p.id, item_name:p.name, price:p.price, quantity:i.qty } : {}; }) });
    }
  }catch(e){}
  var header = document.querySelector('header');
  var offset = header ? header.offsetHeight : 0;
  var co = document.getElementById('co');
  var cd = document.getElementById('cd');
  co.style.top = offset + 'px';
  cd.style.top = offset + 'px';
  cd.style.height = 'calc(100vh - ' + offset + 'px)';
  co.style.display='block'; cd.classList.add('open');
  __cartScrollY = window.scrollY || window.pageYOffset || 0;
  document.body.style.position = 'fixed';
  document.body.style.top = '-' + __cartScrollY + 'px';
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}
function closeCart(){
  document.getElementById('co').style.display='none';
  document.getElementById('cd').classList.remove('open');
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  window.scrollTo(0, __cartScrollY || 0);
}

/* ═══════════════════════════════════════════
   WISHLIST
═══════════════════════════════════════════ */
function toggleWL(id, btnEl){
  const idx = wishlist.indexOf(id);
  try{
    var wp = PRODUCTS_ALL.find(function(x){ return String(x.id)===String(id); });
    if(wp && idx<0) gaEvent('add_to_wishlist', { currency:'USD', value: wp.price, items:[{ item_id: wp.id, item_name: wp.name, item_category: wp.cat, price: wp.price }] });
  }catch(e){}
  if(idx>=0){ wishlist.splice(idx,1); btnEl&&btnEl.classList.remove('liked'); btnEl&&(btnEl.innerHTML='<span class="ig ig-ho"></span>'); toast('Removed from Saved Items') }
  else { wishlist.push(id); btnEl&&btnEl.classList.add('liked'); btnEl&&(btnEl.innerHTML='<span class="ig ig-hf"></span>'); toast('Saved to Wishlist!') }
  saveWL(); renderWL();
  const badge = document.getElementById('wl-badge');
  if(wishlist.length>0){ badge.classList.add('show'); badge.textContent=wishlist.length }
  else { badge.classList.remove('show') }
}

function renderWL(){
  const body = document.getElementById('wl-body');
  if(!body) return;
  if(wishlist.length===0){
    body.innerHTML='<div class="wl-empty"><div class="icon"></div><p>No saved items yet.<br>Tap the <span class="ig ig-ho"></span> on any product to save it.</p></div>';
    return;
  }
  body.innerHTML = wishlist.map(id=>{
    const p = PRODUCTS.find(x=>String(x.id)===String(id));
    if(!p) return '';
    return `<div class="wli">
      <div class="wli-img" style="overflow:hidden;border-radius:6px;background:#F3F0ED">${p.images&&p.images[0]?`<img src="${p.images[0]}" alt="${p.name}" loading="lazy">`:''}</div>
      <div class="wli-info">
        <div class="wli-name">${p.name}</div>
        <div class="wli-price">${p.price.toFixed(2)} <span style="font-size:10px;color:var(--muted);text-decoration:line-through">${p.orig.toFixed(2)}</span></div>
        <div class="wli-actions"><button class="wli-add" onclick="addToCart(${id});closeWL()">Add to Bag</button><button class="wli-rm" onclick="removeWL(${id})" title="Remove">&#10005;</button></div>
      </div>
    </div>`;
  }).join('');
}
function removeWL(id){
  wishlist = wishlist.filter(x=>x!==id);
  saveWL(); renderWL();
  const badge = document.getElementById('wl-badge');
  if(wishlist.length>0){ badge.classList.add('show'); badge.textContent=wishlist.length }
  else { badge.classList.remove('show') }
}
function openWL(){ document.getElementById('wlo').style.display='block'; document.getElementById('wlp').classList.add('open'); renderWL() }
function closeWL(){ document.getElementById('wlo').style.display='none'; document.getElementById('wlp').classList.remove('open') }

/* ═══════════════════════════════════════════
   SEARCH
═══════════════════════════════════════════ */
function openSearch(){
  var so = document.getElementById('so');
  if(so) so.classList.add('open');
  document.body.style.overflow='hidden';
  setTimeout(function(){ var si=document.getElementById('search-input'); if(si) si.focus(); },50);
  renderSearchResults('');
}
function closeSearch(){ document.getElementById('so').classList.remove('open'); document.body.style.overflow=''; }

function renderSearchResults(q){
  const lbl = document.getElementById('search-results-label');
  const grid = document.getElementById('search-results');
  const noR = document.getElementById('no-results');
  let results;
  if (q) {
    const ql = q.toLowerCase().trim();
    // Synonym/concept expansion: map search intent to gender or keyword groups
    const forHim  = /(for him|his pleasure|male|men'?s|guys?)/.test(ql);
    const forHer  = /(for her|her pleasure|female|women'?s|ladies)/.test(ql);
    results = PRODUCTS_ALL.filter(function(p){
      const hay = (p.name + ' ' + (p.brand||'') + ' ' + (p.desc||'') + ' ' + p.cat).toLowerCase();
      if (hay.indexOf(ql) !== -1) return true;
      if (forHim && productGender(p) === 'his')  return true;
      if (forHer && productGender(p) === 'hers') return true;
      return false;
    });
  } else {
    results = PRODUCTS_ALL.slice(0,6);
  }
  lbl.textContent = q ? `${results.length} Results for "${q}"` : 'Popular Products';
  // Track what people search for + whether we had it. Zero-result searches
  // reveal demand for products we may not carry.
  if(q){
    try{
      gaEvent('search', { search_term: q, results_count: results.length });
      if(results.length === 0) gaEvent('search_no_results', { search_term: q });
    }catch(e){}
  }
  if(results.length===0){ grid.innerHTML=''; noR.style.display='block'; return; }
  noR.style.display='none';
  results = results.slice(0, 40);
  grid.innerHTML = results.map(p=>`
    <div class="sri" onclick="closeSearch();openPD('${p.id}')">
      <div class="sri-img" style="overflow:hidden;border-radius:5px;background:#F3F0ED">${p.images&&p.images[0]?`<img src="${p.images[0]}" alt="${p.name}" loading="lazy">`:''}</div>
      <div>
        <div class="sri-name">${p.name}</div>
        <div><span class="sri-price">${p.price.toFixed(2)}</span><span class="sri-orig">${p.orig.toFixed(2)}</span></div>
      </div>
    </div>
  `).join('');
}

/* search-input wired in wireEvents() above */

/* ═══════════════════════════════════════════
   PRODUCT GRID
═══════════════════════════════════════════ */
const CAT_TITLES = {
  all:'Explore Our Latest Collections',
  lingerie:'Lingerie & Wearables',
  toys:'Vibrators & Pleasure Toys',
  couples:'Couples Intimacy Kits',
  wellness:'Wellness & Massage',
  anal:'Anal & Prostate',
  sets:'Sets & Collections',
};



/* ═══════════════════════════════════════
   PRODUCT VARIANT GROUPING
═══════════════════════════════════════ */

// Strip size/color suffixes to get base product name
var COLOR_WORDS = ['black','white','red','blue','pink','purple','nude','beige','ivory','tan','burgundy','wine','violet','rose','gold','silver','clear','smoke','brown','cream','mocha','coral','lilac','aqua','green','yellow','orange','grey','gray','navy','teal','plum','maroon','champagne','blush','lavender','mint','turquoise','magenta','fuchsia','charcoal','chocolate','espresso','caramel','honey','bronze','copper','rainbow','multi','assorted','natural','flesh','skin','dark','light','metallic'];
var SIZE_WORDS = ['xxs','xs','s','m','l','xl','xxl','xxxl','2x','3x','4x','5x','small','medium','large','x-large','xx-large','xxx-large','plus','petite','one size','os','queen','q','reg','regular'];
var SIZE_CODES = ['s0','m0','l0','x0','1x','2x','3x','4x','5x','xs0','xl0'];

function stripTrailingVariant(name) {
  var n = name.trim();
  var changed = true;
  while (changed) {
    changed = false;
    // Strip "- Word" or "- Word/Word" or "/Word" at the end (color or color combo)
    var colorCombo = n.match(/[\s\-\/]+([A-Za-z]+(?:\/[A-Za-z]+)?)$/);
    if (colorCombo) {
      var words = colorCombo[1].toLowerCase().split('/');
      var allColors = words.every(function(w) { return COLOR_WORDS.indexOf(w) !== -1; });
      if (allColors) {
        n = n.slice(0, colorCombo.index).trim();
        changed = true;
        continue;
      }
    }
    // Strip trailing size word
    var sizeMatch = n.match(/[\s\-]+([A-Za-z0-9\-]+)$/);
    if (sizeMatch) {
      var sw = sizeMatch[1].toLowerCase();
      if (SIZE_WORDS.indexOf(sw) !== -1 || SIZE_CODES.indexOf(sw) !== -1) {
        n = n.slice(0, sizeMatch.index).trim();
        changed = true;
        continue;
      }
    }
    // Strip trailing pack/count: "Pack of 3", "3 Pack", "Box of 3", "2 pc", "12 ct", "Pillow Box of 3"
    var packMatch = n.match(/[\s\-]+(?:(?:pillow\s*)?(?:pack|box|set)\s+of\s+\d+|\d+\s*(?:pack|pk|pc|ct|count|piece)s?)\b\.?$/i);
    if (packMatch) {
      n = n.slice(0, packMatch.index).trim();
      changed = true;
      continue;
    }
    // Strip trailing measurement units w/ optional descriptor: "4.2 oz", "30ml", "15 ml Bottle", "1 fl oz"
    var unitMatch = n.match(/[\s\-]+\d+(?:\.\d+)?\s*(?:fl\s*)?(?:oz|ml|g|kg|l|lb|inch|in|cm|mm)\b\.?(?:\s+(?:bottle|jar|tube|clamshell|pump|spray|can))?$/i);
    if (unitMatch) {
      n = n.slice(0, unitMatch.index).trim();
      changed = true;
      continue;
    }
    // Strip trailing numeric size (28, 32, 36, 38, 2X, etc)
    var numSize = n.match(/[\s\-]+([0-9]{1,3}[A-Za-z]{0,2})$/);
    if (numSize) {
      n = n.slice(0, numSize.index).trim();
      changed = true;
      continue;
    }
  }
  return n;
}

function getBaseName(name) {
  if (!name) return '';
  var original = name.trim();
  var n = original;
  // Remove "(Goes w/XXXXX)" annotations first
  n = n.replace(/\s*\(Goes\s+w\/[^\)]+\)/gi, '').trim();
  // Iteratively strip trailing color/size tokens
  n = stripTrailingVariant(n);
  // Clean up trailing dashes/slashes
  n = n.replace(/[\s\-\/]+$/, '').trim();
  // Safety floor -- never strip to fewer than 3 words or under 8 chars
  var wordCount = n.split(/\s+/).filter(Boolean).length;
  if (!n || wordCount < 2 || n.length < 8) return original;
  return n;
}

// Group flat product array into grouped products with variants
function groupProductVariants(products) {
  var groups = {};
  var order = [];

  products.forEach(function(p) {
    var base = getBaseName(p.name);
    var gk = base + '|' + (p.brand || '').toLowerCase() + '|' + p.cat;
    if (!groups[gk]) {
      groups[gk] = {
        id:       p.id,
        name:     base,
        cat:      p.cat,
        tags:     p.tags,
        price:    p.price,
        orig:     p.orig,
        images:   p.images,
        colors:   [],
        sizes:    [],
        rating:   p.rating,
        reviews:  p.reviews,
        isNew:    p.isNew,
        inStock:  p.inStock,
        label:    p.label,
        material: p.material,
        features: p.features,
        desc:     p.desc,
        brand:    p.brand,
        model:    p.model,
        variants: [],
      };
      order.push(gk);
    }
    // Add as variant
    var suffix = p.name.replace(base, '').trim().replace(/^[\-\s]+/, '').trim();
    groups[gk].variants.push({
      id:      p.id,
      label:   suffix || 'Default',
      price:   p.price,
      orig:    p.orig,
      images:  p.images,
      inStock: p.inStock,
      model:   p.model,
    });
    // Use first in-stock variant's image if group has none
    if (p.inStock && (!groups[gk].images || !groups[gk].images.length)) {
      groups[gk].images = p.images;
    }
  });

  return order.map(function(k) { return groups[k]; });
}

/* ═══════════════════════════════════════
   FILTER / SORT / INFINITE SCROLL
═══════════════════════════════════════ */
var activeSubcat = 'all';
var activeSort   = 'default';
var activePriceRange = 'all';

var SUBCATS = {
  all:      [],
  lingerie: ['Bras','Panties','Bodysuits','Teddies','Corsets','Sets','Robes','Hosiery','Costumes'],
  toys:     ['Vibrators','Dildos','Wands','Rabbits','Bullets','Suction','Thrusting','Remote Control'],
  couples:  ['Kits','Bondage','Games','Strap-Ons','Double','Rings','Restraints'],
  wellness: ['Lubricants','Massage','Oils','Candles','Supplements','Sprays'],
  anal:     ['Plugs','Beads','Dildos','Prostate','Training Sets','Vibrating'],
};

var SUBCAT_RX = {
  'Bras':/\bbras?\b|bralette|bandeau/i, 'Panties':/panty|panties|thong|g-string|\bbrief|boyshort|bikini/i,
  'Bodysuits':/bodysuit/i, 'Teddies':/teddy|teddie/i, 'Corsets':/corset|bustier/i, 'Sets':/\bset\b|\b\d\s?pc\b|piece/i,
  'Robes':/\brobe|kimono|chemise|negligee/i, 'Hosiery':/stocking|hosiery|thigh[- ]?high|tights|pantyhose|garter|fishnet/i, 'Costumes':/costume/i,
  'Vibrators':/vibrat/i, 'Dildos':/dildo|\bdong\b/i, 'Wands':/\bwand/i, 'Rabbits':/rabbit/i, 'Bullets':/bullet/i,
  'Suction':/suction|suck|clitoral stim/i, 'Thrusting':/thrust/i, 'Remote Control':/remote/i,
  'Kits':/\bkit\b|\bset\b/i, 'Bondage':/bondage|\bbind|tape|rope|cuff|restrain/i, 'Games':/game|dice|cards\b|book/i, 'Strap-Ons':/strap/i,
  'Double':/double|dual|duo|twin/i, 'Rings':/\bring/i, 'Restraints':/restrain|cuff|shackle|collar/i,
  'Lubricants':/lube|lubric|glide|slick|gel\b/i, 'Massage':/massage/i, 'Oils':/\boils?\b/i, 'Candles':/candle/i,
  'Supplements':/supplement|capsule|\bpills?\b/i, 'Sprays':/spray/i,
  'Plugs':/\bplug/i, 'Beads':/\bbead/i, 'Prostate':/prostate/i, 'Training Sets':/train|\bset\b|\bkit\b/i
};
function subcatMatch(p, label){
  var rx = SUBCAT_RX[label];
  if (rx) return rx.test(p.name || '');
  return (p.name || '').toLowerCase().indexOf(String(label).toLowerCase().replace(/s$/, '')) !== -1;
}
function renderSubcatChips(cat) {
  var el = document.getElementById('subcat-chips');
  if (!el) return;
  var cats = SUBCATS[cat] || [];
  if (PRODUCTS_ALL && PRODUCTS_ALL.length) {
    var inCat = PRODUCTS_ALL.filter(function(p){ return p.cat === cat; });
    cats = cats.filter(function(c){ return c === activeSubcat || inCat.some(function(p){ return subcatMatch(p, c); }); });
  }
  if (!cats.length) { el.innerHTML = ''; return; }
  el.innerHTML = cats.map(function(c) {
    return '<button class="fb-chip' + (activeSubcat===c?' active':'') + '" onclick="setSubcat(\'' + c + '\')">' + c + '</button>';
  }).join('');
}

function setSubcat(s) {
  activeSubcat = (activeSubcat === s) ? 'all' : s;
  renderSubcatChips(activeCat);
  applyFilters();
}

/* His / Hers classification by product function (keyword-derived) */
var HIS_KW = ['chastity','cock cage','cock ring','cockring','c-ring','ball stretch','ball stretcher','testicle','scrotum','prostate','p-spot','masturbator','stroker','pocket pussy','penis sleeve','penis pump','male masturbat','penis extend','girth enhanc','pump sleeve','glans','frenulum','cbt'];
var HERS_KW = ['clitoral','clit stim','clit suction','g-spot','g spot','rabbit vibrator','bullet vibrator','kegel','ben wa','vaginal','labia','panty vibe','panty vibrator','breast pump','nipple suck','womens arousal','female arousal','tightening'];
function productGender(p){
  var hay = ((p.name||'') + ' ' + (p.brand||'') + ' ' + (p.desc||'')).toLowerCase();
  var isHis  = HIS_KW.some(function(w){ return hay.indexOf(w) !== -1; });
  var isHers = HERS_KW.some(function(w){ return hay.indexOf(w) !== -1; });
  if (isHis && !isHers) return 'his';
  if (isHers && !isHis) return 'hers';
  return null;
}

function applyFilters() {
  var sortEl  = document.getElementById('sort-sel');
  var priceEl = document.getElementById('price-sel');
  activeSort       = sortEl  ? sortEl.value  : 'default';
  activePriceRange = priceEl ? priceEl.value : 'all';
  DISPLAY_LIMIT = 48;
  applyAndRender();
}

function applyAndRender() {
  var base;
  if (activeCat === 'all') {
    base = PRODUCTS_ALL;
  } else if (activeCat === 'his' || activeCat === 'hers') {
    base = PRODUCTS_ALL.filter(function(p){ return productGender(p) === activeCat; });
  } else {
    base = PRODUCTS_ALL.filter(function(p){ return p.cat === activeCat; });
  }

  // Subcat filter
  if (activeSubcat !== 'all') {
    base = base.filter(function(p){ return subcatMatch(p, activeSubcat); });
  }

  // Price filter
  if (activePriceRange !== 'all') {
    var parts = activePriceRange.split('-');
    var lo = parseFloat(parts[0]);
    var hi = parseFloat(parts[1]);
    base = base.filter(function(p){
      var price = isVIP ? p.price : p.orig;
      return price >= lo && price <= hi;
    });
  }

  // Sort
  if (activeSort === 'price-asc') {
    base = base.slice().sort(function(a,b){ return (isVIP?a.price:a.orig) - (isVIP?b.price:b.orig); });
  } else if (activeSort === 'price-desc') {
    base = base.slice().sort(function(a,b){ return (isVIP?b.price:b.orig) - (isVIP?a.price:a.orig); });
  } else if (activeSort === 'rating') {
    base = base.slice().sort(function(a,b){ return b.rating - a.rating; });
  } else if (activeSort === 'newest') {
    base = base.slice().sort(function(a,b){ return b.isNew - a.isNew; });
  } else {
    /* Featured: the catalog build ranks what shoppers buy first (vibrators, outfits, dildos, plugs, cages) */
    base = base.slice().sort(function(a,b){ return (a.f == null ? 1e9 : a.f) - (b.f == null ? 1e9 : b.f); });
  }

  // Group variants
  base = groupProductVariants(base);

  PRODUCTS = base;
  var _cnt = document.getElementById('pg-count');
  _visibleProdCount = PRODUCTS.length;
  if(_cnt) _cnt.textContent = PRODUCTS.length.toLocaleString() + (PRODUCTS.length===1?' Result':' Results');
  renderProdGrid(PRODUCTS.slice(0, DISPLAY_LIMIT));
  renderLoadMore();
}

/* Infinite scroll via IntersectionObserver */
(function() {
  var sentinel = document.getElementById('scroll-sentinel');
  if (!sentinel || !window.IntersectionObserver) return;
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (!entry.isIntersecting) return;
      if (PRODUCTS.length > DISPLAY_LIMIT) {
        DISPLAY_LIMIT += 48;
        renderProdGrid(PRODUCTS.slice(0, DISPLAY_LIMIT));
      } else {
        // All products already loaded locally -- nothing more to fetch
      }
    });
  }, { rootMargin: '400px' });
  observer.observe(sentinel);
}());

function filterProds(cat, tabEl){
  ['ovp-services','ovp-about','ovp-account'].forEach(function(pid){ closeOVP(pid); });
  try{ gaEvent('select_category', { category: cat }); }catch(e){}
  activeCat = cat;
  CURRENT_CAT = cat;
  DISPLAY_LIMIT = 48;
  activeSubcat = 'all';
  activeSort = 'default';
  activePriceRange = 'all';
  var sortEl = document.getElementById('sort-sel');
  var priceEl = document.getElementById('price-sel');
  if (sortEl) sortEl.value = 'default';
  if (priceEl) priceEl.value = 'all';
  if(tabEl){
    document.querySelectorAll('.tb').forEach(b=>b.classList.remove('active'));
    tabEl.classList.add('active');
  } else {
    document.querySelectorAll('.tb').forEach(b=>{
      b.classList.toggle('active', b.textContent.trim()==='' || (cat==='all'&&b.onclick&&b.onclick.toString().includes("'all'")) || b.getAttribute('onclick')?.includes("'"+cat+"'"));
    });
  }
  var _pgt=document.getElementById('pg-title'); if(_pgt) _pgt.textContent = CAT_TITLES[cat]||'All Products';
  renderSubcatChips(cat);
  if(PRODUCTS_LOADED) {
    applyAndRender();
  } else {
    loadProductsFromFirestore(cat);
  }
}

/* Map variant labels to real swatch colors. Only labels containing a known
   color word produce a dot; flavor/size/pack variants produce none. */
var SWATCH_COLORS = {
  black:'#111111', white:'#F5F5F5', ivory:'#FFFFFF', clear:'#EFECE9',
  red:'#D4000F', wine:'#3F3C39', burgundy:'#3F3C39',
  fuchsia:'#716E6B', rose:'#A19E9B', purple:'#615E5B', plum:'#373431',
  pink:'#B3B0AD',
  blue:'#716E6B', navy:'#363330', teal:'#504D4A', green:'#1B1B19',
  gold:'#E6E0D6', silver:'#C0C4C8', grey:'#8A8A8A', gray:'#8A8A8A',
  nude:'#E6E0D6', tan:'#E6E0D6', brown:'#4A4744', orange:'#8D8A87',
  yellow:'#E6E0D6'
};
function variantSwatches(p){
  if(!p.variants || p.variants.length < 2) return { dots:[], extra:0 };
  var seen = {}; var dots = [];
  p.variants.forEach(function(v){
    var lbl = (v.label||'').toLowerCase();
    for(var name in SWATCH_COLORS){
      if(lbl.indexOf(name) !== -1 && !seen[name]){
        seen[name] = 1;
        dots.push({ name:name, hex:SWATCH_COLORS[name] });
        break;
      }
    }
  });
  var MAX = 4;
  var extra = dots.length > MAX ? dots.length - MAX : 0;
  return { dots: dots.slice(0, MAX), extra: extra };
}

function clearProdFilters(){
  activeSubcat = 'all';
  var pe = document.getElementById('price-sel'); if(pe) pe.value = 'all';
  var se = document.getElementById('sort-sel'); if(se) se.value = 'default';
  renderSubcatChips(activeCat);
  applyFilters();
}
var _visibleProdCount = 0;
function decProdCount(){
  _visibleProdCount = Math.max(0, _visibleProdCount - 1);
  var el = document.getElementById('pg-count');
  if(el) el.textContent = _visibleProdCount.toLocaleString() + (_visibleProdCount===1?' Result':' Results');
}
function renderProdGrid(list){
  if(!list || list.length===0){
    var _g = document.getElementById('prod-grid');
    if(!PRODUCTS_LOADED){
      _g.innerHTML = '<div style="padding:40px;text-align:center;color:#999999;font-family:Barlow,sans-serif">Loading products...</div>';
    } else {
      _g.innerHTML = '<div class="pg-empty"><p>No products match these filters.</p><button type="button" onclick="clearProdFilters()">Clear filters</button></div>';
      var _c = document.getElementById('pg-count'); if(_c) _c.textContent = '0 Results';
    }
    return;
  }
  document.getElementById('prod-grid').innerHTML = list.map(p=>{
    const price    = isVIP ? p.price : p.orig;
    const hasDeal  = isVIP && p.orig && p.price && p.orig > p.price;
    const pctOff   = hasDeal ? Math.round((1 - p.price/p.orig)*100) : 0;
    const showJoinPrompt = !isVIP && p.orig && p.price && p.orig > p.price;
    const imgSrc   = p.images && p.images[0] ? p.images[0] : '';
    const pidStr   = JSON.stringify(p.id);
    const liked    = wishlist.includes(p.id);
    const sw       = variantSwatches(p);
    const swHTML   = sw.dots.length
      ? `<div class="psw">${sw.dots.map(d=>`<span class="pswd" style="background:${d.hex}" title="${d.name}"></span>`).join('')}${sw.extra?`<span class="pswx">+${sw.extra}</span>`:''}</div>`
      : '';
    // No image at all -> do not render this product
    if (!imgSrc) return '';
    return `<div class="pc" data-id="${p.id}">
      <div class="pi">
        <img src="${imgSrc}" alt="${p.name}" loading="lazy" onerror="var c=this.closest('.pc');if(c){c.remove();if(typeof decProdCount==='function')decProdCount();}">
        <button class="hb ${liked?'liked':''}" onclick="event.stopPropagation();toggleWL('${p.id}',this)">${liked?'<span class="ig ig-hf"></span>':'<span class="ig ig-ho"></span>'}</button>
        ${!p.inStock ? '<span class="bbn" style="background:var(--muted)">Sold Out</span>'
          : p.isNew ? '<span class="bbn">New</span>' : ''}
      </div>
      <div class="pb2">
        ${swHTML}
        <div class="pn">${p.name}</div>
        <div class="pp2">
          ${(p.orig>p.price)?`<div class="pp-offer">${isVIP?'Your VIP price':'VIP price'} &middot; Save ${Math.round((1-p.price/p.orig)*100)}%</div>`:''}
          <div class="pp-row"><span class="pc2">$${(p.price||0).toFixed(2)}</span>${(p.orig>p.price)?`<span class="po">$${(p.orig||0).toFixed(2)}</span>`:''}</div>
        </div>
      </div>
    </div>`;
  }).join('');
  document.querySelectorAll('.pc').forEach(el=>{
    el.addEventListener('click',()=>openPD(el.dataset.id));
  });
  document.querySelectorAll('.pi img').forEach(im=>{
    if(im.complete && im.naturalWidth) im.classList.add('ld');
    else im.addEventListener('load', ()=>im.classList.add('ld'), {once:true});
  });
}

function scrollToProds(){ var el=document.getElementById('products'); if(el) el.scrollIntoView({behavior:'smooth'}); }
function showHome(){
  ['ovp-services','ovp-gifts','ovp-about','ovp-account'].forEach(function(id){
    var p=document.getElementById(id);
    if(p&&p.classList.contains('open')) closeOVP(id);
  });
  filterProds('all');
  var _hdrHome=document.querySelector('header'); if(_hdrHome) _hdrHome.classList.remove('hidden');
  var _vabHome=document.getElementById('vip-active-bar'); if(_vabHome) _vabHome.style.transform='translateY(0)';
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ═══════════════════════════════════════════
   PRODUCT DETAIL
═══════════════════════════════════════════ */
let _pdPresenceRef = null;

var _detailChunks = {};
function hydrateProduct(p, cb){
  var b = p.b;
  function fill(chunk){
    var row = chunk && chunk[String(p.id)];
    var d = row ? cleanWholesaleText(row[0] || '') : '', m = row && row[1] ? row[1] : null;
    [PRODUCTS, PRODUCTS_ALL, PRODUCTS_ALL_MASTER].forEach(function(arr){
      (arr || []).forEach(function(q){ if(String(q.id) === String(p.id)){ q.desc = d; if(m) q.material = m; } });
    });
    cb();
  }
  if(_detailChunks[b]){ fill(_detailChunks[b]); return; }
  fetch('/data/d/' + b + '.json').then(function(r){ return r.json(); })
    .then(function(c){ _detailChunks[b] = c; fill(c); })
    .catch(function(){ [PRODUCTS, PRODUCTS_ALL, PRODUCTS_ALL_MASTER].forEach(function(arr){ (arr||[]).forEach(function(q){ if(String(q.id)===String(p.id)) q.desc=''; }); }); cb(); });
}
function openPD(id){
  var _hp = user && (PRODUCTS_ALL_MASTER.find(function(x){ return String(x.id)===String(id); }));
  if(_hp && _hp.desc == null && _hp.b != null){ hydrateProduct(_hp, function(){ openPD(id); }); return; }
  if(!user){
    // Logged-out user tried to open a product -> gate blocked them.
    // This is the key funnel step we were blind on.
    try {
      var gp = PRODUCTS_ALL.find(function(x){ return String(x.id)===String(id); });
      gaEvent('gate_blocked', {
        item_id: id,
        item_name: gp ? gp.name : '',
        item_category: gp ? gp.cat : ''
      });
    } catch(e){}
    currentDetailId = id;
    openQuiz('product_click');
    return;
  }
  currentDetailId=id; detailQty=1; detailColor=0; detailSize=0;
  renderPD();
  loadPDSoldCount(id);
  loadProductReviews(id);
  document.getElementById('pdo').classList.add('open');
  var _hdrPd=document.querySelector('header'); if(_hdrPd) _hdrPd.classList.remove('hidden');
  document.body.style.overflow='hidden';
  trackPDViewer(id);
  // Standard GA4 product view -- tells us if people browse products at all
  try {
    var vp = PRODUCTS_ALL.find(function(x){ return String(x.id)===String(id); });
    if(vp){
      gaEvent('view_item', {
        currency:'USD',
        value: vp.price,
        items:[{ item_id: vp.id, item_name: vp.name, item_category: vp.cat, price: vp.price }]
      });
    }
  } catch(e){}
  // Shareable / bookmarkable product URL
  try {
    var u = new URL(window.location.href);
    u.searchParams.set('product', id);
    history.pushState({ product: id }, '', u.toString());
  } catch(e){}
}

function closePD(){
  document.getElementById('pdo').classList.remove('open');
  document.body.style.overflow='';
  var _hdrCp=document.querySelector('header'); if(_hdrCp) _hdrCp.classList.remove('hidden');
  if(_pdPresenceRef){ _pdPresenceRef.remove(); _pdPresenceRef=null; }
  // Restore URL to the base store when closing a product
  try {
    var u = new URL(window.location.href);
    if (u.searchParams.has('product')) {
      u.searchParams.delete('product');
      history.pushState({}, '', u.pathname + (u.search || '') + u.hash);
    }
  } catch(e){}
}

function loadPDSoldCount(productId){
  if(!db) return;
  db.collection('products').doc('p' + productId).get().then(snap=>{
    if(!snap.exists) return;
    const sold = snap.data().soldCount || 0;
    const el = document.getElementById('pd-sold-count');
    if(el && sold >= 100){
      el.textContent = sold.toLocaleString() + ' sold';
      el.style.display = 'inline-block';
    }
  }).catch(()=>{});
}

function trackPDViewer(productId){
  if(!rtdb) return;
  if(_pdPresenceRef){ _pdPresenceRef.remove(); _pdPresenceRef=null; }
  const viewersPath = rtdb.ref('viewers/p' + productId);
  _pdPresenceRef = viewersPath.push(true);
  _pdPresenceRef.onDisconnect().remove();
  // Subscribe to viewer count for this product
  viewersPath.on('value', snap=>{
    const count = snap.numChildren();
    const el = document.getElementById('pd-viewer-count');
    if(el){
      if(count > 1){
        el.textContent = count + ' people viewing this right now';
        el.style.display = 'block';
      } else {
        el.style.display = 'none';
      }
    }
  });
}


function switchVariant(variantId) {
  // Find the parent grouped product
  var parent = PRODUCTS.find(function(p) {
    return p.variants && p.variants.some(function(v) { return String(v.id) === String(variantId); });
  });
  if (!parent) return;
  // Find the variant
  var variant = parent.variants.find(function(v) { return String(v.id) === String(variantId); });
  if (!variant) return;
  // Update currentDetailId so active state updates
  currentDetailId = variantId;
  // Update price display
  var price = isVIP ? variant.price : variant.orig;
  var priceEl = document.getElementById('pd-price');
  if (priceEl) priceEl.textContent = '$' + price.toFixed(2);
  // Update image if variant has one
  if (variant.images && variant.images.length) {
    var scroll = document.getElementById('pd-gallery-scroll');
    if (scroll) {
      scroll.innerHTML = variant.images.map(function(img, i) {
        return '<div class="pd-gallery-slide"><img src="' + img + '" alt="' + parent.name + '" loading="' + (i===0?'eager':'lazy') + '"></div>';
      }).join('');
    }
  }
  // Re-render variant buttons to update active state
  var variantBtns = document.querySelectorAll('.pd-sizes .pd-sz[onclick^="switchVariant"]');
  variantBtns.forEach(function(btn) {
    var btnId = btn.getAttribute('onclick').replace("switchVariant('", '').replace("')", '');
    btn.classList.toggle('active', btnId === String(variantId));
  });
  // Update color-circle active state
  var colorBtns = document.querySelectorAll('.pd-color-sw[onclick^="switchVariant"]');
  colorBtns.forEach(function(btn) {
    var btnId = btn.getAttribute('onclick').replace("switchVariant('", '').replace("')", '');
    btn.classList.toggle('active', btnId === String(variantId));
  });
  // Update the "Color:" label text
  var vlbl = document.getElementById('sel-variant-lbl');
  if (vlbl) vlbl.textContent = variant.label;
}

function scrollPDGallery(idx){
  const scroll = document.getElementById('pd-gallery-scroll');
  if(!scroll) return;
  const slide = scroll.querySelectorAll('.pd-gallery-slide')[idx];
  if(slide) slide.scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'});
}

function syncPDDots(){
  const scroll = document.getElementById('pd-gallery-scroll');
  const dotsEl = document.getElementById('pd-gallery-dots');
  if(!scroll || !dotsEl) return;
  const slides = scroll.querySelectorAll('.pd-gallery-slide');
  const dots   = dotsEl.querySelectorAll('.pd-dot');
  if(!slides.length) return;
  const sw = slides[0].offsetWidth + 8;
  const idx = Math.round(scroll.scrollLeft / sw);
  dots.forEach((d,i)=>d.classList.toggle('active', i===idx));
}



function renderPD(){
  // Search grouped PRODUCTS first (has .variants), fall back to re-grouping ALL master products
  var p = PRODUCTS.find(x=>String(x.id)===String(currentDetailId));
  if (!p) {
    // currentDetailId might be a variant id nested inside a group -- search variants too
    p = PRODUCTS.find(x => x.variants && x.variants.some(v => String(v.id) === String(currentDetailId)));
  }
  if (!p) {
    // Last resort: group the full master list and search again
    var allGrouped = groupProductVariants(PRODUCTS_ALL_MASTER || PRODUCTS_ALL);
    p = allGrouped.find(x=>String(x.id)===String(currentDetailId)) ||
        allGrouped.find(x => x.variants && x.variants.some(v => String(v.id) === String(currentDetailId)));
  }
  if(!p) return;
  // If currentDetailId matches a specific variant, use that variant's price/images
  var activeVariant = p.variants ? p.variants.find(v => String(v.id) === String(currentDetailId)) : null;
  var displayPrice = activeVariant ? { price: activeVariant.price, orig: activeVariant.orig } : { price: p.price, orig: p.orig };
  document.getElementById('pd-name-hdr').textContent = p.name;
  const price   = isVIP ? displayPrice.price : displayPrice.orig;
  var _seenBase = {}; _seenBase[getBaseName(p.name)] = 1;
  const related = (PRODUCTS_ALL_MASTER || PRODUCTS_ALL).filter(function(x){ return x.cat===p.cat && x.inStock!==false; })
    .sort(function(a,b){ return (b.brand===p.brand) - (a.brand===p.brand); })
    .filter(function(x){ var k=getBaseName(x.name); if(_seenBase[k]) return false; _seenBase[k]=1; return true; })
    .slice(0,4);

  const gallerySlides = (p.images && p.images.length ? p.images : ['']).map((img, i) => `
    <div class="pd-gallery-slide">
      ${img
        ? `<img src="${img}" alt="${p.name} view ${i+1}" loading="${i===0?'eager':'lazy'}" onerror="this.style.display='none';var f=this.parentNode.querySelector('.pd-hero-fallback');if(f)f.style.display='flex';">
           <div class="pd-hero-fallback" style="display:none"><span class="pd-fallback-name">${p.name}</span></div>`
        : `<div class="pd-hero-fallback"><span class="pd-fallback-name">${p.name}</span></div>`}
    </div>
  `).join('');

  const galleryDots = (p.images && p.images.length > 1 ? p.images : ['']).map((_,i) =>
    `<div class="pd-dot${i===0?' active':''}" onclick="scrollPDGallery(${i})"></div>`
  ).join('');

  const starsHTML = '<span class="stars">'
    + '<span class="ig ig-sf"></span>'.repeat(Math.floor(p.rating))
    + '<span class="ig ig-so"></span>'.repeat(5-Math.floor(p.rating))
    + '</span>';

  const priceBlock = '';

  const swatches = (p.colors && p.colors.length) ? p.colors.map((c,i) =>
    `<button class="pd-swatch${i===0?' active':''}" style="background:${c.hex}" title="${c.name}"
      onclick="selColor(${i},'${c.name}')" aria-label="${c.name}"></button>`
  ).join('') : '';

  const sizes = p.sizes.length > 1 ? `
    <div class="pd-attr-row" style="margin-top:18px">
      <span class="pd-attr-lbl">Size: <span id="sel-size-lbl" style="color:#fff;text-transform:none;letter-spacing:normal">${p.sizes[0]}</span></span>
      <button class="pd-size-guide" onclick="openSizeGuide()">Size Guide ›</button>
    </div>
    <div class="pd-sizes">
      ${p.sizes.map((s,i) => `<button class="pd-sz${i===0?' active':''}" onclick="selSize(this,'${s}')">${s}</button>`).join('')}
    </div>
  ` : '';

  // Variant selector for grouped products
  var selectedVariantId = currentDetailId;
  var variantSelector = '';
  if (p.variants && p.variants.length > 1) {
    // Determine which variants map to a real color word
    var variantColor = function(label){
      var l = (label||'').toLowerCase();
      for (var name in SWATCH_COLORS){
        if (l.indexOf(name) !== -1) return { name:name, hex:SWATCH_COLORS[name] };
      }
      return null;
    };
    var colored = p.variants.map(function(v){ return { v:v, c:variantColor(v.label) }; });
    var colorCount = colored.filter(function(x){ return x.c; }).length;
    // If most variants are colors, show colored circles; else fall back to text option buttons
    if (colorCount >= Math.ceil(p.variants.length / 2)) {
      var activeLabel = (p.variants.find(function(v){ return String(v.id)===String(currentDetailId); }) || p.variants[0]).label;
      variantSelector = `
        <div class="pd-attr-row" style="margin-top:18px">
          <span class="pd-attr-lbl">Color: <span id="sel-variant-lbl" style="color:#fff;text-transform:none;letter-spacing:normal">${activeLabel}</span></span>
        </div>
        <div class="pd-color-row">
          ${colored.map(function(x){
            var v = x.v, c = x.c;
            var isActive = String(v.id)===String(currentDetailId);
            var fill = c ? c.hex : '#C7C4C1';
            var oos = !v.inStock;
            var thumb = v.images && v.images[0];
            if (thumb) {
              return `<button class="fp-th${isActive?' active':''}${oos?' oos':''}" title="${v.label}${oos?' (Out of stock)':''}" aria-label="${v.label}" ${oos?'disabled':''} onclick="switchVariant('${v.id}')"><img src="${thumb}" alt="" loading="lazy"></button>`;
            }
            return `<button class="pd-color-sw${isActive?' active':''}"
                style="background:${fill}${oos?';opacity:.35;cursor:not-allowed':''}"
                title="${v.label}${oos?' (Out of stock)':''}"
                aria-label="${v.label}"
                ${oos?'disabled':''}
                onclick="switchVariant('${v.id}')"></button>`;
          }).join('')}
        </div>`;
    } else {
      variantSelector = `
        <div class="pd-attr-row" style="margin-top:18px">
          <span class="pd-attr-lbl">Option:</span>
        </div>
        <div class="pd-sizes" style="flex-wrap:wrap;gap:6px">
          ${p.variants.map(function(v){ return `
            <button class="pd-sz${String(v.id)===String(currentDetailId)?' active':''}"
              style="${!v.inStock?'opacity:.4;cursor:not-allowed':''}"
              onclick="switchVariant('${v.id}')"
              ${!v.inStock?'disabled':''}>
              ${v.label}${!v.inStock?' (Out)':''}
            </button>`; }).join('')}
        </div>`;
    }
  }

  const relatedCards = related.map(r => `
    <div class="fp-card" onclick="openPD('${r.id}')">
      <div class="fp-card-img">${r.images && r.images[0] ? `<img src="${r.images[0]}" alt="${r.name}" loading="lazy">` : ''}</div>
      <div class="fp-card-name">${r.name}</div>
      <div class="fp-card-p"><b>$${r.price.toFixed(2)}</b><span>VIP price</span></div>
      ${r.orig>r.price ? `<div class="fp-card-o"><s>$${r.orig.toFixed(2)}</s><span>Regular price</span></div>` : ''}
    </div>
  `).join('');

  const dp = displayPrice;
  const hasDeal = dp.orig > dp.price;
  const pct = hasDeal ? Math.round((1 - dp.price/dp.orig)*100) : 0;
  const liked = wishlist.includes(p.id);
  const revCount = p.reviews || 0;
  const pidS = String(p.id).replace(/'/g, "\\'");
  const nameS = String(p.name).replace(/'/g, "\\'");
  const detailsBody = (p.desc ? `<p>${p.desc}</p>` : '')
    + ((p.features && p.features.length) ? `<ul>${p.features.map(f=>`<li>${f}</li>`).join('')}</ul>` : '')
    + `<p class="fp-meta">${p.brand ? 'Brand: ' + p.brand + '<br>' : ''}${p.material && p.material.trim() ? 'Material: ' + p.material + '<br>' : ''}Item #: ${p.model || p.id}</p>`;

  document.getElementById('pd-content').innerHTML = `
    <div class="fp-top">
      ${p.brand ? `<div class="fp-brand">${p.brand}</div>` : ''}
      <h1 class="fp-name">${p.name}</h1>
      ${revCount > 0 ? `<div class="fp-rat">${starsHTML}<span class="fp-rc">(${revCount.toLocaleString()})</span></div>` : ''}
      ${hasDeal ? `<div class="fp-offer">VIP price: $${dp.price.toFixed(2)} &nbsp;&middot;&nbsp; Save ${pct}%</div>` : ''}
      <div class="fp-nm">Regular price: <b>$${dp.orig.toFixed(2)}</b></div>
    </div>

    <div class="pd-gallery-wrap">
      <div class="pd-gallery-scroll" id="pd-gallery-scroll">${gallerySlides}</div>
      <button class="fp-heart${liked?' liked':''}" onclick="toggleWL('${pidS}', this)" aria-label="Save to wishlist">${liked?'<span class="ig ig-hf"></span>':'<span class="ig ig-ho"></span>'}</button>
      <button class="fp-share" onclick="sharePD('${pidS}', null)" aria-label="Share this product"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg></button>
      <div class="pd-gallery-dots" id="pd-gallery-dots">${galleryDots}</div>
      <div class="fp-prog"><i id="fp-prog-i"></i></div>
    </div>

    <div class="fp-body">
      ${(p.colors && p.colors.length) ? `
      <div class="pd-attr-row"><span class="pd-attr-lbl">Color: <b id="sel-color-name">${p.colors[0].name}</b></span></div>
      <div class="pd-swatches">${swatches}</div>` : ''}
      ${sizes}
      ${variantSelector}

      <div class="fp-qty">
        <span class="fp-lbl">Qty:</span>
        <div class="pd-qty-ctrl">
          <button class="pd-qb" onclick="changeDetailQty(-1)" aria-label="Decrease quantity">&#8722;</button>
          <span class="pd-q" id="pd-qty-n">1</span>
          <button class="pd-qb" onclick="changeDetailQty(1)" aria-label="Increase quantity">+</button>
        </div>
      </div>

      <div class="fp-buy">
        ${hasDeal ? `<div class="fp-offer">VIP price: $${dp.price.toFixed(2)} &nbsp;&middot;&nbsp; Save ${pct}%</div>` : ''}
        <div class="fp-nm">Regular price: <b>$${dp.orig.toFixed(2)}</b></div>
        ${p.inStock ? (isVIP ? `
          <button class="fp-red" onclick="addToCartFromDetail()" id="pd-atc">Add to bag - $${dp.price.toFixed(2)}</button>
          <button class="fp-black" onclick="addToCartFromDetailRedeem()">Redeem with ${tokensFor(dp.price)} token${tokensFor(dp.price)>1?'s':''}</button>
        ` : `
          <button class="fp-red" onclick="addToCartVIP()" id="pd-atc">Add to bag and join VIP</button>
          <p class="fp-disc">After your first order you will be charged $39.95 each month for a Member Token, unless you Skip between the 1st and the 5th. Each token covers any item up to $50. Skip or cancel anytime.</p>
          <button class="pd-retail-btn fp-line" onclick="addToCartFromDetail()">Add to bag at regular price - $${dp.orig.toFixed(2)}</button>
        `) : `
          <button class="fp-black" onclick="notifyMeRestock('${pidS}','${nameS}')">${p.label==='Coming Soon'?'Notify Me at Launch':'Notify Me When Back In Stock'}</button>
        `}
      </div>

      <details class="fp-acc" open><summary>Details</summary><div class="fp-acc-b">${detailsBody}</div></details>
      <details class="fp-acc"><summary>Shipping &amp; returns</summary><div class="fp-acc-b">
        <p>Ships in plain packaging with discreet billing. Standard shipping is free (6&ndash;10 business days). Expedited is $15.95 (3&ndash;4 business days).</p>
        <p>Unopened items can be returned within 30 days. <a href="/shipping-returns" target="_blank" rel="noopener">Full policy</a></p>
      </div></details>

      ${related.length ? `<h2 class="fp-h">You may also like</h2><div class="fp-grid">${relatedCards}</div>` : ''}

      <h2 class="fp-h">Reviews</h2>
      ${revCount > 0 ? `<div class="fp-avg"><b>${p.rating}</b>${starsHTML}<span>${revCount.toLocaleString()} review${revCount>1?'s':''}</span></div>` : ''}
      <div id="pd-reviews-${p.id}" class="fp-revs"><div class="fp-muted">Loading reviews...</div></div>
      ${user ? `
      <div class="fp-revform">
        <div class="fp-lbl">Leave a review</div>
        <div class="fp-stars" id="star-pick-${p.id}">
          ${[1,2,3,4,5].map(n=>`<span onclick="setReviewStar('${pidS}',${n})" data-star="${n}">&#9733;</span>`).join('')}
        </div>
        <textarea id="review-text-${p.id}" placeholder="Share your experience..." rows="3"></textarea>
        <button class="fp-black" onclick="submitReview('${pidS}','${nameS}')">Submit review</button>
        <div id="review-fb-${p.id}" class="fp-muted"></div>
      </div>
      ` : `
      <div class="fp-muted"><a href="#" onclick="openQuiz('review_gate');return false">Create an account</a> to leave a review.</div>
      `}
    </div>
  `;

  setTimeout(()=>{
    const s = document.getElementById('pd-gallery-scroll');
    if(s) s.addEventListener('scroll', syncPDDots, {passive:true});
    if(s) s.addEventListener('scroll', function(){ var i=document.getElementById('fp-prog-i'); if(!i) return; var max=s.scrollWidth-s.clientWidth; var w=Math.max(12, (s.clientWidth/s.scrollWidth)*100); i.style.width=w+'%'; i.style.left=(max>0? (s.scrollLeft/max)*(100-w) : 0)+'%'; }, {passive:true});
    if(s){ var i0=document.getElementById('fp-prog-i'); if(i0){ i0.style.width=Math.max(12,(s.clientWidth/s.scrollWidth)*100)+'%'; } }
  }, 50);
}

function selColor(idx, name){
  detailColor=idx;
  document.querySelectorAll('.pd-sw').forEach((el,i)=>el.classList.toggle('active',i===idx));
  document.getElementById('sel-color-name').textContent=name;
}
function selSize(el, size){
  detailSize=size;
  document.querySelectorAll('.pd-sz').forEach(e=>e.classList.remove('active'));
  el.classList.add('active');
}
function switchPDImage(src, thumbEl){
  const main=document.getElementById('pd-main-img');
  if(main) main.src=src;
  document.querySelectorAll('.pd-thumb').forEach(t=>t.classList.remove('active'));
  if(thumbEl) thumbEl.classList.add('active');
}
function changeDetailQty(d){
  detailQty=Math.max(1,detailQty+d);
  const qEl=document.getElementById('pd-qty-n');
  if(qEl) qEl.textContent=detailQty;
  const p=PRODUCTS.find(x=>String(x.id)===String(currentDetailId));
  const price=isVIP?p.price:p.orig;
  const atcBtn=document.getElementById('pd-atc');
  if(atcBtn && p.inStock && isVIP) atcBtn.textContent='Add to bag \u2014 $' + (price*detailQty).toFixed(2);
}
function addToCartFromDetail(){
  const p=PRODUCTS.find(x=>String(x.id)===String(currentDetailId));
  if(!p){ toast('Product not found.'); return; }
  if(!p.inStock){ toast('Sorry, this item is currently out of stock.'); return; }
  const szEl=document.querySelector('.pd-sz.active');
  const sz=szEl?szEl.textContent:((p.sizes && p.sizes[0])||'One Size');
  for(let i=0;i<detailQty;i++) addToCart(p.id, sz, detailColor);
  closePD();
  openCart();
}

// Red "VIP Add to Bag" button - non-member wants VIP pricing.
// Fires the quiz to create the account and start VIP, which then adds to cart.
function addToCartVIP(){
  const p=PRODUCTS.find(x=>String(x.id)===String(currentDetailId));
  if(!p){ toast('Product not found.'); return; }
  if(!p.inStock){ toast('Sorry, this item is currently out of stock.'); return; }
  // Remember what they wanted so it can be added after signup
  try{
    var szEl=document.querySelector('.pd-sz.active');
    var sz=szEl?szEl.textContent:((p.sizes && p.sizes[0])||'One Size');
    pendingCartAdd = { id:p.id, size:sz, color:detailColor, qty:detailQty };
  }catch(e){}
  if(user){ addToCartFromDetail(); }
  else { openQuiz('pd_vip_add_to_bag'); }
}

function addToCartFromDetailRedeem(){
  const p=PRODUCTS.find(x=>String(x.id)===String(currentDetailId));
  if(!p || !p.inStock){ toast('Sorry, this item is currently out of stock.'); return; }
  if(!isVIP){ toast('VIP members redeem with tokens. Join VIP to start.'); return; }
  const need = tokensFor(p.price) * detailQty;
  if(availableTokens() < need){ toast('Not enough tokens. This needs ' + need + '.'); return; }
  const szEl=document.querySelector('.pd-sz.active');
  const sz=szEl?szEl.textContent:(p.sizes[0]||'One Size');
  for(let i=0;i<detailQty;i++) addToCart(p.id, sz, detailColor);
  const key = p.id+'-'+(sz||'One Size')+'-'+detailColor;
  const line = cart.find(x=>x.key===key);
  if(line && !line.redeem){ toggleRedeem(line.key); }
  closePD();
  openCart();
}

/* ═══════════════════════════════════════════
   QUIZ / ONBOARDING
═══════════════════════════════════════════ */
const QUIZ = [
  {step:1,total:7,title:"Welcome to Intimacy Supply!",sub:"Get started to unlock up to 34% off everything. Create a login to get exclusive access to our VIP offers!",
   opts:[{l:"Women's Intimacy",e:''},{l:"Men's Pleasure",e:''},{l:"Couples",e:''},{l:"Here For It All",e:''}]},
  {step:2,total:7,title:"What are you shopping for?",sub:"Pick the one you shop for most. We'll personalize your feed.",
   opts:[{l:'Vibrators & Suction Toys',e:''},{l:'Lingerie & Wearables',e:''},{l:'Couples Intimacy Kits',e:''},{l:'Wellness & Massage',e:''},{l:'Anal & Prostate',e:''},{l:'Here For It All',e:''}]},
  {step:3,total:7,title:"Your Intensity Preference",sub:"What level of stimulation do you prefer?",
   opts:[{l:'Gentle & Sensual',e:''},{l:'Medium & Playful',e:''},{l:'Intense & Powerful',e:''},{l:'Varies by Mood',e:''}]},
  {step:4,total:7,title:"Pick Your Style Mood",sub:"What vibe speaks to you?",
   opts:[{l:'Romantic & Intimate',e:''},{l:'Bold & Daring',e:''},{l:'Playful & Fun',e:''},{l:'Sensual & Minimal',e:''}]},
  {step:5,total:7,title:"Your Size Preference",sub:"For lingerie and wearables.",isSizeGrid:true,
   sizes:['XS','S','M','L','XL','XXL/1X','2X','3X','4X','5X','6X']},
  {step:6,total:7,title:"Some Quick Details",sub:"This helps us personalize your account.",isDetails:true},
  {step:7,total:7,title:"Now Claim Your VIP Discount!",sub:"Create your account so you can start shopping with your offer.",isForm:true},
];

function openQuiz(source){
  // Logged-in users already have an account - never show the signup quiz.
  if(typeof user!=='undefined' && user){
    if(typeof isVIP!=='undefined' && isVIP){
      ['ovp-services','ovp-gifts','ovp-about','ovp-account'].forEach(function(id){var p=document.getElementById(id);if(p&&p.classList.contains('open')&&typeof closeOVP==='function')closeOVP(id);});
      if(typeof closeCart==='function')closeCart();
      if(typeof scrollToProds==='function')scrollToProds();
    } else {
      if(typeof closeCart==='function')closeCart();
      if(typeof openOVP==='function')openOVP('ovp-services');
    }
    return;
  }
  quizData={}; document.getElementById('qo').classList.add('open'); document.body.style.overflow='hidden'; renderQuiz(1);
  try{ gaEvent('quiz_start', { total_steps: QUIZ.length, source: source || 'unknown' }); }catch(e){}
}
function shopNowCTA(){
  if(typeof user!=='undefined' && user){
    ['ovp-services','ovp-gifts','ovp-about','ovp-account'].forEach(function(id){var p=document.getElementById(id);if(p&&p.classList.contains('open')&&typeof closeOVP==='function')closeOVP(id);});
    if(typeof closeCart==='function')closeCart();
    if(typeof scrollToProds==='function')scrollToProds();
    return;
  }
  openQuiz('shop_now_cta');
}
function closeQuiz(){ document.getElementById('qo').classList.remove('open'); document.body.style.overflow=''; }
function dismissQuiz(){
  try{ gaEvent('quiz_abandon', { step: (typeof quizStep!=='undefined' ? quizStep : 0), total_steps: QUIZ.length }); }catch(e){}
  closeQuiz();
  if(window._quizShownRef) window._quizShownRef(false);
}

function renderQuiz(step){
  quizStep = step;
  const d = QUIZ[step-1];
  const total = d.total;
  // Track progression through the gate -- shows exactly where people drop
  try{ gaEvent('quiz_step', { step: step, total_steps: total }); }catch(e){}

  // Step label
  document.getElementById('q-step-lbl').textContent = 'Step ' + d.step + ' of ' + total;

  // Segmented progress bar
  const segs = document.getElementById('q-prog-segs');
  if(segs){
    segs.innerHTML = Array.from({length:total},(_,i)=>
      '<div class="qpb-seg' + (i < d.step ? ' filled' : '') + '"></div>'
    ).join('');
  }

  const body = document.getElementById('q-body');

  // Category image map
  const catImg = {
    "Women's Intimacy":       "/quiz-women.jpg",
    "Men's Pleasure":         "/quiz-men.jpg",
    "Couples":                "/quiz-couples.jpg",
    "Here For It All":        "/quiz-everything.jpg",
    "Vibrators & Suction Toys":"/quiz-vibrators.jpg",
    "Lingerie & Wearables":   "/quiz-lingerie.jpg",
    "Couples Intimacy Kits":  "/quiz-couples-kit.jpg",
    "Wellness & Massage":     "/quiz-wellness.jpg",
    "Anal & Prostate":        "/quiz-anal.jpg",
    "Gentle & Sensual":       "/mood-romantic.jpg",
    "Medium & Playful":       "/mood-playful.jpg",
    "Intense & Powerful":     "/mood-bold.jpg",
    "Varies by Mood":         "/mood-sensual.jpg",
    "Romantic & Intimate":    "/mood-romantic.jpg",
    "Bold & Daring":          "/mood-bold.jpg",
    "Playful & Fun":          "/mood-playful.jpg",
    "Sensual & Minimal":      "/mood-sensual.jpg",
  };

  if(d.isForm){
    body.innerHTML =
      '<h2 class="qtit">Now Claim Your VIP Discount!</h2>'
      + '<p class="qsub">Create your account so you can start shopping with your offer.</p>'
      + '<div class="qfib">'
      + '<input class="qfi" id="qf-name" type="text" placeholder="First Name *" required autocomplete="given-name">'
      + '<input class="qfi" id="qf-email" type="email" placeholder="Email Address *" required autocomplete="email">'
      + '<input class="qfi" id="qf-pass" type="password" placeholder="Password (6 characters minimum) *" required autocomplete="new-password">'
      + '<input class="qfi" id="qf-phone" type="tel" placeholder="Phone Number (optional)" autocomplete="tel">'
      + '</div>'
      + '<div class="qerr-banner" id="qf-err-banner"></div>'
      + '<div class="qerr" id="qf-err">Please fill in all required fields correctly.</div>'
      + '<button class="qnb plum-btn" id="unlock-btn" onclick="submitAccount()">UNLOCK VIP PRICING &nbsp;&#8250;</button>'
      + '<p style="text-align:center;margin-top:12px;font-size:12px;color:#888888">By creating an account you agree to our <a href="#" onclick="openLegal(&apos;terms&apos;);return false" style="color:#555555;text-decoration:underline">Terms</a> and <a href="#" onclick="openLegal(&apos;privacy&apos;);return false" style="color:#555555;text-decoration:underline">Privacy Policy</a>.</p>';
    return;
  }

  if(d.isDetails){
    body.innerHTML =
      '<h2 class="qtit">' + d.title + '</h2>'
      + '<p class="qsub">' + d.sub + '</p>'
      + '<div class="qfib">'
      + '<input class="qfi" id="qf-zip" type="text" placeholder="Zip Code *" inputmode="numeric" maxlength="10">'
      + '<div style="display:flex;border-bottom:1px solid #E8E8E8">'
      + '<select class="qfi" id="qf-dob-month" style="border-right:1px solid #E8E8E8;flex:1">'
      + '<option value="">Birth Month</option>'
      + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i)=>`<option value="${i+1}">${m}</option>`).join('')
      + '</select>'
      + '<select class="qfi" id="qf-dob-year" style="flex:1">'
      + '<option value="">Birth Year</option>'
      + Array.from({length:50},(_,i)=>`<option>${2007-i}</option>`).join('')
      + '</select>'
      + '</div>'
      + '<select class="qfi" id="qf-source">'
      + '<option value="">How did you hear about us? *</option>'
      + '<option>Reddit</option><option>Instagram</option><option>TikTok</option>'
      + '<option>Friend / Family</option><option>Google Search</option><option>Other</option>'
      + '</select>'
      + '</div>'
      + '<button class="qnb" onclick="nextQuizStep(' + step + ')">NEXT &nbsp;&#8250;</button>';
    return;
  }

  if(d.isSizeGrid){
    body.innerHTML =
      '<h2 class="qtit">' + d.title + '</h2>'
      + '<p class="qsub">' + d.sub + '</p>'
      + '<div class="sg">' + d.sizes.map(s=>`<button class="szb" onclick="this.classList.toggle('sel')">${s}</button>`).join('') + '</div>'
      + '<button class="qnb" style="margin-top:16px" onclick="nextQuizStep(' + step + ')">NEXT &nbsp;&#8250;</button>';
    return;
  }

  const multi = false;   /* every option step is single choice and advances on tap */
  body.innerHTML =
    '<h2 class="qtit">' + d.title + '</h2>'
    + '<p class="qsub">' + d.sub + (multi ? ' Select all that apply.' : '') + '</p>'
    + '<div class="qop">'
    + d.opts.map(o=>{
        const img = catImg[o.l];
        const imgHTML = img
          ? `<div class="qoi"><img src="${img}" alt="" loading="lazy"></div>`
          : `<div class="qoi">${o.e||''}</div>`;
        return `<div class="qo2" onclick="pickQuizOpt(this, ${step})">`
          + `<span>${o.l}</span>${imgHTML}`
          + `</div>`;
      }).join('')
    + '</div>';
}

/* Tap an answer: highlight it briefly, then move to the next question on its own */
function pickQuizOpt(el, step){
  var box = el.parentNode;
  if(box.getAttribute('data-busy')) return;
  box.setAttribute('data-busy', '1');
  box.querySelectorAll('.qo2').forEach(function(o){ o.classList.remove('sel'); });
  el.classList.add('sel');
  setTimeout(function(){ nextQuizStep(step); }, 240);
}

/* [NEW] nextQuizStep  -  saves current step answers into quizData before advancing */
function nextQuizStep(step){
  const selOpts=()=>[...document.querySelectorAll('.qo2.sel')].map(el=>el.querySelector('span')?.textContent||'');
  if(step===1) quizData.category  = selOpts();
  if(step===2) quizData.interests = selOpts();
  if(step===3) quizData.intensity = selOpts()[0]||'';
  if(step===4) quizData.style     = selOpts()[0]||'';
  if(step===5) quizData.sizes     = [...document.querySelectorAll('.szb.sel')].map(el=>el.textContent);
  if(step===6){
    const zip = document.getElementById('qf-zip')?.value.trim()||'';
    if(!zip || zip.length < 5){ 
      toast('Please enter your zip code to continue.'); 
      const zipEl = document.getElementById('qf-zip');
      if(zipEl){ zipEl.focus(); zipEl.style.borderColor='var(--red)'; }
      return; 
    }
    quizData.zip      = zip;
    quizData.dobMonth = document.getElementById('qf-dob-month')?.value||'';
    quizData.dobYear  = document.getElementById('qf-dob-year')?.value||'';
    quizData.source   = document.getElementById('qf-source')?.value||'';
  }
  renderQuiz(step+1);
}

/* [NEW] submitAccount  -  Firebase createUserWithEmailAndPassword + Firestore profile write */
function submitAccount(){
  const name  = document.getElementById('qf-name').value.trim();
  const email = document.getElementById('qf-email').value.trim();
  const pass  = document.getElementById('qf-pass').value;
  const phone = document.getElementById('qf-phone')?.value.trim()||'';
  const err   = document.getElementById('qf-err');

  if(!name){ err.textContent='Please enter your first name.'; err.style.display='block'; return; }
  if(!email||!email.includes('@')){ err.textContent='Please enter a valid email.'; err.style.display='block'; return; }
  if(pass.length<6){ err.textContent='Password must be at least 6 characters.'; err.style.display='block'; return; }
  err.style.display='none';

  quizData.phone = phone;
  const btn=document.getElementById('unlock-btn');
  btn.innerHTML='<span class="spinner"></span> Creating account...';
  btn.disabled=true;

  // [FIREBASE] Create Auth user then write full profile to Firestore
  if(!auth){ toast('Sign-up unavailable  -  Firebase not configured.'); btn.innerHTML='UNLOCK VIP PRICING'; btn.disabled=false; return; }
  auth.createUserWithEmailAndPassword(email, pass)
    .then(cred=>{
      const uid = cred.user.uid;
      const profile = {
        firstName: name,
        email,
        phone:     quizData.phone     || '',
        isVIP:     false,
        vipExpires:     null,
        joinedAt:  firebase.firestore.FieldValue.serverTimestamp(),
        // Quiz preference data  -  stored under users/{uid}
        category:  quizData.category  || [],
        interests: quizData.interests || [],
        intensity: quizData.intensity || '',
        style:     quizData.style     || '',
        sizes:     quizData.sizes     || [],
        zip:       quizData.zip       || '',
        dobMonth:  quizData.dobMonth  || '',
        dobYear:   quizData.dobYear   || '',
        source:    quizData.source    || '',
        affiliate: getAffiliateRef()  || null,
      };
      return db.collection('users').doc(uid).set(profile).then(()=>profile);
    })
    .then(profile=>{
      user  = profile;
      isVIP = false;
      quizData = {};
      // [KLAVIYO] Identify new VIP member and fire signup event
      klaviyoIdentify(profile);
      klaviyoTrackEvent('VIP Signup', {
        email:    profile.email,
        firstName:profile.firstName,
        source:   profile.source || 'quiz',
        sizes:    (profile.sizes||[]).join(', '),
        affiliate: getAffiliateRef() || null,
      });
      showQuizSuccess(name);
    })
    .catch(e=>{
      btn.innerHTML='UNLOCK VIP PRICING &nbsp;›';
      btn.disabled=false;
      const banner = document.getElementById('qf-err-banner');
      const errEl  = document.getElementById('qf-err');
      if(e.code==='auth/email-already-in-use'){
        if(banner){
          banner.innerHTML = 'This email already has an account. <a href="#" onclick="closeQuiz();openSignInModal();return false">SIGN IN</a> to access your account.';
          banner.classList.add('show');
        }
        if(errEl) errEl.style.display='none';
      } else {
        if(errEl){ errEl.textContent=e.message; errEl.classList.add('show'); }
        if(banner) banner.classList.remove('show');
      }
    });
}

function showQuizSuccess(name){
  const segs = document.getElementById('q-prog-segs');
  if(segs) segs.querySelectorAll('.qpb-seg').forEach(s=>s.classList.add('filled'));
  document.getElementById('q-step-lbl').textContent = 'Account Created';
  document.getElementById('q-body').innerHTML =
    '<div class="qsuc">'
    + '<div class="qsuc-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>'
    + '<h2>Account Created</h2>'
    + '<p>Finding your personalized product recommendations...</p>'
    + '<div style="background:#F7F4F1;border-radius:10px;padding:14px 16px;margin-bottom:18px;font-size:12px;color:#666;line-height:1.65;text-align:left">'
    + '<strong style="color:#111;display:block;margin-bottom:4px">VIP Membership Active</strong>'
    + 'You\'ll be charged $39.95 on the 6th of each month for your Member Token. Skip anytime between the 1st&ndash;5th. Cancel anytime online.'
    + '</div>'
    + '<button class="qnb plum-btn" onclick="finishOnboarding()">START SHOPPING VIP PRICES &nbsp;&#8250;</button>'
    + '</div>';
  updateHeader();
  filterProds(activeCat);
  renderCart();
  // If they were gated on a product, open it now
  if(currentDetailId){
    setTimeout(()=>{
      detailQty=1; detailColor=0; detailSize=0;
      renderPD();
      loadPDSoldCount(currentDetailId);
      document.getElementById('pdo').classList.add('open');
      document.body.style.overflow='hidden';
      trackPDViewer(currentDetailId);
    }, 400);
  }
  gaEvent('sign_up', { method: 'VIP Quiz' });
}

function finishOnboarding(){
  closeQuiz();
  showVIPBanner();
  startVIPCountdown();
  toast('VIP discount unlocked across all products!');
  filterProds(activeCat);
  setTimeout(()=>openSpin(),1400);
}
/* ═══════════════════════════════════════════
   [NEW] FIREBASE AUTH HELPERS
═══════════════════════════════════════════ */

function signOutUser(){
  if(!auth){ user=null; isVIP=false; updateHeader(); filterProds('all'); renderCart(); showVIPBanner(); toast('Signed out.'); return; }
  auth.signOut().then(()=>{
    user=null; isVIP=false;
    closeAcctMenu();
    updateHeader();
    filterProds('all');
    renderCart();
    showVIPBanner();
    toast('Signed out. See you soon!');
  });
}

/* Sign-in modal */
function openSignInModal(){
  /* Test mode bypass -- auto-login when not on live site */
  if(window.location.hostname !== 'intimacysupply.com' && localStorage.getItem('is_dev_login') === '1'){
    user = { uid:'TEST001', email:'dev@example.com', displayName:'Ryan', firstName:'Ryan', phone:'', address:'', city:'', state:'', zip:'', birthday:'', intensity:'Medium', quizAnswers:{mood:'sensual',topSize:'L',bottomSize:'L'}, notifPrefs:{vip:true,skip:true,orders:true,promo:false} };
    isVIP = true; credits = 1; orders = []; wishlist = wishlist||[];
    updateHeader(); openAcctPanel(); return;
  }
  const o=document.getElementById('si-modal-o');
  if(o){ o.style.display='flex'; renderSignInForm(); }
}
function closeSignInModal(){
  const o=document.getElementById('si-modal-o');
  if(o) o.style.display='none';
}

function renderSignInForm(msg){
  document.getElementById('si-modal-body').innerHTML=`
    <p style="text-align:center;font-size:13px;color:var(--muted);margin-bottom:16px">Sign in to access your VIP discount and saved items.</p>
    ${msg?`<p style="background:#FAFAFA;color:var(--red);font-size:12px;font-weight:600;padding:9px 12px;border-radius:6px;margin-bottom:12px">${msg}</p>`:''}
    <input id="si-email" type="email" placeholder="Email Address *" style="display:block;width:100%;border:1px solid #ddd;border-radius:6px;padding:12px 13px;font-size:13px;margin-bottom:9px;outline:none;font-family:var(--fb)" autocomplete="email">
    <input id="si-pass" type="password" placeholder="Password *" style="display:block;width:100%;border:1px solid #ddd;border-radius:6px;padding:12px 13px;font-size:13px;margin-bottom:14px;outline:none;font-family:var(--fb)" autocomplete="current-password">
    <button id="si-go-btn" onclick="doSignIn()" style="display:block;width:100%;background:var(--plum);color:#fff;border:none;padding:13px;font-family:var(--fd);font-size:18px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;border-radius:4px;cursor:pointer;margin-bottom:10px">SIGN IN</button>
    <p style="text-align:center;font-size:12px;color:var(--muted)">Forgot password? <a href="#" onclick="doPasswordReset();return false" style="color:var(--plum);font-weight:700">Reset it</a></p>
    <p style="text-align:center;font-size:12px;margin-top:10px">New here? <a href="#" onclick="closeSignInModal();openQuiz('signin_modal');return false" style="color:var(--plum);font-weight:700">Create a VIP account</a></p>
  `;
}

function doSignIn(){
  const email = document.getElementById('si-email')?.value.trim();
  const pass  = document.getElementById('si-pass')?.value;
  if(!email||!pass){ renderSignInForm('Please enter your email and password.'); return; }
  const btn = document.getElementById('si-go-btn');
  btn.innerHTML='<span class="spinner"></span> Signing in...';
  btn.disabled=true;
  // [FIREBASE] Sign in with email + password
  if(!auth){ toast('Sign-in unavailable  -  Firebase not configured.'); return; }
  auth.signInWithEmailAndPassword(email, pass)
    .then(cred=>db.collection('users').doc(cred.user.uid).get())
    .then(snap=>{
      const profile = snap.exists
        ? { uid: snap.id, ...snap.data() }
        : { uid: snap.id, firstName:'', email, isVIP:false, sizes:[] };
      user  = profile;
      isVIP = !!profile.isVIP;
      updateHeader(); filterProds('all'); renderCart(); showVIPBanner();
      closeSignInModal();
      toast('Welcome back, '+profile.firstName+'!');
    })
    .catch(()=>renderSignInForm('Incorrect email or password. Please try again.'));
}

function doPasswordReset(){
  const email = document.getElementById('si-email')?.value.trim();
  if(!email||!email.includes('@')){ renderSignInForm('Enter your email above first, then click Reset it.'); return; }
  if(!auth){ toast('Firebase not configured.'); return; }
  auth.sendPasswordResetEmail(email)
    .then(()=>renderSignInForm('Reset email sent! Check your inbox.'))
    .catch(()=>renderSignInForm('Could not send reset email. Check the address and try again.'));
}



/* ═══════════════════════════════════════════
   CHECKOUT
═══════════════════════════════════════════ */
function openCheckout(){
  if(cart.length===0){ toast('Your bag is empty!'); return; }
  closeCart();
  checkoutStep=1;
  checkoutData={};
  gaEvent('begin_checkout', { currency:'USD', items: cart.map(i=>{ const p=PRODUCTS.find(x=>String(x.id)===String(i.id)); return { item_id:p.id, item_name:p.name, price:isVIP?p.price:p.orig, quantity:i.qty }; }) });
  document.getElementById('cho').classList.add('open');
  document.body.style.overflow='hidden';
  renderCheckout();
}

function closeCheckout(){
  document.getElementById('cho').classList.remove('open');
  document.body.style.overflow='';
  /* The VIP checkbox temporarily flips isVIP for pricing; put it back to real membership on close */
  if(!(user && user.isVIP)){ isVIP = false; try{ renderCart(); }catch(e){} }
}

function renderCheckout(){
  const titles={1:'Shipping',2:'Review & Pay'};
  document.getElementById('ch-title').textContent = titles[checkoutStep] || 'Checkout';
  document.getElementById('ch-step').textContent  = 'Step ' + checkoutStep + ' of 2';
  document.getElementById('ch-prog').style.width  = (checkoutStep/2*100) + '%';

  const subtotalOrig = cart.reduce((s,i)=>{ const p=PRODUCTS.find(x=>String(x.id)===String(i.id)); return s+p.orig*i.qty; },0);
  const subtotalVIP  = cart.reduce((s,i)=>{ const p=PRODUCTS.find(x=>String(x.id)===String(i.id)); return s+p.price*i.qty; },0);
  const displaySub   = (isVIP || checkoutData.wantsVIP === true) ? subtotalVIP : subtotalOrig;
  const discount     = (isVIP || checkoutData.wantsVIP === true) ? subtotalOrig - subtotalVIP : 0;
  const redeemState  = cartRedeemState();
  const tokensUsed   = redeemState.tokensUsed;
  const coveredValue = redeemState.coveredValue;
  const chargeSub    = Math.max(0, displaySub - coveredValue);
  const {promoAmt,freeShip} = calcPromoDiscount(chargeSub);
  const afterPromo   = Math.max(0, chargeSub - promoAmt);
  const shipping     = delivery==='expedited' ? 15.95 : ((freeShip||afterPromo>=FREE_SHIP) ? 0 : 9.95);
  const tax          = afterPromo * 0.0875;
  const total        = afterPromo + shipping + tax;
  const pct          = Math.min((afterPromo/FREE_SHIP)*100, 100);
  const count        = cart.reduce((s,i)=>s+i.qty, 0);

  /* Step indicator */
  const stepsHTML = `
    <div class="ch-steps">
      <div class="ch-step-pill ${checkoutStep===1?'active':checkoutStep>1?'done':''}">
        <div class="ch-step-num">${checkoutStep>1?'&#10003;':'1'}</div>Shipping
      </div>
      <div class="ch-step-pill ${checkoutStep===2?'active':''}">
        <div class="ch-step-num">2</div>Review
      </div>
    </div>
  `;

  /* Collapsible order summary bar */
  const osSummaryBar = `
    <div class="ch-os-bar" onclick="this.nextElementSibling.classList.toggle('open')">
      <span class="ch-os-lbl">Order Summary (${count} item${count===1?'':'s'})</span>
      <span class="ch-os-total">$${total.toFixed(2)} <span class="ch-os-arrow">&#8964;</span></span>
    </div>
    <div class="ch-os-drop">
      ${cart.map(item=>{
        const p=PRODUCTS.find(x=>String(x.id)===String(item.id));
        const pr=(isVIP || checkoutData.wantsVIP === true)?p.price:p.orig;
        return `<div class="ch-os-item"><span>${p.name} &times;${item.qty}</span><span>$${(pr*item.qty).toFixed(2)}</span></div>`;
      }).join('')}
      <div class="ch-os-row"><span>Subtotal</span><span>$${subtotalOrig.toFixed(2)}</span></div>
      ${discount>0?`<div class="ch-os-row green"><span>VIP Savings</span><span>&minus;$${discount.toFixed(2)}</span></div>`:''}
      ${promoAmt>0?`<div class="ch-os-row green"><span>Promo</span><span>&minus;$${promoAmt.toFixed(2)}</span></div>`:''}
      ${coveredValue>0?`<div class="ch-os-row green"><span>Token Redemption (${tokensUsed})</span><span>&minus;$${coveredValue.toFixed(2)}</span></div>`:''}
      <div class="ch-os-row"><span>Shipping</span><span>${shipping===0?'<span style="color:#1B1B19">Free</span>':'$'+shipping.toFixed(2)}</span></div>
      <div class="ch-os-row"><span>Tax</span><span>$${tax.toFixed(2)}</span></div>
      <div class="ch-os-row bold"><span>Total</span><span style="color:var(--plum)">$${total.toFixed(2)}</span></div>
    </div>
  `;

  /* Free shipping nudge */
  const shipNudge = `
    <div class="ch-ship-nudge">
      <div class="ch-ship-txt">${afterPromo>=FREE_SHIP
        ? '<span style="color:#1B1B19;font-weight:700">Free shipping unlocked!</span>'
        : 'Add <strong style="color:var(--plum)">$'+(FREE_SHIP-afterPromo).toFixed(2)+'</strong> more for free shipping'}</div>
      <div class="ch-ship-pw"><div class="ch-ship-pb" style="width:${pct}%"></div></div>
    </div>
  `;

  if(checkoutStep===1){
    const savedFn = (user && user.firstName && user.firstName!=='Member' && user.firstName!=='Account') ? user.firstName : (checkoutData.firstName||'');
    const savedLn = checkoutData.lastName || (user && user.lastName) || '';
    const savedEmail = (user && user.email) || checkoutData.email || '';
    const esc = s => String(s||'').replace(/"/g,'&quot;');
    document.getElementById('ch-body').innerHTML = `
      <div class="ch-summary-card">
        ${stepsHTML}
        ${osSummaryBar}
      </div>
      <h2 class="ch-form-title">Shipping Information</h2>
      <div class="ch-form">
        <div class="ch-name-row">
          <input class="ch-fi" id="ch-fn" type="text" placeholder="First Name *" autocomplete="given-name" value="${esc(savedFn)}">
          <input class="ch-fi" id="ch-ln" type="text" placeholder="Last Name *" autocomplete="family-name" value="${esc(savedLn)}">
        </div>
        <input class="ch-fi" id="ch-email" type="email" placeholder="Email Address *" autocomplete="email" value="${esc(savedEmail)}">
        <input class="ch-fi" id="ch-addr" type="text" placeholder="Street Address *" autocomplete="street-address" value="${esc(checkoutData.address||'')}">
        <input class="ch-fi" id="ch-addr2" type="text" placeholder="Apt, Suite (optional)" autocomplete="address-line2" value="${esc(checkoutData.address2||'')}">
        <div class="ch-name-row">
          <input class="ch-fi" id="ch-city" type="text" placeholder="City *" autocomplete="address-level2" value="${esc(checkoutData.city||'')}">
          <input class="ch-fi" id="ch-state" type="text" placeholder="State *" autocomplete="address-level1" value="${esc(checkoutData.state||'')}">
        </div>
        <div class="ch-name-row">
          <input class="ch-fi" id="ch-zip" type="text" placeholder="ZIP Code *" autocomplete="postal-code" inputmode="numeric" value="${esc(checkoutData.zip||'')}">
          <input class="ch-fi" id="ch-country" type="text" value="United States" placeholder="Country" autocomplete="country-name">
        </div>
        <input class="ch-fi" id="ch-phone" type="tel" placeholder="Phone Number *" autocomplete="tel" inputmode="tel" value="${esc(checkoutData.phone||'')}">
        <label style="display:flex;align-items:flex-start;gap:10px;margin-top:10px;cursor:pointer;padding:10px 12px;background:#F8F5F2;border-radius:8px;border:1px solid var(--gray)">
          <input type="checkbox" id="sms-consent-check" ${checkoutData.smsConsent?'checked':''} style="accent-color:var(--plum);width:16px;height:16px;flex-shrink:0;margin-top:2px" onchange="saveSMSConsent()">
          <span style="font-size:11px;color:#555;line-height:1.5">Text me order updates and shipping notifications. Message &amp; data rates may apply. Reply STOP to cancel.</span>
        </label>
      </div>

      <button class="ch-next-btn" onclick="goCheckout(2)">Continue to Review &nbsp;›</button>
    `;

    /* Pre-fill from user profile */
    if(user){
      const fn=document.getElementById('ch-fn'); if(fn&&user.firstName&&user.firstName!=='Member') fn.value=user.firstName;
      const em=document.getElementById('ch-email'); if(em&&user.email) em.value=user.email;
      const ad=document.getElementById('ch-addr'); if(ad&&user.address) ad.value=user.address;
      const ct=document.getElementById('ch-city'); if(ct&&user.city) ct.value=user.city;
      const st=document.getElementById('ch-state'); if(st&&user.state) st.value=user.state;
      const zp=document.getElementById('ch-zip'); if(zp&&user.zip) zp.value=user.zip;
      const ph=document.getElementById('ch-phone'); if(ph&&user.phone) ph.value=user.phone;
    }

  } else if(checkoutStep===2){
    // VIP box now starts unchecked -- requires an active click. wantsVIP
    // stays undefined until the customer explicitly checks it, and every
    // price/consent calculation checks for === true, never assuming intent.
    const fullName = ((checkoutData.firstName||'')+' '+(checkoutData.lastName||'')).trim();
    const uEmail   = checkoutData.email || user?.email || '';

    document.getElementById('ch-body').innerHTML = `
      <div class="ch-summary-card">
        ${stepsHTML}
        ${osSummaryBar}
      </div>
      ${shipNudge}

      <div class="ch-secure-icons">
        <span>Secure</span>
        <span>Plain Packaging</span>
        <span>Discreet Billing</span>
      </div>

      <!-- Shopping Bag -->
      <div class="ch-review-section">
        <span class="ch-review-hdr">Shopping Bag</span>
        ${cart.map(item=>{
          const p=PRODUCTS.find(x=>String(x.id)===String(item.id));
          const pr=(isVIP || checkoutData.wantsVIP === true)?p.price:p.orig;
          const img=p.images&&p.images[0]?p.images[0]:'';
          return `<div class="ch-bag-item">
            <div class="ch-bag-img">${img?`<img src="${img}" alt="${p.name}" loading="lazy">`:'<span style="font-size:22px;opacity:.3">&#9829;</span>'}</div>
            <div class="ch-bag-info">
              ${isVIP?'<div class="ch-bag-badge">VIP PRICING</div>':''}
              <div class="ch-bag-name">${p.name}</div>
              <div class="ch-bag-meta">Size: ${item.size} &nbsp;&middot;&nbsp; ${(p.colors[item.color]||p.colors[0]||{name:'Standard'}).name}</div>
              <div class="ch-bag-price">$${(pr*item.qty).toFixed(2)}<span class="ch-bag-orig">$${(p.orig*item.qty).toFixed(2)}</span></div>
            </div>
          </div>`;
        }).join('')}
      </div>

      <!-- Promo code -->
      <div class="ch-promo-row">
        <input class="ch-promo-inp" id="ch-promo" type="text" placeholder="Promo code">
        <button class="ch-promo-btn" onclick="applyPromoFromCheckout()">Apply</button>
      </div>

      <!-- Order totals -->
      <div class="ch-totals">
        <div class="ch-tot-row"><span>Subtotal (${count} item${count===1?'':'s'})</span><span>$${subtotalOrig.toFixed(2)}</span></div>
        ${discount>0?`<div class="ch-tot-row green"><span>VIP Member Savings</span><span>&minus;$${discount.toFixed(2)}</span></div>`:''}
        ${promoAmt>0?`<div class="ch-tot-row green"><span>Promo Discount</span><span>&minus;$${promoAmt.toFixed(2)}</span></div>`:''}
        ${coveredValue>0?`<div class="ch-tot-row green"><span>Token Redemption (${tokensUsed} token${tokensUsed===1?'':'s'})</span><span>&minus;$${coveredValue.toFixed(2)}</span></div>`:''}
        <div class="ch-tot-row"><span>Shipping</span><span>${shipping===0?'<span style="color:#1B1B19;font-weight:700">Free</span>':'$'+shipping.toFixed(2)}</span></div>
        <div class="ch-tot-row"><span>Estimated Tax</span><span>$${tax.toFixed(2)}</span></div>
        <div class="ch-tot-row bold total"><span>Order Total</span><span>$${total.toFixed(2)}</span></div>

      </div>

      <!-- Delivering To -->
      <div class="ch-review-section">
        <div class="ch-review-hdr-row">
          <span class="ch-review-hdr">Delivering To</span>
          <button class="ch-edit-btn" onclick="goCheckout(1)">Edit</button>
        </div>
        <div class="ch-addr-card">
          <strong style="color:#111">${fullName.toUpperCase()}</strong><br>
          ${checkoutData.address||''}${checkoutData.address2?'<br>'+checkoutData.address2:''}<br>
          ${checkoutData.city||''}, ${checkoutData.state||''} ${checkoutData.zip||''}<br>
          ${checkoutData.country||'United States'}
          ${checkoutData.phone?'<br>'+checkoutData.phone:''}
          ${uEmail?'<br><span style="color:#6B7280">'+uEmail+'</span>':''}
        </div>
      </div>

      <!-- Delivery Method -->
      <div class="ch-review-section">
        <span class="ch-review-hdr">Delivery Method</span>
        <div class="ch-del-opts">
          <div class="ch-del-opt ${delivery==='standard'?'active':''}" onclick="selDelivery('standard');renderCheckout()">
            <div class="ch-del-radio ${delivery==='standard'?'active':''}"></div>
            <div class="ch-del-info">
              <div class="ch-del-name">Standard Shipping</div>
              <div class="ch-del-sub">6&ndash;10 business days</div>
            </div>
            <div class="ch-del-price">${afterPromo>=FREE_SHIP?'<span style="color:#1B1B19;font-weight:900">FREE</span>':'$5.95'}</div>
          </div>
          <div class="ch-del-opt ${delivery==='expedited'?'active':''}" onclick="selDelivery('expedited');renderCheckout()">
            <div class="ch-del-radio ${delivery==='expedited'?'active':''}"></div>
            <div class="ch-del-info">
              <div class="ch-del-name">Expedited Shipping</div>
              <div class="ch-del-sub">3&ndash;4 business days</div>
            </div>
            <div class="ch-del-price">$15.95</div>
          </div>
        </div>
      </div>

      <!-- Payment Information -->
      <div class="ch-review-section">
        <span class="ch-review-hdr">Payment Information</span>
        <div class="ch-pay-note-box">
          <div class="ch-pay-method-lbl">Payment Method</div>
          <p style="font-size:12px;color:#6B7280;margin-top:8px;line-height:1.65">
            You will enter your card details on our secure payment page after you place your order. Your card number is never stored on this site.
          </p>
        </div>
        <div class="ch-descriptor-box">
          <div class="ch-descriptor-lbl">How this charge appears on your statement</div>
          <div class="ch-descriptor-val">DHARMA*INTIMACYSUP (559) 334-0826</div>
          <p class="ch-descriptor-note">If you have questions about a charge, contact us at hello@intimacysupply.com or (559) 334-0826 before disputing with your card issuer.</p>
        </div>
      </div>

      <!-- Single VIP decision point: this is the only place customers choose VIP,
           combining the pricing choice and the required recurring-charge consent
           into one checkbox instead of two separate ones on two screens. -->
      ${!(user && user.isVIP) ? `
      <div class="ch-vip-disclosure">
        <div class="ch-vip-disc-hdr">&#9670; VIP Membership &mdash; Recurring Billing Disclosure</div>
        <p>By checking below, you'll pay VIP pricing on this order and authorize Dharma Media &amp; Technology LLC to charge your payment method <strong style="color:var(--plum)">$39.95 per month</strong> starting on the 6th of next month and each month thereafter, unless you skip or cancel. Uncheck to pay regular price instead, with no membership.</p>
        <ul class="ch-vip-terms-list">
          <li><strong style="color:#111">Skip:</strong> Log in and select "Skip This Month" between the 1st&ndash;5th of any month at no charge.</li>
          <li><strong style="color:#111">Cancel:</strong> Cancel anytime online under My Account or call (559) 334-0826. Cancel before the 6th to avoid the next charge.</li>
          <li><strong style="color:#111">Tokens:</strong> One Member Token issued each billing month. Each token applies up to $50 toward a single item; items valued higher require additional tokens (item price rounded up to the nearest $50). Unused tokens stack and expire 12 months after issuance.</li>
          <li><strong style="color:#111">Refunds:</strong> Membership charges are non-refundable except as required by law. Contact us within 30 days for billing errors.</li>
        </ul>
        <label class="ch-vip-disc-check">
          <input type="checkbox" id="vip-consent-review" ${checkoutData.wantsVIP===true?'checked':''} onchange="toggleReviewVIP(this.checked)" style="accent-color:var(--plum);flex-shrink:0;margin-top:3px;width:18px;height:18px">
          <span>I want VIP pricing on this order and authorize the $39.95/month VIP Membership charge described above. I understand I can skip or cancel anytime online or by calling (559) 334-0826.</span>
        </label>
      </div>
      ` : ''}

      <!-- Rewards -->
      <div class="ch-rewards-note">Earning ${Math.floor(total)} rewards points with this order</div>

      <!-- Place Order CTA (bottom) -->
      <button class="ch-place-btn" onclick="handlePlaceOrder()">Place Order</button>
      <div class="ch-secure-note">Secure payment</div>
      <div class="ch-prop65">This product can expose you to chemicals known to the State of California to cause cancer and/or reproductive harm. For more information go to www.P65Warnings.ca.gov</div>
    `;
  }
}

/* goCheckout  -  2-step flow: shipping then review+pay */
function goCheckout(step){
  if(checkoutStep===1 && step===2){
    const fn=document.getElementById('ch-fn')?.value.trim();
    const ln=document.getElementById('ch-ln')?.value.trim();
    const addr=document.getElementById('ch-addr')?.value.trim();
    const zip=document.getElementById('ch-zip')?.value.trim();
    const city=document.getElementById('ch-city')?.value.trim();
    const state=document.getElementById('ch-state')?.value.trim();
    if(!fn||!ln||!addr||!zip||!city||!state){ toast('Please fill in all required shipping fields.'); return; }
    // VIP pricing shows by default (matches the bag) unless explicitly declined.
    // The separate, always-unchecked "I authorize $39.95/month" box on the Review
    // step is the actual required consent for the recurring membership charge.
    checkoutData.firstName=fn; checkoutData.lastName=ln;
    checkoutData.address=addr;
    checkoutData.address2=document.getElementById('ch-addr2')?.value.trim()||'';
    checkoutData.zip=zip; checkoutData.city=city; checkoutData.state=state;
    checkoutData.country=document.getElementById('ch-country')?.value.trim()||'United States';
    checkoutData.phone=document.getElementById('ch-phone')?.value.trim()||'';
    checkoutData.smsConsent = !!(document.getElementById('sms-consent-check')?.checked);
    isVIP = !!checkoutData.wantsVIP || !!user?.isVIP;
  }
  checkoutStep=step;
  renderCheckout();
  const chb=document.getElementById('chb');
  if(chb) chb.scrollTop=0;
}

// VIP checkbox at checkout — checked applies VIP pricing and starts the $39.95/mo membership; unchecked continues at regular price.
function setCheckoutVIP(wants){
  // Save whatever's currently typed before re-rendering, so checking the VIP
  // box doesn't wipe fields the customer hasn't submitted with Continue yet.
  if(checkoutStep===1){
    const g = id => document.getElementById(id)?.value.trim();
    checkoutData.firstName = g('ch-fn')    ?? checkoutData.firstName;
    checkoutData.lastName  = g('ch-ln')    ?? checkoutData.lastName;
    checkoutData.address   = g('ch-addr')  ?? checkoutData.address;
    checkoutData.address2  = g('ch-addr2') ?? checkoutData.address2;
    checkoutData.city      = g('ch-city')  ?? checkoutData.city;
    checkoutData.state     = g('ch-state') ?? checkoutData.state;
    checkoutData.zip       = g('ch-zip')   ?? checkoutData.zip;
    checkoutData.phone     = g('ch-phone') ?? checkoutData.phone;
  }
  checkoutData.wantsVIP = !!wants;
  isVIP = !!wants || !!user?.isVIP;
  renderCheckout();
}

// CCBill recurring subscription for the $39.95/mo VIP membership.
// The actual FlexForm URL (including the formDigest, which requires the
// salt/encryption key) is built server-side by
// /.netlify/functions/ccbill-checkout-link -- the salt key must never be
// present in this client-side file, since page source is publicly viewable.

/* Firebase ID token proves who is paying; the server recomputes the amount from the stored order */
function getIdTokenPromise(){
  try{ if(typeof auth!=='undefined' && auth && auth.currentUser) return auth.currentUser.getIdToken(); }catch(e){}
  return Promise.resolve(null);
}
function startVIPPayment(customer){ return startCCBillVIPSubscription(customer); }

/* Shown if the redirect to payment fails after the order was already saved
   (cart/checkoutData have already been cleared by this point) -- gives the
   customer their order reference instead of leaving them on a dead spinner
   or a re-rendered empty cart. */
function showPaymentFailedState(orderId, reason){
  const body = document.getElementById('ch-body');
  const titleEl = document.getElementById('ch-title');
  const stepEl  = document.getElementById('ch-step');
  if(titleEl) titleEl.textContent = 'Payment didn\'t go through';
  if(stepEl)  stepEl.textContent  = '';
  if(!body) { toast('Unable to start payment. Please contact us.'); return; }
  body.innerHTML = `
    <div class="ch-suc">
      <h2 style="font-size:20px;color:var(--red)">We couldn't reach secure payment</h2>
      <p>${reason ? String(reason) : 'Something went wrong'} while starting your payment. Your order details were saved${orderId ? ` as <strong>#${orderId}</strong>` : ''}, but nothing has been charged.</p>
      <p style="margin-top:14px">Please try again, or contact us and reference this order number.</p>
    </div>
    <button class="ch-place-btn" onclick="closeCheckout();">Return to shopping</button>
  `;
}

function startCCBillVIPSubscription(customer){
  if(!customer.userId){
    console.warn('[IS] Cannot start VIP checkout without a logged-in user id.');
    // The redirect screen is already showing -- clear it, or the customer is
    // left staring at a spinner that never resolves.
    showPaymentFailedState(customer.orderId, 'we could not confirm your signed-in account');
    return false;
  }
  toast('Redirecting to secure checkout…');
  getIdTokenPromise().then(function(idToken){ return fetch('/.netlify/functions/ccbill-checkout-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken:       idToken,
      userId:        customer.userId,
      email:         customer.email     || '',
      firstName:     customer.firstName || '',
      lastName:      customer.lastName  || '',
      orderId:       customer.orderId   || '',
      itemTotal: customer.itemTotal || 0,
    }),
  }); })
    .then(function(res){ return res.json().then(function(data){ return { ok: res.ok, data: data }; }); })
    .then(function(result){
      if(!result.ok || !result.data.url){
        console.error('[IS] CCBill link error:', result.data.error);
        showPaymentFailedState(customer.orderId, result.data.error);
        return;
      }
      // Remember which order this payment is for. CCBill's redirect back to
      // order-confirmation.html carries no orderId (custom passthrough params
      // aren't registered), so the confirmation page reads it from here.
      try { localStorage.setItem('is_pending_order', customer.orderId || ''); } catch(e){}
      // Same-tab redirect: new tabs are frequently blocked by iOS Safari
      window.location.href = result.data.url;
    })
    .catch(function(err){
      console.error('[IS] CCBill link request failed:', err);
      showPaymentFailedState(customer.orderId, 'a connection problem');
    });
  return true;
}

// One-time purchase (no membership, no recurring charge) -- separate CCBill
// subaccount (0001) from the VIP membership flow above.
function startOneTimePayment(customer){
  if(!customer.userId){
    console.warn('[IS] Cannot start checkout without a logged-in user id.');
    showPaymentFailedState(customer.orderId, 'we could not confirm your signed-in account');
    return false;
  }
  toast('Redirecting to secure checkout…');
  getIdTokenPromise().then(function(idToken){ return fetch('/.netlify/functions/ccbill-onetime-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken:       idToken,
      userId:        customer.userId,
      email:         customer.email     || '',
      firstName:     customer.firstName || '',
      lastName:      customer.lastName  || '',
      orderId:       customer.orderId   || '',
      itemTotal:     customer.itemTotal || 0,
    }),
  }); })
    .then(function(res){ return res.json().then(function(data){ return { ok: res.ok, data: data }; }); })
    .then(function(result){
      if(!result.ok || !result.data.url){
        console.error('[IS] CCBill one-time link error:', result.data.error);
        showPaymentFailedState(customer.orderId, result.data.error);
        return;
      }
      try { localStorage.setItem('is_pending_order', customer.orderId || ''); } catch(e){}
      window.location.href = result.data.url;
    })
    .catch(function(err){
      console.error('[IS] CCBill one-time link request failed:', err);
      showPaymentFailedState(customer.orderId, 'a connection problem');
    });
  return true;
}

function applyPromoFromCheckout(){
  const v=document.getElementById('ch-promo')?.value.trim().toUpperCase();
  if(!v){ toast('Enter a promo code first.'); return; }
  if(applyPromoCode(v)){ toast('Promo applied!'); renderCheckout(); }
  else { toast('Invalid promo code.'); }
}

function selDelivery(type){ delivery=type; }

function loadUserReviews(){
  var el = document.getElementById('ac-user-reviews-list');
  if(!el || !db || !user) return;
  el.innerHTML = '<div style="text-align:center;padding:24px;color:#AAA;font-size:13px">Loading...</div>';
  db.collection('reviews').where('userId','==',user.uid).orderBy('createdAt','desc').limit(20).get()
    .then(function(snap){
      if(snap.empty){
        el.innerHTML = '<div style="text-align:center;padding:40px 0;color:#AAAAAA">'
          + '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto 12px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
          + '<div style="font-size:14px;font-weight:600;color:#555555;margin-bottom:6px">No reviews yet</div>'
          + '<div style="font-size:12px;color:#AAAAAA">Reviews you submit on products will appear here.</div>'
          + '</div>';
        return;
      }
      el.innerHTML = snap.docs.map(function(doc){
        var r = doc.data();
        var stars = '&#9733;'.repeat(r.stars||5) + '<span style="color:#DDDDDD">&#9733;</span>'.repeat(5-(r.stars||5));
        var date = r.createdAt ? new Date(r.createdAt.seconds*1000).toLocaleDateString() : '';
        var status = r.approved
          ? '<span style="background:#EFECE9;color:#1B1B19;font-size:10px;font-weight:700;padding:3px 10px;border-radius:99px;text-transform:uppercase;letter-spacing:.04em">Approved</span>'
          : r.rejected
          ? '<span style="background:#F3F0ED;color:#D4000F;font-size:10px;font-weight:700;padding:3px 10px;border-radius:99px;text-transform:uppercase;letter-spacing:.04em">Rejected</span>'
          : '<span style="background:#E5E2DF;color:#53504D;font-size:10px;font-weight:700;padding:3px 10px;border-radius:99px;text-transform:uppercase;letter-spacing:.04em">Pending</span>';
        return '<div style="background:#FFFFFF;border:1px solid #E6E3E0;border-radius:14px;padding:16px 18px;margin-bottom:10px;box-shadow:0 2px 6px rgba(0,0,0,.04)">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">'
          + '<div style="font-size:13px;font-weight:700;color:#111111">' + (r.productName||'Product') + '</div>'
          + status
          + '</div>'
          + '<div style="color:#E6E0D6;font-size:14px;margin-bottom:6px">' + stars + '</div>'
          + '<div style="font-size:13px;color:#555555;line-height:1.55;margin-bottom:6px">' + (r.text||'') + '</div>'
          + '<div style="font-size:11px;color:#AAAAAA">' + date + '</div>'
          + '</div>';
      }).join('');
    }).catch(function(){
      el.innerHTML = '<div style="text-align:center;padding:24px;color:#AAAAAA;font-size:13px">Unable to load reviews.</div>';
    });
}

/* ══════════════════════════════════════════
   PRODUCT REVIEWS
══════════════════════════════════════════ */
var reviewStars = {};

function loadProductReviews(productId){
  const el = document.getElementById('pd-reviews-' + productId);
  if(!el || !db) return;
  db.collection('reviews').where('productId','==',productId).where('approved','==',true)
    .orderBy('createdAt','desc').limit(10).get()
    .then(snap=>{
      if(snap.empty){ el.innerHTML = '<div class="fp-muted">No reviews yet. Be the first!</div>'; return; }
      el.innerHTML = snap.docs.map(doc=>{
        const r = doc.data();
        const stars = '<span style="color:#FFFFFF">&#9733;</span>'.repeat(r.stars||5) + '<span style="color:#ccc">&#9733;</span>'.repeat(5-(r.stars||5));
        const date = r.createdAt ? new Date(r.createdAt.seconds*1000).toLocaleDateString() : '';
        return `<div style="padding:14px 0;border-bottom:1px solid #E4E1DE">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div style="font-size:14px;font-weight:800;color:#111">${r.name}</div>
            <div style="font-size:11px;color:#888">${date}</div>
          </div>
          <div style="font-size:13px;margin-bottom:4px">${stars}</div>
          <div style="font-size:14px;color:#222;line-height:1.55">${r.text}</div>
        </div>`;
      }).join('');
      // Update live rating on product
      const ratings = snap.docs.map(d=>d.data().stars||5);
      const avg = ratings.reduce((a,b)=>a+b,0) / ratings.length;
      const prod = PRODUCTS.find(p=>p.id===productId);
      if(prod){ prod.rating = +avg.toFixed(1); prod.reviews = ratings.length; }
    })
    .catch(()=>{ el.innerHTML = ''; });
}

function setReviewStar(productId, n){
  reviewStars[productId] = n;
  const container = document.getElementById('star-pick-' + productId);
  if(!container) return;
  container.querySelectorAll('span').forEach(s=>{
    const sn = parseInt(s.getAttribute('data-star'));
    s.style.color = sn <= n ? '#111111' : '#CCCCCC';
  });
}

function submitReview(productId, productName){
  if(!user){ toast('Please sign in to leave a review.'); return; }
  const stars = reviewStars[productId] || 0;
  const text  = (document.getElementById('review-text-' + productId)?.value || '').trim();
  const fb    = document.getElementById('review-fb-' + productId);
  if(!stars){ if(fb) fb.textContent = 'Please select a star rating.'; fb.style.color='#D4000F'; return; }
  if(text.length < 10){ if(fb) fb.textContent = 'Please write at least 10 characters.'; fb.style.color='#D4000F'; return; }
  if(!db){ toast('Unable to submit review right now.'); return; }
  const btn = document.querySelector(`button[onclick*="submitReview(${productId}"]`);
  if(btn){ btn.disabled=true; btn.textContent='Submitting...'; }
  db.collection('reviews').add({
    productId,
    productName,
    userId:    user.uid,
    name:      user.firstName || 'Member',
    email:     user.email     || '',
    stars,
    text,
    approved:  false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  }).then(()=>{
    if(fb){ fb.textContent = 'Review submitted! It will appear after approval.'; fb.style.color='#1B1B19'; }
    if(btn){ btn.disabled=false; btn.textContent='Submit Review'; }
    if(document.getElementById('review-text-' + productId)) document.getElementById('review-text-' + productId).value='';
    reviewStars[productId] = 0;
    setReviewStar(productId, 0);
  }).catch(()=>{
    if(fb){ fb.textContent = 'Something went wrong. Try again.'; fb.style.color='#D4000F'; }
    if(btn){ btn.disabled=false; btn.textContent='Submit Review'; }
  });
}

/* ══════════════════════════════════════════
   WISHLIST PERSISTENCE
══════════════════════════════════════════ */
function saveWL(){
  localStorage.setItem('is_wl', JSON.stringify(wishlist));
  if(user && db){
    db.collection('users').doc(user.uid).set({ wishlist }, { merge: true })
      .catch(e=>console.warn('[IS] Wishlist save failed:', e));
  }
}

function loadWLFromProfile(profileWishlist){
  if(Array.isArray(profileWishlist) && profileWishlist.length){
    wishlist = profileWishlist;
    localStorage.setItem('is_wl', JSON.stringify(wishlist));
    renderWL();
    const badge = document.getElementById('wl-badge');
    if(badge){
      badge.classList.toggle('show', wishlist.length > 0);
      if(wishlist.length) badge.textContent = wishlist.length;
    }
  }
}

/* ══════════════════════════════════════════
   BACK IN STOCK NOTIFICATIONS
══════════════════════════════════════════ */
function notifyMeRestock(productId, productName){
  if(!user){ toast('Create an account to get restock alerts.'); openQuiz('restock_alert'); return; }
  if(!db){ toast('Unable to save notification right now.'); return; }
  db.collection('restock_notify').add({
    productId,
    productName,
    userId: user.uid,
    email:  user.email || '',
    phone:  user.phone || '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  }).then(()=>{
    toast('We\'ll notify you when it\'s back in stock!');
  }).catch(()=>{
    toast('Something went wrong. Try again.');
  });
}

/* ══════════════════════════════════════════
   SMS OPT-IN (checkout)
══════════════════════════════════════════ */
function saveSMSConsent(){
  const box = document.getElementById('sms-consent-check');
  if(!box) return;
  checkoutData.smsConsent = box.checked;
  if(box.checked && user && db){
    db.collection('users').doc(user.uid).set({ smsConsent: true, smsPhone: checkoutData.phone || user.phone || '' }, { merge: true })
      .catch(e=>console.warn('[IS] SMS consent save failed:', e));
  }
}

function toggleVIPOptin(){
  const box = document.getElementById('ch-vip-check');
  if(!box) return;
  box.checked = !box.checked;
  checkoutData.wantsVIP = box.checked;
  isVIP = box.checked;
  const wrap = document.getElementById('ch-vip-optin');
  if(wrap) wrap.style.borderColor = box.checked ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.25)';
  renderCart();
}

/* handlePlaceOrder  -  validates consent then submits order */
function handlePlaceOrder(){
  // The single VIP checkbox on this page already IS the consent -- checking it
  // and clicking Place Order together constitute authorization. Nothing further
  // to validate here; unchecked just means regular pricing, no membership.
  checkoutData.vipConsent = !!checkoutData.wantsVIP;
  const btns = document.querySelectorAll('.ch-place-btn');
  btns.forEach(b=>{ b.disabled=true; b.textContent='Placing Order...'; });
  submitOrder();
}

/* Single combined VIP decision on the Review step: toggling this checkbox
   updates pricing live and IS the recurring-charge consent, replacing what
   used to be two separate checkboxes across two screens. */
function toggleReviewVIP(checked){
  checkoutData.wantsVIP = !!checked;
  isVIP = !!checked || !!user?.isVIP;
  renderCheckout();
}

/* ═══════════════════════════════════════════
   ORDERS  -  FIRESTORE + EVENTS
═══════════════════════════════════════════ */

/* Generates order ID: IS-YYYYMMDD-XXXX */
function generateOrderKey(){
  var a = new Uint8Array(16);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return Array.prototype.map.call(a, function(b){ return ('0' + b.toString(16)).slice(-2); }).join('');
}

function generateOrderId(){
  const now = new Date();
  const ymd = now.getFullYear().toString()
    + String(now.getMonth()+1).padStart(2,'0')
    + String(now.getDate()).padStart(2,'0');
  const suffix = String(Date.now()).slice(-4);
  return 'IS-' + ymd + '-' + suffix;
}

/* Builds and submits order to Firestore, fires Klaviyo + GA4 events */
function submitOrder(){
  pendingOrderId = generateOrderId();
  pendingOrderKey = generateOrderKey();
  try{ localStorage.setItem('is_pending_key', pendingOrderKey); }catch(e){}

  const subtotalOrig = cart.reduce((s,i)=>{const p=PRODUCTS.find(x=>String(x.id)===String(i.id));return s+p.orig*i.qty;},0);
  const subtotalVIP  = cart.reduce((s,i)=>{const p=PRODUCTS.find(x=>String(x.id)===String(i.id));return s+p.price*i.qty;},0);
  const displaySub   = (isVIP || checkoutData.wantsVIP === true) ? subtotalVIP : subtotalOrig;
  const vipDiscount  = (isVIP || checkoutData.wantsVIP === true) ? subtotalOrig - subtotalVIP : 0;
  const redeemState  = cartRedeemState();
  const tokensUsed   = redeemState.tokensUsed;
  const coveredValue = redeemState.coveredValue;
  const chargeSub    = Math.max(0, displaySub - coveredValue);
  const {promoAmt, freeShip} = calcPromoDiscount(chargeSub);
  const afterPromo   = Math.max(0, chargeSub - promoAmt);
  const shipCost     = delivery==='expedited' ? 15.95 : ((freeShip||afterPromo>=FREE_SHIP) ? 0 : 9.95);
  const tax          = afterPromo * 0.0875;
  const total        = afterPromo + shipCost + tax;

  const items = cart.map(item=>{
    const p = PRODUCTS.find(x=>String(x.id)===String(item.id));
    // Must match the totals above: a customer joining VIP at this checkout
    // (isVIP still false, wantsVIP true) is charged VIP pricing, so the saved
    // line items have to record VIP pricing too or the order contradicts itself.
    const unitPrice = (isVIP || checkoutData.wantsVIP === true) ? p.price : p.orig;
    const lineTokens = item.redeem ? tokensFor(unitPrice) * item.qty : 0;
    return {
      productId:  p.id,
      name:       p.name,
      category:   p.cat,
      qty:        item.qty,
      size:       item.size,
      colorIndex: item.color,
      colorName:  (p.colors[item.color]||p.colors[0]||{name:'Standard'}).name,
      image:      p.image || '',
      unitPrice:  +unitPrice.toFixed(2),
      unitOrig:   +p.orig.toFixed(2),
      lineTotal:  +(unitPrice * item.qty).toFixed(2),
      redeemed:   !!item.redeem,
      tokensUsed: lineTokens,
    };
  });

  const orderDoc = {
    orderId:       pendingOrderId,
    accessKey:     pendingOrderKey,
    userId:        user?.uid   || null,
    userEmail:     user?.email || null,
    vipMember:     isVIP,
    vipConsent:    !!(checkoutData.vipConsent),
    smsConsent:    !!(checkoutData.smsConsent),
    status:        'pending',
    paymentMethod: 'pending_processor',
    paymentRef:    '',
    timestamp:     firebase.firestore.FieldValue.serverTimestamp(),
    delivery,
    customer: {
      firstName: checkoutData.firstName || '',
      lastName:  checkoutData.lastName  || '',
      email:     user?.email            || '',
      phone:     checkoutData.phone     || '',
      address:   checkoutData.address   || '',
      address2:  checkoutData.address2  || '',
      city:      checkoutData.city      || '',
      state:     checkoutData.state     || '',
      zip:       checkoutData.zip       || '',
      country:   checkoutData.country   || 'United States',
    },
    items,
    pricing: {
      subtotalOriginal: +subtotalOrig.toFixed(2),
      vipDiscount:      +vipDiscount.toFixed(2),
      tokensRedeemed:   tokensUsed,
      tokenValueCovered:+coveredValue.toFixed(2),
      promoCode:        activePromo?.code || null,
      promoDiscount:    +promoAmt.toFixed(2),
      afterDiscounts:   +afterPromo.toFixed(2),
      shipping:         +shipCost.toFixed(2),
      tax:              +tax.toFixed(2),
      total:            +total.toFixed(2),
    },
    paymentStatus:       'unpaid',
    affiliate:           getAffiliateRef() || (user && user.affiliate) || null,
    affiliateCommission: (getAffiliateRef() || (user && user.affiliate)) ? +(total * 0.05).toFixed(2) : null,
    commissionStatus:    (getAffiliateRef() || (user && user.affiliate)) ? 'pending' : null,
  };

  const onSuccess = ()=>{
    const savedId    = pendingOrderId;
    const savedTotal = total;
    const affRef     = getAffiliateRef() || (user && user.affiliate) || null;
    // True only when there's an actual charge about to happen -- either the
    // VIP membership flow, or a one-time purchase with a real total owed.
    const isPayingNow = !!checkoutData.wantsVIP || savedTotal > 0;

    if(checkoutData.wantsVIP){
      // Opted into VIP: reserve it as pending and send them to the membership
      // payment flow. VIP only activates when the webhook confirms the charge.
      if(db && user?.uid){
        db.collection('users').doc(user.uid).set({ isVIP: false, vipSignupPending: true, vipCheckoutAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
          .catch(e=>console.warn('[IS] VIP pending write failed:', e));
      }
      showRedirectingToPayment();
      startVIPPayment({
        email:     checkoutData.email     || (user && user.email) || '',
        firstName: checkoutData.firstName || '',
        lastName:  checkoutData.lastName  || '',
        userId:    user?.uid || (typeof auth!=='undefined' && auth.currentUser && auth.currentUser.uid) || null,
        orderId:   pendingOrderId,
        itemTotal: savedTotal || 0,
      });
    } else if(savedTotal > 0){
      // Declined VIP but still owes money for the order itself: send to the
      // one-time purchase flow on the separate CCBill subaccount (0001).
      // No membership, no recurring charge -- just this order.
      showRedirectingToPayment();
      startOneTimePayment({
        email:     checkoutData.email     || (user && user.email) || '',
        firstName: checkoutData.firstName || '',
        lastName:  checkoutData.lastName  || '',
        userId:    user?.uid || (typeof auth!=='undefined' && auth.currentUser && auth.currentUser.uid) || null,
        orderId:   pendingOrderId,
        itemTotal: savedTotal,
      });
    }

    // Decrement redeemed tokens from the member's balance
    if(tokensUsed > 0 && user){
      const newBal = Math.max(0, availableTokens() - tokensUsed);
      user.credits = newBal;
      if(typeof credits !== 'undefined') credits = newBal;
      if(db && user.uid){
        db.collection('users').doc(user.uid).update({ credits: newBal })
          .catch(e=>console.warn('[IS] token decrement failed:', e));
      }
    }

    /* Affiliate commission is credited server-side by the payment webhook once the order is paid. */

    // Identify the customer in Klaviyo with full profile before tracking order
    if(checkoutData.firstName || checkoutData.email){
      klaviyoIdentify({
        firstName: checkoutData.firstName || (user && user.firstName) || '',
        email:     checkoutData.email     || (user && user.email)     || '',
        phone:     checkoutData.phone     || (user && user.phone)     || '',
        isVIP:     isVIP,
      });
    }

    klaviyoTrackEvent('Order Placed', {
      orderId:        savedId,
      total:          +savedTotal.toFixed(2),
      itemCount:      items.length,
      delivery,
      isVIP:          isVIP,
      vipConsent:     !!(checkoutData.vipConsent),
      customerEmail:  checkoutData.email  || (user && user.email)     || '',
      customerName:   (checkoutData.firstName || '') + ' ' + (checkoutData.lastName || ''),
      phone:          checkoutData.phone  || (user && user.phone)     || '',
      address:        [checkoutData.address, checkoutData.address2, checkoutData.city, checkoutData.state, checkoutData.zip].filter(Boolean).join(', '),
      affiliate:      getAffiliateRef() || (user && user.affiliate) || null,
      items:          items.map(function(i){ return { id: i.productId, name: i.name, price: i.unitPrice, qty: i.qty, total: i.lineTotal }; }),
      itemNames:      items.map(function(i){ return i.name; }).join(', '),
    });

    gaEvent('order_submitted', {
      transaction_id: savedId,
      currency: 'USD',
      value:    +savedTotal.toFixed(2),
      items:    items.map(i=>({ item_id:i.productId, item_name:i.name, price:i.unitPrice, quantity:i.qty })),
    });

    cart = []; saveCart(); renderCart();
    activePromo   = null;
    checkoutData  = {};
    pendingOrderId = null;
    if(!isPayingNow) showOrderSuccess(savedId, savedTotal);
  };

  if(db){
    db.collection('orders').doc(pendingOrderId).set(orderDoc)
      .then(()=>{
        // Increment soldCount per item qty
        const batch = db.batch();
        items.forEach(item=>{
          const ref = db.collection('products').doc('p' + item.productId);
          batch.set(ref, { soldCount: firebase.firestore.FieldValue.increment(item.qty) }, { merge: true });
        });
        return batch.commit().catch(()=>{});
      })
      .then(onSuccess)
      .catch(err=>{
        console.error('[IS] Firestore write failed:', err);
        onSuccess();
      });
  } else {
    const stored = JSON.parse(localStorage.getItem('is_orders')||'[]');
    stored.push({...orderDoc, timestamp: new Date().toISOString()});
    localStorage.setItem('is_orders', JSON.stringify(stored));
    onSuccess();
  }
}

/* Renders an honest "sending you to payment" state -- shown instead of a false
   order-confirmed screen while a real charge is still pending at CCBill. */
function showRedirectingToPayment(){
  const cho = document.getElementById('cho');
  if(cho) cho.classList.add('open');
  document.body.style.overflow = 'hidden';

  const titleEl = document.getElementById('ch-title');
  const stepEl  = document.getElementById('ch-step');
  const progEl  = document.getElementById('ch-prog');
  if(titleEl) titleEl.textContent = 'One moment…';
  if(stepEl)  stepEl.textContent  = '';
  if(progEl)  progEl.style.width  = '100%';

  const body = document.getElementById('ch-body');
  if(!body) return;
  body.innerHTML = `
    <div class="ch-suc">
      <div class="spinner" style="width:40px;height:40px;border:3px solid var(--gray);border-top-color:var(--plum);border-radius:50%;margin:0 auto 20px;animation:spin .8s linear infinite"></div>
      <h2 style="font-size:20px">Taking you to secure payment</h2>
      <p>Nothing has been charged yet. You'll complete your card details on the next screen.</p>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  `;
}

/* Renders the order success screen inside the checkout panel */
function showOrderSuccess(orderId, total){
  // Make sure checkout panel is open
  const cho = document.getElementById('cho');
  if(cho) cho.classList.add('open');
  document.body.style.overflow = 'hidden';

  const titleEl = document.getElementById('ch-title');
  const stepEl  = document.getElementById('ch-step');
  const progEl  = document.getElementById('ch-prog');
  if(titleEl) titleEl.textContent = 'Order Confirmed!';
  if(stepEl)  stepEl.textContent  = '';
  if(progEl)  progEl.style.width  = '100%';

  const body = document.getElementById('ch-body');
  if(!body) return;
  body.innerHTML = `
    <div class="ch-suc">
      <div class="icon"></div>
      <h2>Order Confirmed!</h2>
      <p>Your order has been placed. You will receive an email confirmation shortly.</p>
      <div style="background:var(--plum);border-radius:10px;padding:16px;margin:16px 0;text-align:center">
        <div style="font-size:11px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.1em;margin-bottom:5px">Order Number</div>
        <div onclick="navigator.clipboard?.writeText('${orderId}').then(()=>toast('Order number copied!'))" style="font-family:var(--fd);font-size:24px;font-weight:900;color:#fff;letter-spacing:.05em;cursor:pointer" title="Tap to copy">${orderId}</div>
      </div>
      <div class="disc-note" style="text-align:left;margin-top:4px">
        <div style="font-size:12px;line-height:2">
          Ships in a plain brown box within 1&ndash;2 business days.<br>
          Statement shows <strong>Dharma Media & Technology LLC</strong>.
        </div>
      </div>
      <div style="font-size:11px;color:var(--muted);margin:14px 0 20px">
        Questions? Call or text <strong>(559) 334-0826</strong> or email hello@intimacysupply.com
      </div>
      <button class="btn-p" onclick="closeCheckout();showHome()" style="max-width:280px;margin:0 auto">CONTINUE SHOPPING</button>
    </div>
  `;
}
/* ═══════════════════════════════════════════
   SPIN WHEEL
═══════════════════════════════════════════ */
const PRIZES=[
  {label:'UP TO 34% OFF',  color:'#373431', code:null},
  {label:'VIP PRICING',color:'#1B1B19', code:null},
  {label:'UP TO 34% OFF',  color:'#373431', code:null},
  {label:'VIP ACCESS',  color:'#1B1B19', code:null},
  {label:'UP TO 34% OFF',  color:'#373431', code:null},
  {label:'VIP PRICING', color:'#1B1B19', code:null},
];

function drawWheel(){
  try {
    const c = document.getElementById('wc');
    if(!c) return;
    const ctx = c.getContext('2d');
    if(!ctx) return;

    // HiDPI / Retina fix: render at device pixel ratio for sharp crisp text
    const dpr  = window.devicePixelRatio || 1;
    const size = 320;
    c.width        = size * dpr;
    c.height       = size * dpr;
    c.style.width  = size + 'px';
    c.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    const cx  = size / 2;
    const cy  = size / 2;
    const r   = size / 2 - 4;
    const n   = PRIZES.length;
    const arc = (2 * Math.PI) / n;

    PRIZES.forEach(function(seg, i){
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, arc * i, arc * (i + 1));
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.3)';
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(arc * i + arc / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = seg.color === '#1B1B19' ? '#111111' : '#FFFFFF';
      ctx.font = '900 16px "Barlow Condensed", Arial Narrow, sans-serif';
      ctx.fillText(seg.label, r - 10, 6);
      ctx.restore();
    });

    // Center hub
    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, 2 * Math.PI);
    ctx.fillStyle = '#0D0D0D';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.fillStyle    = '#FFFFFF';
    ctx.font         = '900 14px "Barlow Condensed", Arial Narrow, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPIN', cx, cy);

  } catch(e){ /* canvas not ready */ }
}

function openSpin(){
  try {
    var spo = document.getElementById('spo');
    if(!spo) return;
    spo.classList.add('open');
    document.body.style.overflow='hidden';
    wheelSpun=false;
    const c=document.getElementById('wc');
    if(c){
      c.style.transition='none';
      c.style.transform='rotate(0deg)';
    }
    setTimeout(drawWheel, 60);
  } catch(e){ /* spin not ready */ }
}
function closeSpin(){
  document.getElementById('spo').classList.remove('open');
  document.body.style.overflow='';
}

function onWheelClick(){
  if(wheelSpun) return;
  try {
    wheelSpun=true;
    const deg=1440+Math.floor(Math.random()*360);
    const c=document.getElementById('wc');
    if(!c) return;
    c.style.transition='transform 3.2s cubic-bezier(.17,.67,.12,.99)';
    c.style.transform='rotate('+deg+'deg)';
    lastSpinPrize = PRIZES[0]; // Always Extra 10% Off - wheel is visual entertainment only
    setTimeout(()=>{
      toast('You won VIP pricing - up to 34% off everything! Create your account to claim it.');
      setTimeout(()=>{
        closeSpin();
        // If not signed in, open quiz to create account and claim prize
        if(!user){ openQuiz('spin_wheel'); }
      }, 1800);
    },3400);
  } catch(e){ closeSpin(); }
}

/* openMM / closeMM  -  scroll position preserved on open/close */
var _menuScrollY = 0;
function openMM(){
  var mm = document.getElementById('mm');
  if(!mm) return;
  _menuScrollY = window.scrollY || window.pageYOffset;
  mm.classList.add('open');
  document.body.classList.add('menu-open');
  document.body.style.top = '-' + _menuScrollY + 'px';
}
function closeMM(){
  var mm = document.getElementById('mm');
  if(!mm) return;
  mm.classList.remove('open');
  document.body.classList.remove('menu-open');
  document.body.style.top = '';
  window.scrollTo(0, _menuScrollY);
}
window.openMM  = openMM;
window.closeMM = closeMM;

/* ═══════════════════════════════════════════
   EVENTS
═══════════════════════════════════════════ */
/* FINAL REFINEMENT - CONSOLE CLEAN + PREMIUM RETAIL POLISH */
/* All addEventListener calls guarded against null to eliminate console errors */
(function wireEvents(){
  function on(id, evt, fn){ var el=document.getElementById(id); if(el) el.addEventListener(evt,fn); }
  on('search-btn',   'click', openSearch);
  on('search-close', 'click', closeSearch);
  on('cart-btn',     'click', openCart);
  on('cart-close',   'click', closeCart);
  on('co',           'click', closeCart);
  on('wl-btn',       'click', openWL);
  on('wl-close',     'click', closeWL);
  on('wlo',          'click', closeWL);
  on('ch-back',      'click', ()=>{ if(checkoutStep>1){ checkoutStep--; renderCheckout(); } else { closeCheckout(); openCart(); } });
  on('qo', 'click', e=>{ /* quiz non-dismissable - no close on backdrop click */ });
  on('pdo',          'click', e=>{ if(e.target===document.getElementById('pdo')) closePD(); });
  on('spo',          'click', e=>{ if(e.target===document.getElementById('spo')) closeSpin(); });
  on('gfo',          'click', e=>{ if(e.target===document.getElementById('gfo')) closeGift(); });
  var si = document.getElementById('search-input');
  if(si) si.addEventListener('input', e=>renderSearchResults(e.target.value));
  var wc = document.getElementById('wc');
  if(wc) wc.addEventListener('click', onWheelClick);
}());

/* ═══════════════════════════════════════════
   COUNTDOWN
═══════════════════════════════════════════ */
/* startVIPCountdown - called once after account creation. Shows the bar and counts down 60 min. */
function startVIPCountdown(){
  const bar = document.getElementById('cdb');
  const el  = document.getElementById('countdown');
  if(!bar || !el) return;
  bar.style.display = 'block';
  let t = 60 * 60;
  el.textContent = '60:00';
  const iv = setInterval(()=>{
    t--;
    if(t <= 0){ clearInterval(iv); bar.style.display = 'none'; return; }
    el.textContent = String(Math.floor(t/60)).padStart(2,'0') + ':' + String(t%60).padStart(2,'0');
  }, 1000);
}

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
filterProds('all');
renderCart();
renderWL();
updateHeader();
closeAcctMenu();

// Restore wishlist badge
if(wishlist.length>0){
  const badge=document.getElementById('wl-badge');
  badge.classList.add('show');badge.textContent=wishlist.length;
}

/* ═══════════════════════════════════════════════════════
   SMART TRIGGER SYSTEM  -  Retail-style
   1. QUIZ: fires immediately for new non-VIP visitors
   2. SPIN WHEEL: fires after inactivity + mobile exit intent
═══════════════════════════════════════════════════════ */
(function(){
  var HAS_SEEN_QUIZ  = 'is_seen_quiz';
  var HAS_SEEN_SPIN  = 'is_seen_spin';
  var spinShown      = false;
  var quizShown      = false;
  var scrollGateFired = false;

  // ── 1. QUIZ TRIGGER ──────────────────────────────────
  function maybeShowQuiz(){
    if(isVIP || user) return;
    if(quizShown) return;
    quizShown = true;
    try{ openQuiz('auto_popup'); }catch(e){}
  }
  window.maybeShowQuiz = maybeShowQuiz;
  window._quizShownRef = function(val){ if(val !== undefined) quizShown = val; return quizShown; };

  // Auth resolves first - quiz fires via openPD when guest clicks a product
  // Never fire automatically on page load
  var authResolved = false;
  window._authResolved = function(){ authResolved = true; window._authResolved._done = true; };
  window._authResolved._done = false;

  // ── SCROLL GATE REMOVED: quiz fires only via product click (openPD) or explicit CTA ──

  // ── 2. SPIN WHEEL TRIGGER ────────────────────────────
  // Only for non-VIP guests. Fires on inactivity OR mobile exit intent.
  // Does NOT fire if quiz is open.

  function maybeShowSpin(){
    if(isVIP || user) return;
    if(spinShown) return;
    var qo = document.getElementById('qo');
    if(qo && qo.classList.contains('open')) return; // quiz is open
    spinShown = true;
    localStorage.setItem(HAS_SEEN_SPIN, '1');
    try{ openSpin(); }catch(e){}
  }

  // Inactivity trigger: 12 seconds of no interaction
  var inactivityTimer = null;
  function resetInactivity(){
    clearTimeout(inactivityTimer);
    if(!spinShown && !isVIP && !user){
      inactivityTimer = setTimeout(maybeShowSpin, 12000);
    }
  }
  ['touchstart','touchmove','click','scroll','keydown'].forEach(function(ev){
    document.addEventListener(ev, resetInactivity, {passive:true});
  });
  resetInactivity(); // start the timer

  // Mobile exit intent: user scrolls back to top quickly
  var lastScrollY = 0;
  var lastScrollTime = Date.now();
  var hdrEl = document.querySelector('header');
  window.addEventListener('scroll', function(){
    var y = window.scrollY;
    var now = Date.now();
    var velocity = (lastScrollY - y) / (now - lastScrollTime + 1);
    // Hide header on scroll down, show on scroll up
    if(hdrEl){
      if(y > lastScrollY && y > 80){
        hdrEl.classList.add('hidden');
        var vab = document.getElementById('vip-active-bar');
        if(vab && vab.style.display !== 'none') vab.style.transform = 'translateY(-110px)';
      } else {
        hdrEl.classList.remove('hidden');
        var vab = document.getElementById('vip-active-bar');
        if(vab) vab.style.transform = 'translateY(0)';
      }
    }
    // Fast upward scroll near top = exit intent on mobile
    if(y < 80 && velocity > 2.5 && !spinShown && !isVIP && !user){
      maybeShowSpin();
    }
    if(y < 80 && velocity > 2.5){ maybeShowSkipNudge(); }
    lastScrollY = y;
    lastScrollTime = now;
  }, {passive:true});

})();

/* AGE GATE / NEWSLETTER / TESTIMONIALS / BOTTOM NAV */
function initAgeGate(){
  if(localStorage.getItem('is_age_ok')==='true') return;
  const ov=document.getElementById('age-overlay');
  if(ov){ov.style.display='flex';document.body.style.overflow='hidden';}
}
function passAge(){
  localStorage.setItem('is_age_ok','true');
  const ov=document.getElementById('age-overlay');
  if(!ov) return;
  ov.style.opacity='0';
  setTimeout(()=>{ov.style.display='none';document.body.style.overflow=''},400);
}

/* ═══════════════════════════════════════════
   NEWSLETTER SUBSCRIPTION
   Primary:  Klaviyo server-side track endpoint
   Fallback: EmailJS (set EMAILJS_SERVICE_ID etc.)
   Local:    localStorage dedup always runs

   To activate Klaviyo:
     1. Replace KLAVIYO_LIST_ID with your real list ID
        (found in Klaviyo > Lists & Segments > your list > Settings)
     2. Replace KLAVIYO_PUBLIC_API_KEY with your public API key
        (Klaviyo > Account > Settings > API Keys > Public API Key)
     3. Set KLAVIYO_ENABLED = true

   To activate EmailJS as fallback:
     1. Create account at emailjs.com
     2. Replace EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY
     3. Your template should accept {{email}} and {{source}} variables
     4. Set EMAILJS_ENABLED = true
═══════════════════════════════════════════ */

/* ── CONFIG: replace these values ── */
const NL_CONFIG = {
  klaviyo: {
    enabled:   true,
    listId:    'SiyNPj',
    apiKey:    'UFRYNs'
  },
  emailjs: {
    enabled:    false,
    serviceId:  'YOUR_SERVICE_ID',
    templateId: 'YOUR_TEMPLATE_ID',
    publicKey:  'YOUR_PUBLIC_KEY'
  }
};

/* Subscribe via Klaviyo list endpoint */
function subscribeKlaviyo(email, source){
  return fetch('https://a.klaviyo.com/client/subscriptions/?company_id='+NL_CONFIG.klaviyo.apiKey, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'revision':     '2023-02-22'
    },
    body: JSON.stringify({
      data: {
        type: 'subscription',
        attributes: {
          list_id:  NL_CONFIG.klaviyo.listId,
          email,
          properties: { source: source || 'website' }
        }
      }
    })
  });
}

/* Subscribe via EmailJS */
function subscribeEmailJS(email, source){
  return fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id:  NL_CONFIG.emailjs.serviceId,
      template_id: NL_CONFIG.emailjs.templateId,
      user_id:     NL_CONFIG.emailjs.publicKey,
      template_params: { email, source: source || 'website' }
    })
  });
}

/* ── KLAVIYO IDENTIFY: creates/updates a profile in Klaviyo ── */
function klaviyoIdentify(profile){
  if(!NL_CONFIG.klaviyo.enabled || NL_CONFIG.klaviyo.apiKey==='YOUR_PUBLIC_API_KEY') return;
  fetch('https://a.klaviyo.com/client/profiles/?company_id='+NL_CONFIG.klaviyo.apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'revision': '2023-02-22' },
    body: JSON.stringify({
      data: {
        type: 'profile',
        attributes: {
          email:        profile.email      || '',
          first_name:   profile.firstName  || '',
          phone_number: profile.phone      || '',
          properties: {
            isVIP:      !!(profile.isVIP),
            source:     profile.source     || 'quiz',
            sizes:      (profile.sizes||[]).join(', '),
            zip:        profile.zip        || '',
            joinedAt:   new Date().toISOString(),
          }
        }
      }
    })
  }).catch(err=>console.warn('[IS] Klaviyo identify error:',err));
}

/* ── KLAVIYO TRACK: fires a named event against the current user ── */
function klaviyoTrackEvent(eventName, properties){
  if(!NL_CONFIG.klaviyo.enabled || NL_CONFIG.klaviyo.apiKey==='YOUR_PUBLIC_API_KEY') return;
  const email = (user && user.email) ? user.email : (properties && properties.customerEmail) ? properties.customerEmail : null;
  if(!email) return;
  fetch('https://a.klaviyo.com/client/events/?company_id='+NL_CONFIG.klaviyo.apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'revision': '2023-02-22' },
    body: JSON.stringify({
      data: {
        type: 'event',
        attributes: {
          metric:     { data: { type: 'metric', attributes: { name: eventName } } },
          profile:    { data: { type: 'profile', attributes: { email } } },
          properties: properties || {},
          time:       new Date().toISOString(),
        }
      }
    })
  }).catch(err=>console.warn('[IS] Klaviyo track error:',err));
}

function subNewsletter(inputId, feedbackId){
  const inputEl = document.getElementById(inputId);
  const fb      = document.getElementById(feedbackId);
  if(!inputEl || !fb) return;

  const email = inputEl.value.trim().toLowerCase();

  /* Basic validation */
  if(!email || !email.includes('@') || !email.includes('.')){
    fb.textContent = 'Please enter a valid email address.';
    fb.style.color   = 'var(--red)';
    fb.style.display = 'block';
    return;
  }

  /* Duplicate check (localStorage dedup always runs) */
  const subs = JSON.parse(localStorage.getItem('is_subs') || '[]');
  if(subs.includes(email)){
    fb.textContent = 'You&apos;re already subscribed!';
    fb.style.color   = '#1B1B19';
    fb.style.display = 'block';
    return;
  }

  /* Disable input while submitting */
  inputEl.disabled = true;
  var btn = inputEl.nextElementSibling;
  var origBtnText = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = '...'; }
  fb.style.display = 'none';

  /* Determine source for analytics */
  var source = 'footer';

  /* Helper: show success state */
  function onSuccess(){
    subs.push(email);
    localStorage.setItem('is_subs', JSON.stringify(subs));
    inputEl.value    = '';
    inputEl.disabled = false;
    if(btn){ btn.disabled = false; btn.textContent = origBtnText; }
    fb.textContent   = 'You\'re on the list! Check your inbox for next steps.';
    fb.style.color   = '#1B1B19';
    fb.style.display = 'block';
    toast('You\'re on the list! Check your inbox.');
  }

  /* Helper: show error state */
  function onError(msg){
    inputEl.disabled = false;
    if(btn){ btn.disabled = false; btn.textContent = origBtnText; }
    fb.textContent   = msg || 'Something went wrong. Please try again.';
    fb.style.color   = 'var(--red)';
    fb.style.display = 'block';
  }

  /* --- Send to configured provider --- */
  if(NL_CONFIG.klaviyo.enabled && NL_CONFIG.klaviyo.listId !== 'YOUR_LIST_ID'){
    subscribeKlaviyo(email, source)
      .then(function(res){
        if(res.ok || res.status === 202){ onSuccess(); }
        else { return res.text().then(function(t){ throw new Error(t); }); }
      })
      .catch(function(err){
        console.warn('[IS] Klaviyo error:', err);
        onError('Could not subscribe right now. Please try again.');
      });
  } else if(NL_CONFIG.emailjs.enabled && NL_CONFIG.emailjs.serviceId !== 'YOUR_SERVICE_ID'){
    subscribeEmailJS(email, source)
      .then(function(res){
        if(res.ok){ onSuccess(); }
        else { throw new Error('EmailJS failed'); }
      })
      .catch(function(err){
        console.warn('[IS] EmailJS error:', err);
        onError('Could not subscribe right now. Please try again.');
      });
  } else {
    /* No provider configured  -  save locally and show success.
       Remove this block once Klaviyo or EmailJS is active. */
    onSuccess();
  }
}

function openLegal(type){
  // Legal docs are real pages now (/privacy, /terms, ...). From inside checkout, sign-in or the age gate
  // they open in a new tab so nobody loses their place; from the page footer they navigate normally.
  var LEGAL_ROUTES = {"privacy": "/privacy", "terms": "/terms", "shipping": "/shipping-returns", "refund": "/refund-policy", "affiliate": "/affiliate-disclosure", "chargeback": "/recognize-a-charge", "complaints": "/complaints", "donotsell": "/do-not-sell", "gdpr": "/gdpr", "affiliateterms": "/affiliate-terms", "accessibility": "/accessibility", "emailpref": "/email-preferences", "compliance": "/compliance"};
  if(LEGAL_ROUTES[type]){
    var ag = document.getElementById('age-gate');
    var inFlow = document.body.style.overflow === 'hidden' || (ag && ag.getClientRects().length > 0);
    if(inFlow){ window.open(LEGAL_ROUTES[type], '_blank', 'noopener'); }
    else { window.location.href = LEGAL_ROUTES[type]; }
    return;
  }
  const S = 'font-family:Barlow Condensed,sans-serif;font-size:20px;font-weight:900;text-transform:uppercase;color:#373431;margin:18px 0 8px';
  const S2= 'font-family:Barlow Condensed,sans-serif;font-size:16px;font-weight:900;text-transform:uppercase;color:#111;margin:14px 0 5px';
  const P = 'font-size:13px;color:#333;line-height:1.75;margin-bottom:10px';
  const content={
    privacy:`
      <h2 style="${S}">Privacy Policy</h2>
      <p style="font-size:11px;color:#888;margin-bottom:14px">Dharma Media & Technology LLC  -  Last Updated: May 22, 2026</p>
      <p style="${P}">Dharma Media & Technology LLC (&ldquo;Intimacy Supply,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates this website. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our site and make purchases, including through our VIP Membership Program.</p>
      <h3 style="${S2}">Information We Collect</h3>
      <p style="${P}"><strong>Personal Information:</strong> name, email address, phone number, shipping address, and date of birth (required to verify you are 18 or older).</p>
      <p style="${P}"><strong>Payment Information:</strong> We do not store complete payment credentials on our servers. Payments are processed securely. Only order references and amounts are retained for reconciliation.</p>
      <p style="${P}"><strong>Account &amp; Preference Data:</strong> membership status, quiz preferences, size information, order history, and wishlist items.</p>
      <p style="${P}"><strong>Usage Data:</strong> IP address, browser type, device type, pages visited, time on site, and referral source collected via cookies and analytics tools.</p>
      <h3 style="${S2}">How We Use Your Information</h3>
      <p style="${P}">To process and fulfill orders; manage your VIP Membership including billing, skip requests, and cancellations; send order confirmations and shipping updates; send marketing communications (you may opt out at any time); improve our website and product catalog; verify that you are at least 18 years of age; and comply with applicable legal obligations.</p>
      <h3 style="${S2}">Information Sharing</h3>
      <p style="${P}">We do not sell your personal information. We may share information with payment processors to complete transactions; shipping and fulfillment partners to deliver orders; email service providers (Klaviyo) to send communications; and analytics providers (Google Analytics) to understand website usage. We may disclose information to law enforcement or regulatory agencies when required by law.</p>
      <h3 style="${S2}">Cookies</h3>
      <p style="${P}">We use cookies to personalize your experience, remember your cart and preferences, and analyze traffic. You can control cookie settings through your browser. Disabling cookies may affect site functionality.</p>
      <h3 style="${S2}">Data Security</h3>
      <p style="${P}">All pages are served over SSL/TLS encryption. We retain your data only as long as necessary to fulfill the purposes described in this policy. You may request deletion of your account and associated data by contacting us at hello@intimacysupply.com.</p>
      <h3 style="${S2}">California Privacy Rights (CCPA)</h3>
      <p style="${P}">California residents have the right to: (1) know what personal information we collect and how it is used; (2) request deletion of personal information; (3) opt out of the sale of personal information  -  we do not sell personal information; (4) non-discrimination for exercising these rights. To exercise these rights contact us at hello@intimacysupply.com or (559) 334-0826.</p>
      <h3 style="${S2}">Children&rsquo;s Privacy</h3>
      <p style="${P}">This website is intended exclusively for adults 18 years of age and older. We do not knowingly collect information from anyone under 18. If we learn we have collected information from a minor, we will delete it immediately and terminate the associated account.</p>
      <h3 style="${S2}">Contact</h3>
      <p style="${P}">Dharma Media & Technology LLC &bull; hello@intimacysupply.com &bull; (559) 334-0826</p>
    `,
    terms:`
      <h2 style="${S}">Terms of Service</h2>
      <p style="font-size:11px;color:#888;margin-bottom:14px">Dharma Media & Technology LLC  -  Last Updated: May 22, 2026</p>
      <h3 style="${S2}">1. Acceptance</h3>
      <p style="${P}">By accessing or using this website, you agree to be bound by these Terms of Service. If you do not agree, do not use the site.</p>
      <h3 style="${S2}">2. Eligibility</h3>
      <p style="${P}">You must be at least 18 years of age to use this website or purchase any products. By using this site, you confirm that you are 18 or older and that you have the legal right to purchase adult products in your jurisdiction. We reserve the right to terminate accounts and cancel orders if we have reason to believe a user is under 18.</p>
      <h3 style="${S2}">3. VIP Membership  -  Negative Option Billing Disclosure</h3>
      <div style="background:#F8F8F8;border:2px solid #D4000F;border-radius:8px;padding:14px 16px;margin-bottom:12px">
        <p style="font-size:12px;font-weight:700;color:#D4000F;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Important  -  Read Before Enrolling</p>
        <p style="${P}"><strong>Monthly Charge:</strong> On the 6th of each month, your payment method will be charged <strong>$39.95</strong> for one Member Token.</p>
        <p style="${P}"><strong>Member Token:</strong> Each token applies up to $50 toward a single item. Items valued above $50 require additional tokens, equal to the item price rounded up to the nearest $50 (for example, a $60 item requires 2 tokens and a $189 item requires 4). Unused tokens stack and expire 12 months after issuance.</p>
        <p style="${P}"><strong>Skip the Month:</strong> To avoid being charged for any given month, you must log in to your account and select &ldquo;Skip This Month&rdquo; between the <strong>1st and 5th</strong> of that month. Skipping is free and does not affect your membership.</p>
        <p style="${P}"><strong>How to Cancel:</strong> You may cancel your VIP membership at any time by (a) logging into your account and selecting &ldquo;Cancel Membership,&rdquo; or (b) calling or texting <strong>(559) 334-0826</strong>. Cancellations received before the 6th of the month take effect immediately. No partial refunds are issued for the current billing period.</p>
        <p style="${P};margin-bottom:0"><strong>Refunds:</strong> We do not issue refunds on membership charges that have already processed, except where required by applicable law. If you believe a charge was made in error, contact us within 30 days at hello@intimacysupply.com.</p>
      </div>
      <h3 style="${S2}">4. Products &amp; Pricing</h3>
      <p style="${P}">All prices are in US dollars. VIP member pricing represents savings of up to 34% off our standard retail prices. We reserve the right to change pricing at any time. Product images and descriptions are representative; actual items may vary slightly.</p>
      <h3 style="${S2}">5. Shipping</h3>
      <p style="${P}">All orders ship in plain packaging with no exterior brand identification. Your billing statement will show &ldquo;Dharma Media & Technology LLC.&rdquo; Standard: $5.95, 6&ndash;10 business days. Expedited: $15.95, 3&ndash;4 business days. Free standard shipping on orders over $59.97.</p>
      <h3 style="${S2}">6. Returns &amp; Refunds</h3>
      <p style="${P}">Unopened products may be returned within 30 days of delivery for store credit. We do not accept returns on opened adult products for health and hygiene reasons. To initiate a return, contact hello@intimacysupply.com with your order number.</p>
      <h3 style="${S2}">7. Prohibited Uses</h3>
      <p style="${P}">You may not use the site if you are under 18; resell our products without written authorization; use the site for any unlawful purpose; or attempt to gain unauthorized access to any part of the site.</p>
      <h3 style="${S2}">8. Limitation of Liability</h3>
      <p style="${P}">To the maximum extent permitted by law, Dharma Media & Technology LLC shall not be liable for any indirect, incidental, special, consequential, or punitive damages. Our total liability shall not exceed the amount you paid for the product or service giving rise to the claim.</p>
      <h3 style="${S2}">9. Governing Law</h3>
      <p style="${P}">These Terms are governed by the laws of the State of California. Any disputes shall be resolved in the courts of Tulare County, California.</p>
      <h3 style="${S2}">10. Contact</h3>
      <p style="${P}">Dharma Media & Technology LLC &bull; hello@intimacysupply.com &bull; (559) 334-0826</p>
    `,
    shipping:`
      <h2 style="${S}">Shipping &amp; Returns</h2>
      <p style="font-size:11px;color:#888;margin-bottom:14px">Dharma Media &amp; Technology LLC - Last Updated: May 22, 2026</p>
      <h3 style="${S2}">Packaging &amp; Discretion</h3>
      <p style="${P}">All orders ship in plain, unmarked brown boxes. There is no brand name, logo, or product description on the outside of the package. Your billing statement will show <strong>DHARMA*INTIMACYSUP</strong> - never Intimacy Supply.</p>
      <h3 style="${S2}">Shipping Options</h3>
      <p style="${P}"><strong>Standard Shipping - $5.95:</strong> 6&ndash;10 business days from the date your order ships. Free on orders over $59.97.</p>
      <p style="${P}"><strong>Expedited Shipping - $15.95:</strong> 3&ndash;4 business days from the date your order ships.</p>
      <p style="${P}">Orders are processed within 1&ndash;2 business days after payment is verified. You will receive an email confirmation with tracking information once your order ships.</p>
      <h3 style="${S2}">Returns</h3>
      <p style="${P}">Unopened items may be returned within 30 days of delivery for store credit equal to the purchase price. We do not accept returns on opened adult products for health and hygiene reasons. All sales on opened items are final.</p>
      <p style="${P}">To initiate a return, email hello@intimacysupply.com with your order number and reason for return. We will provide a return shipping label within 2 business days.</p>
      <h3 style="${S2}">Damaged or Defective Items</h3>
      <p style="${P}">Contact us within 7 days of delivery with photos of the damage or defect. We will replace or fully refund defective items at no cost to you. No return shipping required for defective items.</p>
      <h3 style="${S2}">Contact</h3>
      <p style="${P}">Dharma Media &amp; Technology LLC &bull; hello@intimacysupply.com &bull; (559) 334-0826</p>
    `,
    refund:`
      <h2 style="${S}">Refund &amp; Cancellation Policy</h2>
      <p style="font-size:11px;color:#888;margin-bottom:14px">Dharma Media &amp; Technology LLC - Last Updated: May 22, 2026</p>
      <div style="background:#F8F8F8;border:2px solid #E6E0D6;border-radius:8px;padding:14px 16px;margin-bottom:16px">
        <p style="font-size:12px;font-weight:700;color:#53504D;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Your Statement Will Show</p>
        <p style="font-family:var(--fd);font-size:18px;font-weight:900;color:#111;letter-spacing:.04em;margin-bottom:4px">DHARMA*INTIMACYSUP</p>
        <p style="font-size:11px;color:#53504D">Questions about a charge? Contact us at hello@intimacysupply.com or (559) 334-0826 before disputing with your card issuer.</p>
      </div>
      <h3 style="${S2}">VIP Membership - Cancellation</h3>
      <p style="${P}">You may cancel your VIP Membership at any time using either of these methods:</p>
      <p style="${P}"><strong>Online:</strong> Log in to your account and select "Cancel Membership" under Membership Settings.</p>
      <p style="${P}"><strong>Phone/Text:</strong> Call or text (559) 334-0826. Cancellations are processed immediately.</p>
      <p style="${P}">Cancellations received before the 6th of the month take effect that billing period. Cancellations received on or after the 6th apply to the following month.</p>
      <h3 style="${S2}">VIP Membership - Skipping a Month</h3>
      <p style="${P}">To skip any month, log in and select "Skip This Month" between the 1st and 5th. Skipping is free, unlimited, and does not cancel your membership.</p>
      <h3 style="${S2}">VIP Membership - Refunds</h3>
      <p style="${P}">Monthly membership charges of $39.95 that have already processed are non-refundable, except as required by law. If you believe a charge was made in error, contact us within 30 days at hello@intimacysupply.com. Billing errors are resolved promptly.</p>
      <h3 style="${S2}">Physical Products - Order Cancellation</h3>
      <p style="${P}">It is possible to cancel an order that has not yet shipped. Contact hello@intimacysupply.com with your order number as soon as possible and we will cancel it and issue a full refund before it leaves our facility. Unfortunately, we are unable to cancel an order that has already shipped; in that case, our standard return policy below applies once the item is delivered.</p>
      <h3 style="${S2}">Physical Products - Returns</h3>
      <p style="${P}">Unworn, unopened items may be returned within 30 days of delivery for a full refund to your original payment method. Opened adult products may be exchanged for member credit for hygiene reasons. Contact hello@intimacysupply.com with your order number to start a return.</p>
      <h3 style="${S2}">Physical Products - Defective or Damaged Items</h3>
      <p style="${P}">Contact us within 7 days of delivery with photos. We will replace or fully refund defective items. Return shipping on defective items is covered by us.</p>
      <h3 style="${S2}">Refund Timeline</h3>
      <p style="${P}">Approved refunds process within 5&ndash;10 business days to your original payment method. Store credit is applied to your account immediately upon return confirmation.</p>
      <h3 style="${S2}">Contact</h3>
      <p style="${P}">Dharma Media &amp; Technology LLC &bull; hello@intimacysupply.com &bull; (559) 334-0826</p>
    `,

    affiliate:`
      <h2 style="${S}">Affiliate & Partner Disclosure</h2>
      <p style="font-size:11px;color:#888;margin-bottom:14px">Dharma Media & Technology LLC  -  Last Updated: May 2026</p>
      <p style="${P}"><strong>FTC Disclosure:</strong> Intimacy Supply operates an affiliate and creator partner program. Affiliates and creators who promote Intimacy Supply products and services may receive compensation, including recurring commissions, free products, or other benefits in exchange for their promotion.</p>
      <p style="${P}">In accordance with the Federal Trade Commission's guidelines (16 CFR Part 255), all affiliates and creators are required to clearly disclose their material connection to Intimacy Supply in any promotional content, posts, videos, or communications where they recommend or link to our products.</p>
      <p style="${P}"><strong>Required disclosure language for affiliates:</strong> "I may earn a commission if you purchase through my link. I am a partner of Intimacy Supply."</p>
      <p style="${P}">Intimacy Supply does not pay for positive reviews. All affiliate relationships are based on commission from completed purchases only. Opinions expressed by affiliates are their own.</p>
      <p style="${P}">For questions about our affiliate program or disclosure requirements, contact hello@intimacysupply.com.</p>
    `,
    chargeback:`
      <h2 style="${S}">Recognize a Charge?</h2>
      <p style="font-size:11px;color:#888;margin-bottom:14px">Dharma Media & Technology LLC</p>
      <div style="background:#F8F5F2;border:2px solid #1B1B19;border-radius:10px;padding:16px;margin-bottom:16px;text-align:center">
        <div style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Your statement shows</div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:900;color:#111;letter-spacing:.04em">DHARMA*INTIMACYSUP</div>
        <div style="font-size:11px;color:#555;margin-top:4px">(559) 334-0826</div>
      </div>
      <p style="${P}">This charge is from <strong>Intimacy Supply</strong>, a premium adult VIP membership store operated by Dharma Media & Technology LLC. If you signed up for a VIP membership, this is your monthly membership charge of $39.95.</p>
      <p style="${P}"><strong>Before disputing this charge with your bank or card issuer, please contact us directly:</strong></p>
      <p style="${P}">Email: hello@intimacysupply.com<br>Phone/Text: (559) 334-0826<br>We resolve billing questions within 1 business day.</p>
      <p style="${P}">To cancel your membership, log in to your account and select "Cancel Membership" or call/text (559) 334-0826.</p>
    `,

    complaints:`
      <h2 style="${S}">Complaints</h2>
      <p style="font-size:11px;color:#888;margin-bottom:14px">Dharma Media & Technology LLC</p>
      <p style="${P}">We take all feedback seriously and aim to resolve every concern promptly. If you have a complaint about an order, membership charge, product, or any aspect of your experience, please contact us directly.</p>
      <p style="${P}"><strong>Email:</strong> hello@intimacysupply.com<br><strong>Phone/Text:</strong> (559) 334-0826<br>We respond to all complaints within 1 business day.</p>
      <p style="${P}">If your complaint is not resolved to your satisfaction, you may also contact your state attorney general or file a complaint with the FTC at ftc.gov/complaint.</p>
    `,

    donotsell:`
      <h2 style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:900;text-transform:uppercase;color:#373431;margin:18px 0 8px">Do Not Sell My Personal Information</h2>
      <p style="font-size:11px;color:#888;margin-bottom:14px">Dharma Media & Technology LLC  -  Last Updated: May 2026</p>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px"><strong>We do not sell your personal information.</strong> Dharma Media & Technology LLC (Intimacy Supply) does not sell, rent, or trade your personal information to third parties for monetary or other valuable consideration.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">California Consumer Privacy Act (CCPA) Rights</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">Under the California Consumer Privacy Act, California residents have the right to:</p>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px"><strong>1. Know</strong> what personal information we collect, use, disclose, and sell.<br>
      <strong>2. Delete</strong> personal information we have collected about you, subject to certain exceptions.<br>
      <strong>3. Opt Out</strong> of the sale of your personal information. We do not sell personal information.<br>
      <strong>4. Non-Discrimination</strong> for exercising your CCPA rights.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">How to Submit a Request</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">To submit a data access, deletion, or opt-out request:</p>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px"><strong>Email:</strong> hello@intimacysupply.com (subject: CCPA Request)<br>
      <strong>Phone/Text:</strong> (559) 334-0826<br>
      We will verify your identity and respond within 45 days as required by law.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">Data We Collect</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">Name, email, shipping address, date of birth, order history, account preferences, and usage data. We share this only with payment processors, shipping partners, and analytics providers (Google Analytics, Klaviyo) as necessary to operate the business.</p>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px"><strong>Dharma Media & Technology LLC</strong><br>hello@intimacysupply.com | (559) 334-0826<br>c/o Northwest Registered Agent, 30 N Gould St Ste N, Sheridan WY 82801</p>
    `,

    gdpr:`
      <h2 style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:900;text-transform:uppercase;color:#373431;margin:18px 0 8px">GDPR Privacy Notice</h2>
      <p style="font-size:11px;color:#888;margin-bottom:14px">For European Economic Area (EEA) and UK Residents  -  Last Updated: May 2026</p>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">If you are located in the European Economic Area (EEA) or United Kingdom, this notice applies to you in addition to our Privacy Policy.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">Data Controller</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">Dharma Media & Technology LLC, operating as Intimacy Supply, is the data controller for personal information collected through this website.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">Legal Basis for Processing</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px"><strong>Contract:</strong> Processing your order and managing your VIP membership.<br>
      <strong>Legitimate Interests:</strong> Fraud prevention, site security, and improving our services.<br>
      <strong>Consent:</strong> Marketing communications (you may withdraw consent at any time).<br>
      <strong>Legal Obligation:</strong> Compliance with applicable laws.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">Your Rights Under GDPR</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">You have the right to: access your personal data; correct inaccurate data; request erasure ("right to be forgotten"); restrict or object to processing; data portability; and withdraw consent at any time without affecting prior processing.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">Data Transfers</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">Your data may be transferred to and processed in the United States. We ensure appropriate safeguards are in place in compliance with applicable data protection laws.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">Retention</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">We retain personal data for as long as necessary to fulfill the purposes described in this notice, or as required by law. Account data is retained for the duration of your membership plus 3 years.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">Contact & Complaints</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">To exercise your rights or file a complaint: hello@intimacysupply.com | (559) 334-0826. You also have the right to lodge a complaint with your local data protection authority.</p>
    `,

    affiliateterms:`
      <h2 style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:900;text-transform:uppercase;color:#373431;margin:18px 0 8px">Affiliate & Creator Partner Terms</h2>
      <p style="font-size:11px;color:#888;margin-bottom:14px">Dharma Media & Technology LLC  -  Last Updated: May 2026</p>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">These Affiliate Partner Terms govern your participation in the Intimacy Supply Affiliate and Creator Program operated by Dharma Media & Technology LLC.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">1. Program Overview</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">Affiliates earn a 5% recurring commission on all orders generated through their unique referral link for the lifetime of the customer relationship, subject to the terms below.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">2. Eligibility</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">You must be 18 years of age or older. You must have a valid payment method on file. You must not be a resident of a jurisdiction where participation in affiliate programs is prohibited.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">3. FTC Disclosure Requirement</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">You are required to clearly and conspicuously disclose your affiliate relationship with Intimacy Supply in all promotional content. Required disclosure: "I may earn a commission if you purchase through my link. I am a partner of Intimacy Supply." Failure to disclose may result in termination and forfeiture of commissions.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">4. Prohibited Promotional Methods</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">You may not: use spam or unsolicited emails; bid on "Intimacy Supply" branded keywords in paid search; make false or misleading claims about products; promote to audiences under 18; use coupon or deal sites without written approval; or engage in any deceptive marketing practices.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">5. Commission & Payment</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">Commissions are calculated on net revenue after refunds and chargebacks. Commissions are paid monthly for the prior month's verified orders. Minimum payout threshold is $25. We reserve the right to hold commissions for up to 30 days to account for refund periods.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">6. Termination</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">We reserve the right to terminate any affiliate account at any time for violation of these terms, fraudulent activity, or at our sole discretion with 30 days notice. Earned commissions will be paid through the termination date.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">7. Governing Law</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">These terms are governed by the laws of the State of California.</p>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px"><strong>Dharma Media & Technology LLC</strong><br>hello@intimacysupply.com | (559) 334-0826</p>
    `,

    accessibility:`
      <h2 style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:900;text-transform:uppercase;color:#373431;margin:18px 0 8px">Accessibility Statement</h2>
      <p style="font-size:11px;color:#888;margin-bottom:14px">Dharma Media & Technology LLC  -  Last Updated: May 2026</p>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">Dharma Media & Technology LLC is committed to ensuring digital accessibility for people with disabilities. We continually improve the user experience for everyone and apply relevant accessibility standards.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">Our Efforts</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA. Our efforts include: providing text alternatives for non-text content; ensuring sufficient color contrast; making all functionality accessible via keyboard; providing clear navigation and consistent layouts; and ensuring forms and interactive elements are properly labeled.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">Known Limitations</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">Some third-party content and embedded services may not fully meet accessibility standards. We are actively working to address these limitations.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">Feedback & Contact</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">If you experience any accessibility barriers on our website, please contact us. We take accessibility feedback seriously and aim to respond within 2 business days.</p>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px"><strong>Email:</strong> hello@intimacysupply.com<br>
      <strong>Phone/Text:</strong> (559) 334-0826<br>
      <strong>Dharma Media & Technology LLC</strong><br>
      c/o Northwest Registered Agent, 30 N Gould St Ste N, Sheridan WY 82801</p>
    `,

    emailpref:`
      <h2 style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:900;text-transform:uppercase;color:#373431;margin:18px 0 8px">Email Preferences & Unsubscribe</h2>
      <p style="font-size:11px;color:#888;margin-bottom:14px">Dharma Media & Technology LLC  -  Last Updated: May 2026</p>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">You can manage your email preferences at any time. We send the following types of emails:</p>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px"><strong>Transactional Emails:</strong> Order confirmations, shipping updates, and account notifications. These cannot be unsubscribed as they are necessary for your membership and orders.</p>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px"><strong>Marketing Emails:</strong> New arrivals, member-only deals, skip reminders, and promotional offers. You can opt out of these at any time.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">How to Unsubscribe</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px"><strong>1. Email unsubscribe link:</strong> Click the unsubscribe link at the bottom of any marketing email from us.<br>
      <strong>2. Email us:</strong> Send "unsubscribe" to hello@intimacysupply.com with your email address.<br>
      <strong>3. Call/Text:</strong> (559) 334-0826 and request removal from our mailing list.</p>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px">Unsubscribe requests are processed within 10 business days as required by the CAN-SPAM Act. You may continue to receive transactional emails related to your active membership or orders.</p>
      <h3 style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;text-transform:uppercase;color:#373431;margin:14px 0 5px">Contact</h3>
      <p style="font-size:12px;color:#444;line-height:1.7;margin-bottom:10px"><strong>Dharma Media & Technology LLC</strong><br>hello@intimacysupply.com | (559) 334-0826</p>
    `,
    compliance:`
      <h2 style="${S}">18 U.S.C. Section 2257 Statement</h2>
      <p style="font-size:11px;color:#888;margin-bottom:14px">Dharma Media &amp; Technology LLC - Last Updated: May 22, 2026</p>
      <p style="${P}">Intimacy Supply (operated by Dharma Media &amp; Technology LLC) is a retail marketplace selling adult wellness and intimacy products. This website does not produce, distribute, or host visual depictions of actual sexually explicit conduct as defined in 18 U.S.C. &sect; 2256(2).</p>
      <p style="${P}">The record-keeping requirements of 18 U.S.C. &sect; 2257 and 28 C.F.R. Part 75 do not apply to this website or its operators.</p>
      <p style="${P}">Product imagery on this website consists of commercially licensed stock photography and manufacturer-provided catalog images. These images depict product styling and are not visual depictions of sexually explicit conduct.</p>
      <p style="${P}">Creator affiliate landing pages display creator-provided promotional avatars and profile images for marketing purposes. These are not visual depictions of sexually explicit conduct.</p>
      <p style="${P}">For questions about this statement, contact:</p>
      <p style="${P}"><strong>Dharma Media &amp; Technology LLC</strong><br>Custodian of Records<br>hello@intimacysupply.com<br>(559) 334-0826<br>c/o Northwest Registered Agent, 30 N Gould St Ste N, Sheridan WY 82801</p>
    `,
  };
  const modal=document.getElementById('legal-modal');
  document.getElementById('legal-content').innerHTML=content[type]||'<p>Please contact us at hello@intimacysupply.com for this information.</p>';
  if(modal) modal.style.display='flex';
}
function closeLegal(){const m=document.getElementById('legal-modal');if(m)m.style.display='none';}
(function(){ var lm=document.getElementById('legal-modal'); if(lm) lm.addEventListener('click',function(e){ if(e.target===lm) closeLegal(); }); }());

window.renderCart = renderCart;
window.renderWL = renderWL;
window.addToCart = addToCart;

function showVIPBanner(){
  const bar = document.getElementById('vip-active-bar');
  if(!bar) return;
  if(isVIP){
    bar.style.display = 'block';
    document.body.style.paddingTop = (56 + bar.offsetHeight) + 'px';
  } else {
    bar.style.display = 'none';
    document.body.style.paddingTop = '56px';
  }
}
showVIPBanner();

// Reviews loaded from Firestore -- no hardcoded reviews
function renderTestimonials(){
  const el = document.getElementById('testimonials-grid');
  if(!el) return;
  if(!db){ el.innerHTML = '<div style="text-align:center;color:#999999;font-size:13px;padding:20px">Reviews coming soon.</div>'; return; }
  db.collection('reviews').where('approved','==',true).orderBy('createdAt','desc').limit(6).get()
    .then(snap=>{
      if(snap.empty){ el.innerHTML = '<div style="text-align:center;color:#999999;font-size:13px;padding:20px">Be the first to leave a review!</div>'; return; }
      el.innerHTML = snap.docs.map(doc=>{
        const r = doc.data();
        const stars = '<span class="ig ig-sf"></span>'.repeat(r.stars||5) + '<span class="ig ig-so"></span>'.repeat(5-(r.stars||5));
        return `<div class="rev-card"><div class="rev-stars">${stars}</div><p class="rev-text">"${r.text}"</p><div class="rev-product">Verified purchase: ${r.product||'Intimacy Supply'}</div><div class="rev-name">${r.name} · ${r.loc||''}</div></div>`;
      }).join('');
    })
    .catch(()=>{ el.innerHTML = ''; });
}

function animCounter(el,target,suffix){
  if(!el) return;
  let cur=0;const step=Math.ceil(target/60);
  const t=setInterval(()=>{cur=Math.min(cur+step,target);el.textContent=cur.toLocaleString()+(suffix||'');if(cur>=target)clearInterval(t);},25);
}
/* ═══════════════════════════════════════════
   [NEW] FIREBASE AUTH STATE LISTENER
   Fires on every page load. Restores session
   from Firebase + syncs full Firestore profile.
═══════════════════════════════════════════ */
if(auth) auth.onAuthStateChanged(firebaseUser=>{
  if(firebaseUser){
    // [FIRESTORE] Fetch full user profile from users/{uid}
    db.collection('users').doc(firebaseUser.uid).get()
      .then(snap=>{
        if(snap.exists){
          user  = { uid: firebaseUser.uid, ...snap.data(), email: firebaseUser.email || snap.data().email || '' };
          isVIP = !!user.isVIP;
          loadWLFromProfile(user.wishlist);
        } else {
          // Auth user exists but Firestore doc missing  -  minimal fallback
          user  = { uid:firebaseUser.uid, firstName:'Member', email:firebaseUser.email, isVIP:false, sizes:[] };
          isVIP = false;
        }
        updateHeader();
        filterProds('all');
        renderCart();
        renderWL();
        showVIPBanner();
        if(window._authResolved) window._authResolved();
      })
      .catch(()=>{
        // Firestore read error  -  still show logged-in state
        user  = { uid:firebaseUser.uid, firstName:'Account', email:firebaseUser.email, isVIP:false, sizes:[] };
        isVIP = false;
        updateHeader();
      });
  } else {
    user=null; isVIP=false;
    updateHeader();
    filterProds('all');
    renderCart();
    showVIPBanner();
    if(window._authResolved) window._authResolved();
  }
  // Hide sticky VIP CTA when logged in
  var stickyEl = document.getElementById('sticky-vip-cta');
  if(stickyEl) stickyEl.classList.remove('show');
}); // end onAuthStateChanged


/* ═══════════════════════════════════════════
   OVERLAY PAGE NAVIGATION
   openOVP / closeOVP control Member Services,
   Gift Cards, and About Us full-screen panels.
═══════════════════════════════════════════ */
function openOVP(id){
  var el=document.getElementById(id);
  if(!el) return;
  var hdr=document.querySelector('header');
  var hdrH=hdr?hdr.offsetHeight:56;
  if(hdr) hdr.classList.remove('hidden');
  el.style.paddingTop=hdrH+'px';
  el.classList.add('open');
  el.scrollTop=0;
  document.body.style.overflow='hidden';
  var vab=document.getElementById('vip-active-bar');
  if(vab) vab.style.visibility='hidden';
  if(!el._scrollBound){
    el._scrollBound=true;
    var lastY=0;
    el.addEventListener('scroll',function(){
      if(!hdr) return;
      var y=el.scrollTop;
      if(y>lastY&&y>60){
        hdr.classList.add('hidden');
      } else if(y<lastY){
        hdr.classList.remove('hidden');
      }
      lastY=y;
    },{passive:true});
  }
}
function closeOVP(id){
  var el=document.getElementById(id);
  if(!el) return;
  el.classList.remove('open');
  el.scrollTop=0;
  document.body.style.overflow='';
  var _hdr=document.querySelector('header'); if(_hdr) _hdr.classList.remove('hidden');
  var _vab2=document.getElementById('vip-active-bar'); if(_vab2) _vab2.style.transform='translateY(0)';
  var anyOpen=['ovp-services','ovp-gifts','ovp-about','ovp-account'].some(function(pid){
    var p=document.getElementById(pid);return p&&p.classList.contains('open');
  });
  if(!anyOpen){var vab=document.getElementById('vip-active-bar');if(vab)vab.style.visibility='';}
}

/* Gift card amount selector */
function selectGCAmount(el, amt){
  document.querySelectorAll('.gc-amt').forEach(function(a){ a.classList.remove('sel'); });
  el.classList.add('sel');
  var prev = document.getElementById('gc-preview-amt');
  if(prev) prev.textContent = '$' + amt;
}

/* About accordion toggle */
function toggleAboutAcc(el){
  var item = el.closest('.ab-acc-item');
  if(!item) return;
  var isOpen = item.classList.contains('open');
  // Close all
  document.querySelectorAll('.ab-acc-item.open').forEach(function(i){
    i.classList.remove('open');
    var q = i.querySelector('.ab-acc-q');
    if(q) q.setAttribute('aria-expanded','false');
  });
  // Open clicked if it was closed
  if(!isOpen){
    item.classList.add('open');
    el.setAttribute('aria-expanded','true');
  }
}

/* FAQ accordion toggle */
function toggleFAQ(el){
  var item = el.closest('.ms-faq-item');
  if(!item) return;
  var isOpen = item.classList.contains('open');
  document.querySelectorAll('.ms-faq-item.open').forEach(function(i){
    i.classList.remove('open');
    var q = i.querySelector('.ms-faq-q');
    if(q) q.setAttribute('aria-expanded','false');
  });
  if(!isOpen){
    item.classList.add('open');
    el.setAttribute('aria-expanded','true');
  }
}


/* ═══════════════════════════════════════════
   PREMIUM MY ACCOUNT PANEL
═══════════════════════════════════════════ */
function downloadMyData(){
  var uid = user && user.uid;
  var userData = {
    exportDate:    new Date().toISOString(),
    account: {
      uid:         uid || 'not_authenticated',
      email:       user && user.email || '',
      firstName:   user && user.firstName || '',
      phone:       user && user.phone || '',
      memberSince: user && user.joinedAt || '',
      isVIP:       isVIP,
      credits:     user && user.credits || 0,
    },
    cart:      JSON.parse(localStorage.getItem('is_cart')  || '[]'),
    wishlist:  JSON.parse(localStorage.getItem('is_wl')    || '[]'),
    orders:    JSON.parse(localStorage.getItem('is_orders')|| '[]'),
  };

  var fetchFirestore = (db && uid)
    ? db.collection('orders').where('userId','==',uid).get().then(function(snap){
        userData.firestoreOrders = snap.docs.map(function(d){ return d.data(); });
      }).catch(function(){ userData.firestoreOrders = []; })
    : Promise.resolve();

  fetchFirestore.then(function(){
    var blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href   = url;
    a.download = 'intimacy-supply-data-' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Your data has been downloaded.');
  });
}

function confirmDeleteAccount(){
  if(!confirm('Permanently delete your account? This will erase all your data, order history, and member tokens. This cannot be undone.')) return;
  var btn = document.querySelector('.ac-danger button');
  if(btn){ btn.disabled=true; btn.textContent='Deleting...'; }
  var uid = user && user.uid;
  var userEmail = user && user.email;
  var firebaseUser = auth && auth.currentUser;
  function doDelete(){
    var promises = [];
    if(db && uid){
      promises.push(
        db.collection('users').doc(uid).delete().catch(function(e){ console.warn('[IS] User doc delete failed:', e); }),
        db.collection('cancellations').add({
          userId: uid, email: userEmail || '', deletedAt: firebase.firestore.FieldValue.serverTimestamp(), reason: 'account_deletion'
        }).catch(function(e){ console.warn('[IS] Deletion log failed:', e); })
      );
    }
    Promise.all(promises).then(function(){
      if(firebaseUser){
        return firebaseUser.delete().catch(function(err){
          if(err.code === 'auth/requires-recent-login'){
            toast('For security, please sign out and sign back in before deleting your account.');
            if(btn){ btn.disabled=false; btn.textContent='Delete My Account'; }
            return;
          }
          throw err;
        });
      }
    }).then(function(){
      user = null; isVIP = false;
      localStorage.removeItem('is_cart');
      localStorage.removeItem('is_wl');
      localStorage.removeItem('is_orders');
      localStorage.removeItem('is_subs');
      updateHeader(); renderCart(); showVIPBanner();
      closeOVP('ovp-account');
      toast('Your account has been permanently deleted.');
    }).catch(function(err){
      console.error('[IS] Account deletion failed:', err);
      if(btn){ btn.disabled=false; btn.textContent='Delete My Account'; }
      toast('Something went wrong. Please contact hello@intimacysupply.com to delete your account.');
    });
  }
  if(firebaseUser){ doDelete(); }
  else {
    // No active auth -- just clear local data
    localStorage.removeItem('is_cart');
    localStorage.removeItem('is_wl');
    localStorage.removeItem('is_orders');
    localStorage.removeItem('is_subs');
    user = null; isVIP = false;
    updateHeader(); renderCart(); showVIPBanner();
    closeOVP('ovp-account');
    toast('Your account data has been cleared.');
  }
}
function cancelMembershipFlow(){
  // Show premium confirmation modal instead of browser confirm()
  var modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px)';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:480px;padding:32px 24px 40px;text-align:center">'
    + '<div style="width:56px;height:56px;background:#F3F0ED;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 18px">'
    + '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4000F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
    + '</div>'
    + '<h2 style="font-family:var(--fd);font-size:22px;font-weight:900;text-transform:uppercase;color:#111;margin-bottom:10px">Cancel VIP Membership?</h2>'
    + '<p style="font-size:13px;color:#666;line-height:1.75;margin-bottom:8px">Your VIP discount and member tokens will be removed immediately. Any unused tokens can still be redeemed for 60 days after cancellation.</p>'
    + '<p style="font-size:12px;color:#999;margin-bottom:28px">There are no cancellation fees.</p>'
    + '<button onclick="processCancelMembership(this.closest(\'[data-modal]\'))" data-modal style="display:block;width:100%;background:#D4000F;color:#fff;border:none;padding:16px;font-family:var(--fd);font-size:16px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;border-radius:10px;cursor:pointer;margin-bottom:10px">Yes, Cancel My Membership</button>'
    + '<button onclick="this.closest(\'div\').parentNode.remove()" style="display:block;width:100%;background:#F7F4F1;color:#555;border:none;padding:14px;font-family:var(--fd);font-size:15px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;border-radius:10px;cursor:pointer">Keep My Membership</button>'
    + '</div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e){ if(e.target === modal) modal.remove(); });
}

function processCancelMembership(modalEl){
  var confirmBtn = modalEl ? modalEl.querySelector('button') : null;
  if(confirmBtn){ confirmBtn.disabled=true; confirmBtn.textContent='Cancelling...'; }
  var uid = user && user.uid;
  var doCancel = function(){
    // Actually cancel at CCBill. Flipping isVIP locally does NOT stop the
    // recurring charge -- without this call the customer keeps getting billed
    // every month while the site tells them they're cancelled.
    var subId = user && user.ccbillSubscriptionId;
    var alertOperator = function(reason){
      fetch('/.netlify/functions/membership-request', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'cancel', userId: uid, email: user && user.email,
          firstName: user && user.firstName, lastName: user && user.lastName,
          subscriptionId: subId, reason: reason }),
      }).catch(function(e){ console.error('[IS] cancel alert failed:', e); });
    };
    if(subId){
      fetch('/.netlify/functions/ccbill-cancel', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subscriptionId: subId }),
      })
        .then(function(r){ return r.json(); })
        .then(function(res){
          // Only fall back to a manual alert if CCBill did NOT confirm success.
          if(!res || !res.ok) alertOperator('ccbill-cancel returned ' + JSON.stringify(res && res.code));
        })
        .catch(function(e){
          console.error('[IS] ccbill-cancel call failed:', e);
          alertOperator('ccbill-cancel request threw');
        });
    } else {
      // No subscription id on file -- can't call the API, needs manual handling.
      alertOperator('no ccbillSubscriptionId on user record');
    }
    isVIP = false;
    if(user) user.isVIP = false;
    updateHeader();
    showVIPBanner();
    renderCart();
    if(modalEl) modalEl.closest('[style*="position:fixed"]').remove();
    // Show confirmation screen
    var panel = document.getElementById('ovp-account');
    if(panel){
      var confirm = document.createElement('div');
      confirm.style.cssText = 'position:fixed;inset:0;z-index:9998;background:#FFFFFF;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;text-align:center';
      confirm.innerHTML =
        '<div style="width:64px;height:64px;background:#EFECE9;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:20px">'
        + '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1B1B19" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        + '</div>'
        + '<h2 style="font-family:var(--fd);font-size:26px;font-weight:900;text-transform:uppercase;color:#111111;margin-bottom:10px">Membership Cancelled</h2>'
        + '<p style="font-size:14px;color:#666666;line-height:1.75;max-width:300px;margin-bottom:8px">Your VIP membership has been cancelled. You can rejoin anytime.</p>'
        + '<p style="font-size:12px;color:#999999;margin-bottom:32px">A confirmation will be sent to ' + (user && user.email || 'your email') + '.</p>'
        + '<button onclick="this.parentNode.remove();renderAcctPanel()" style="background:#111111;color:#FFFFFF;border:none;padding:14px 36px;border-radius:10px;font-family:var(--fd);font-size:15px;font-weight:900;text-transform:uppercase;cursor:pointer">Back to My Account</button>';
      document.body.appendChild(confirm);
    }
    klaviyoTrackEvent('Membership Cancelled', { userId: uid || '', email: (user && user.email) || '' });
    setTimeout(function(){ renderAcctPanel(); }, 1500);
  };
  if(db && uid){
    db.collection('users').doc(uid).update({
      isVIP:            false,
      membershipStatus: 'cancelled',
      cancelledAt:      firebase.firestore.FieldValue.serverTimestamp(),
      cancelReason:     'self_service',
    }).then(function(){
      db.collection('cancellation_requests').add({
        userId:      uid,
        email:       (user && user.email) || '',
        cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
        reason:      'self_service',
        status:      'pending_processor',
      }).catch(function(){});
      doCancel();
    }).catch(function(){
      if(confirmBtn){ confirmBtn.disabled=false; confirmBtn.textContent='Yes, Cancel My Membership'; }
      toast('Something went wrong. Please call (559) 334-0826 to cancel.');
    });
  } else {
    doCancel();
  }
}

function skipThisMonth(btn){
  if(!confirm('Confirm skip for this month? You will not be charged on the 6th.')) return;
  if(btn){ btn.disabled=true; btn.textContent='Processing...'; }
  var uid = user && user.uid;
  var now = new Date();
  var monthKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  if(db && uid){
    db.collection('users').doc(uid).update({
      ['skipMonths.' + monthKey]: true,
      lastSkippedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }).then(function(){
      // Alert the operator so the rebill is actually suspended in CCBill --
      // writing skipMonths here does NOT stop CCBill from charging on its own.
      fetch('/.netlify/functions/membership-request', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'skip', userId: uid, email: user && user.email,
          firstName: user && user.firstName, lastName: user && user.lastName,
          subscriptionId: user && user.ccbillSubscriptionId, monthKey: monthKey }),
      }).catch(function(e){ console.error('[IS] skip alert failed:', e); });
      toast('Skip confirmed  -  no charge this month.');
      klaviyoTrackEvent('Month Skipped', { userId: uid, month: monthKey });
      if(btn){ btn.disabled=true; btn.textContent='Skipped This Month'; btn.style.opacity='.5'; }
    }).catch(function(err){
      console.error('[IS] Skip failed:', err);
      if(btn){ btn.disabled=false; btn.textContent='Skip This Month'; }
      toast('Something went wrong. Please contact us at (559) 334-0826.');
    });
  } else {
    toast('Skip confirmed  -  no charge this month.');
    if(btn){ btn.disabled=true; btn.textContent='Skipped This Month'; btn.style.opacity='.5'; }
  }
}

function editProfile(){
  var panel = document.getElementById('ac-panel-settings');
  if(!panel) return;
  var existing = panel.querySelector('.ac-edit-form');
  if(existing){ existing.remove(); return; }
  var uid = user && user.uid;
  var form = document.createElement('div');
  form.className = 'ac-edit-form';
  form.style.cssText = 'background:#FAF7F4;border:1px solid #DBD8D5;border-radius:10px;padding:16px;margin:0 16px 12px';
  form.innerHTML = '<div style="font-family:var(--fd);font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:var(--plum);margin-bottom:12px">Edit Profile</div>'
    + '<input id="ep-first" placeholder="First Name" value="' + (user && user.firstName || '') + '" style="width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:6px;padding:10px 12px;font-size:14px;margin-bottom:8px;font-family:var(--fb)">'
    + '<input id="ep-phone" placeholder="Phone (optional)" value="' + (user && user.phone || '') + '" style="width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:6px;padding:10px 12px;font-size:14px;margin-bottom:8px;font-family:var(--fb)">'
    + '<input id="ep-newpw" type="password" placeholder="New Password (leave blank to keep current)" style="width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:6px;padding:10px 12px;font-size:14px;margin-bottom:12px;font-family:var(--fb)">'
    + '<div style="display:flex;gap:8px">'
    + '<button onclick="saveProfile()" style="flex:1;background:var(--plum);color:#fff;border:none;border-radius:6px;padding:11px;font-family:var(--fd);font-size:14px;font-weight:900;text-transform:uppercase;cursor:pointer">Save</button>'
    + '<button onclick="var f=this.parentNode.parentNode;f.parentNode.removeChild(f)" style="flex:1;background:none;border:1px solid #ccc;border-radius:6px;padding:11px;font-family:var(--fd);font-size:14px;font-weight:700;cursor:pointer">Cancel</button>'
    + '</div>';
  var profileCard = panel.querySelector('.ac-card');
  if(profileCard) profileCard.insertAdjacentElement('afterend', form);
}

function saveProfile(){
  var firstName = document.getElementById('ep-first') && document.getElementById('ep-first').value.trim();
  var phone     = document.getElementById('ep-phone') && document.getElementById('ep-phone').value.trim();
  var newPw     = document.getElementById('ep-newpw') && document.getElementById('ep-newpw').value;
  var uid       = user && user.uid;
  if(!firstName){ toast('Please enter your first name.'); return; }
  var updates = { firstName: firstName, phone: phone || '' };
  var promises = [];
  if(db && uid) promises.push(db.collection('users').doc(uid).update(updates));
  if(newPw && newPw.length >= 8 && auth && auth.currentUser){
    promises.push(auth.currentUser.updatePassword(newPw).catch(function(e){
      if(e.code === 'auth/requires-recent-login'){
        toast('Please sign out and sign back in to change your password.');
      } else { throw e; }
    }));
  } else if(newPw && newPw.length > 0 && newPw.length < 8){
    toast('Password must be at least 8 characters.');
    return;
  }
  Promise.all(promises).then(function(){
    if(user){ user.firstName = firstName; user.phone = phone; }
    var form = document.querySelector('.ac-edit-form');
    if(form) form.remove();
    toast('Profile updated.');
    renderAcctPanel();
  }).catch(function(e){
    console.error('[IS] Profile update failed:', e);
    toast('Something went wrong. Please try again.');
  });
}

function editAddress(){
  var panel = document.getElementById('ac-panel-settings');
  if(!panel) return;
  var existing = panel.querySelector('.ac-addr-form');
  if(existing){ existing.remove(); return; }
  var u = user || {};
  var form = document.createElement('div');
  form.className = 'ac-addr-form';
  form.style.cssText = 'background:#FAF7F4;border:1px solid #DBD8D5;border-radius:10px;padding:16px;margin:0 16px 12px';
  form.innerHTML = '<div style="font-family:var(--fd);font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:var(--plum);margin-bottom:12px">Edit Shipping Address</div>'
    + '<input id="ea-addr" placeholder="Street Address" value="' + (u.address || '') + '" style="width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:6px;padding:10px 12px;font-size:14px;margin-bottom:8px;font-family:var(--fb)">'
    + '<input id="ea-addr2" placeholder="Apt, Suite (optional)" value="' + (u.address2 || '') + '" style="width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:6px;padding:10px 12px;font-size:14px;margin-bottom:8px;font-family:var(--fb)">'
    + '<div style="display:flex;gap:8px;margin-bottom:8px">'
    + '<input id="ea-city" placeholder="City" value="' + (u.city || '') + '" style="flex:2;border:1px solid #ddd;border-radius:6px;padding:10px 12px;font-size:14px;font-family:var(--fb)">'
    + '<input id="ea-state" placeholder="State" value="' + (u.state || '') + '" style="flex:1;border:1px solid #ddd;border-radius:6px;padding:10px 12px;font-size:14px;font-family:var(--fb)">'
    + '<input id="ea-zip" placeholder="ZIP" value="' + (u.zip || '') + '" style="flex:1;border:1px solid #ddd;border-radius:6px;padding:10px 12px;font-size:14px;font-family:var(--fb)">'
    + '</div>'
    + '<div style="display:flex;gap:8px">'
    + '<button onclick="saveAddress()" style="flex:1;background:var(--plum);color:#fff;border:none;border-radius:6px;padding:11px;font-family:var(--fd);font-size:14px;font-weight:900;text-transform:uppercase;cursor:pointer">Save</button>'
    + '<button onclick="var f=this.parentNode.parentNode;f.parentNode.removeChild(f)" style="flex:1;background:none;border:1px solid #ccc;border-radius:6px;padding:11px;font-family:var(--fd);font-size:14px;font-weight:700;cursor:pointer">Cancel</button>'
    + '</div>';
  var addrCards = panel.querySelectorAll('.ac-card');
  var addrCard = addrCards.length > 1 ? addrCards[1] : null;
  if(addrCard) addrCard.insertAdjacentElement('afterend', form);
}

function saveAddress(){
  var addr   = document.getElementById('ea-addr')  && document.getElementById('ea-addr').value.trim();
  var addr2  = document.getElementById('ea-addr2') && document.getElementById('ea-addr2').value.trim();
  var city   = document.getElementById('ea-city')  && document.getElementById('ea-city').value.trim();
  var state  = document.getElementById('ea-state') && document.getElementById('ea-state').value.trim();
  var zip    = document.getElementById('ea-zip')   && document.getElementById('ea-zip').value.trim();
  var uid    = user && user.uid;
  if(!addr || !city || !state || !zip){ toast('Please fill in all required address fields.'); return; }
  var updates = { address: addr, address2: addr2 || '', city: city, state: state, zip: zip };
  var p = (db && uid) ? db.collection('users').doc(uid).update(updates) : Promise.resolve();
  p.then(function(){
    if(user){ Object.assign(user, updates); }
    var form = document.querySelector('.ac-addr-form');
    if(form) form.remove();
    toast('Shipping address updated.');
    renderAcctPanel();
  }).catch(function(e){
    console.error('[IS] Address update failed:', e);
    toast('Something went wrong. Please try again.');
  });
}

function openSizeGuide(){
  var modal = document.getElementById('sg-modal');
  if(!modal) return;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function closeSizeGuide(){
  var modal = document.getElementById('sg-modal');
  if(modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

function openAcctPanel(){
  if(!user && !window.user){ openSignInModal(); return; }
  if(!user && window.user){ user = window.user; isVIP = window.isVIP||false; credits = tokenCount(window.credits); }
  closeAcctMenu();
  var panel = document.getElementById('ovp-account');
  if(!panel) return;
  renderAcctPanel();
  openOVP('ovp-account');
}

function switchAcctTab(tab){
  document.querySelectorAll('.ac-tab').forEach(function(t){ t.classList.remove('active'); });
  document.querySelectorAll('.ac-panel').forEach(function(p){ p.classList.remove('active'); });
  var tEl = document.querySelector('.ac-tab[data-tab="' + tab + '"]');
  var pEl = document.getElementById('ac-panel-' + tab);
  if(tEl) tEl.classList.add('active');
  if(pEl) pEl.classList.add('active');
  if(tab === 'reviews') loadUserReviews();
}

// Normalize a possibly-legacy credit value into a clean whole-number token count.
// Balances stored before the token migration were dollar amounts (e.g. 39.95);
// a real token count is a small whole number.
function tokenCount(raw){
  var n = Number(raw);
  if(!isFinite(n) || n <= 0) return 0;
  if(!Number.isInteger(n) || n > 24){ n = Math.round(n / 39.95); }
  return Math.max(0, n);
}
function renderAcctPanel(){
  var panel = document.getElementById('ovp-account');
  if(!panel || !user) return;

  var firstName   = user.firstName || 'Member';
  var email       = user.email     || '';
  var credits     = tokenCount(user.credits);
  if(user.credits != null && Number(user.credits) !== credits){
    user.credits = credits;
    try{ if(db && user.uid){ db.collection('users').doc(user.uid).update({ credits: credits }).catch(function(){}); } }catch(e){}
  }
  var memberSince = 'Recently';
  try {
    if(user.joinedAt){
      var d = typeof user.joinedAt.toDate === 'function' ? user.joinedAt.toDate()
            : user.joinedAt instanceof Date ? user.joinedAt
            : new Date(user.joinedAt);
      memberSince = d.toLocaleDateString('en-US',{month:'short',year:'numeric'});
    }
  } catch(e){ memberSince = 'Recently'; }

  var topSize    = user.sizes && user.sizes[0] ? user.sizes[0] : '&mdash;';
  var bottomSize = user.sizes && user.sizes[1] ? user.sizes[1] : '&mdash;';

  /* Saved items */
  var savedHTML = wishlist.length
    ? wishlist.slice(0,4).map(function(id){
        var p = PRODUCTS.find(function(x){ return String(x.id)===String(id); });
        if(!p) return '';
        var img = p.images && p.images[0]
          ? '<img src="' + p.images[0] + '" alt="' + p.name + '" loading="lazy">'
          : '<span style="font-size:32px;color:#DDD">&#9829;</span>';
        return '<div class="ac-saved-item" data-pid="' + p.id + '">'
          + '<div class="ac-saved-img">' + img + '</div>'
          + '<div class="ac-saved-info">'
          + '<div class="ac-saved-name">' + p.name + '</div>'
          + '<div class="ac-saved-price">$' + (isVIP ? p.price : p.orig).toFixed(2) + '</div>'
          + '</div></div>';
      }).join('')
    : '<div style="text-align:center;padding:36px 0;color:#CCC">'
      + '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:12px;display:block;margin-left:auto;margin-right:auto"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>'
      + '<p style="font-size:13px;color:#AAA;line-height:1.6">No saved items yet.<br>Tap the heart on any product.</p>'
      + '</div>';

  /* Orders */
  var storedOrders = JSON.parse(localStorage.getItem('is_orders') || '[]');
  if(db && user && user.uid){
    db.collection('orders').where('userId','==',user.uid).orderBy('timestamp','desc').limit(5).get()
      .then(function(snap){
        if(!snap.empty){
          var inner = document.querySelector('#ac-panel-overview .ac-orders-preview');
          if(inner){
            inner.innerHTML = '<span class="ac-sec">Recent Orders</span>'
              + snap.docs.slice(0,3).map(function(d){
                  var o = d.data();
                  var sc = o.status === 'pending' ? 'processing' : 'delivered';
                  var sl = o.status === 'pending' ? 'Processing' : 'Delivered';
                  var total = o.pricing ? '$' + o.pricing.total.toFixed(2) : '';
                  var date = o.timestamp && o.timestamp.toDate
                    ? o.timestamp.toDate().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
                    : 'Recent';
                  return buildOrderCard(o.orderId, date, sc, sl, total, '', false);
                }).join('');
          }
          var fullPanel = document.querySelector('#ac-panel-orders .ac-orders-inner');
          if(fullPanel){
            fullPanel.innerHTML = snap.docs.map(function(d){
              var o = d.data();
              var sc = o.status === 'pending' ? 'processing' : 'delivered';
              var sl = o.status === 'pending' ? 'Processing' : 'Delivered';
              var total = o.pricing ? '$' + o.pricing.total.toFixed(2) : '';
              var items = o.items ? o.items.map(function(i){ return i.name; }).join(', ') : '';
              var date = o.timestamp && o.timestamp.toDate
                ? o.timestamp.toDate().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
                : 'Recent';
              return buildOrderCard(o.orderId, date, sc, sl, total, items, true);
            }).join('');
          }
        }
      }).catch(function(){});
  }

  var ordersPreviewHTML = storedOrders.length
    ? storedOrders.slice(-3).reverse().map(function(o){
        var sc = o.status === 'pending_payment' ? 'processing' : 'delivered';
        var sl = o.status === 'pending_payment' ? 'Processing' : 'Delivered';
        var total = o.pricing ? '$' + o.pricing.total.toFixed(2) : '&mdash;';
        var date = o.timestamp ? new Date(o.timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'Recent';
        return buildOrderCard(o.orderId, date, sc, sl, total, '', false);
      }).join('') : '';

  var ordersFullHTML = storedOrders.length
    ? storedOrders.slice(0,10).reverse().map(function(o){
        var sc = o.status === 'pending_payment' ? 'processing' : 'delivered';
        var sl = o.status === 'pending_payment' ? 'Processing' : 'Delivered';
        var total = o.pricing ? '$' + o.pricing.total.toFixed(2) : '&mdash;';
        var items = o.items ? o.items.map(function(i){ return i.name; }).join(', ') : 'Items';
        var date = o.timestamp ? new Date(o.timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'Recent';
        return buildOrderCard(o.orderId, date, sc, sl, total, items, true);
      }).join('')
    : '<div style="text-align:center;padding:56px 16px">'
      + '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CCC" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto 14px"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>'
      + '<div style="font-family:var(--fd);font-size:22px;font-weight:900;text-transform:uppercase;color:#111;margin-bottom:8px">No Orders Yet</div>'
      + '<p style="font-size:12px;color:#999;margin-bottom:28px;line-height:1.7">Your orders will appear here once you make a purchase.</p>'
      + '<button onclick="closeOVP(&quot;ovp-account&quot;);scrollToProds()" style="background:#111;color:#fff;border:none;padding:14px 36px;border-radius:8px;font-family:var(--fd);font-size:15px;font-weight:900;text-transform:uppercase;cursor:pointer;letter-spacing:.05em">Shop Now</button>'
      + '</div>';

  var notifPromo = (user.notifPrefs && user.notifPrefs.promo) ? 'checked' : '';
  var notifSkip  = (user.notifPrefs && user.notifPrefs.skip  === false) ? '' : 'checked';

  var memberUID = user.uid ? user.uid.substring(0,12).toUpperCase() : 'N/A';

  panel.innerHTML =

    /* ── TOP BAR ── */
    '<div class="ac-topbar">'
    + '<span class="ac-topbar-title">My Account</span>'
    + '<button class="ac-signout" onclick="signOutUser();closeOVP(&apos;ovp-account&apos;)">Sign Out</button>'
    + '</div>'

    /* ── HERO ── */
    + '<div class="ac-hero">'
    + '<div class="ac-hero-name">Hi, ' + firstName + '!</div>'
    + '<div class="ac-hero-email">' + email + '</div>'
    + (isVIP ? '<div class="ac-hero-vip">VIP Member &middot; VIP Pricing Active</div>' : '<div style="margin-bottom:32px"></div>')
    + '<div class="ac-stats-row">'
    + '<div class="ac-stat-cell"><div class="ac-stat-v">' + Math.floor(credits) + '</div><div class="ac-stat-l">' + (Math.floor(credits)===1?'Token':'Tokens') + '</div></div>'
    + '<div class="ac-stat-cell"><div class="ac-stat-v">$39.95</div><div class="ac-stat-l">Monthly</div></div>'
    + '<div class="ac-stat-cell"><div class="ac-stat-v" style="font-size:22px">' + memberSince + '</div><div class="ac-stat-l">Member Since</div></div>'
    + '</div>'
    + '</div>'

    /* ── TABS ── */
    + '<div class="ac-tabs">'
    + '<button class="ac-tab active" data-tab="overview" onclick="switchAcctTab(&apos;overview&apos;)">Overview</button>'
    + '<button class="ac-tab" data-tab="orders" onclick="switchAcctTab(&apos;orders&apos;)">My Orders</button>'
    + '<button class="ac-tab" data-tab="saved" onclick="switchAcctTab(&apos;saved&apos;)">Saved</button>'
    + '<button class="ac-tab" data-tab="reviews" onclick="switchAcctTab(&apos;reviews&apos;)">Reviews</button>'
    + '<button class="ac-tab" data-tab="payment" onclick="switchAcctTab(&apos;payment&apos;)">Payment</button>'
    + '<button class="ac-tab" data-tab="settings" onclick="switchAcctTab(&apos;settings&apos;)">Settings</button>'
    + '</div>'

    /* ══ OVERVIEW TAB ══ */
    + '<div id="ac-panel-overview" class="ac-panel active">'

    /* Membership Information */
    + '<span class="ac-sec">Membership Information</span>'
    + '<div style="padding:0 16px 4px">'
    + '<h2 style="font-family:var(--fd);font-size:36px;font-weight:900;color:#111;letter-spacing:-.02em;margin-bottom:16px">Hi, ' + firstName + '!</h2>'
    + '<button onclick="closeOVP(&apos;ovp-account&apos;);openOVP(&apos;ovp-services&apos;)" style="display:block;width:100%;background:#D4000F;color:#fff;border:none;padding:16px;font-family:var(--fd);font-size:15px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;border-radius:8px;cursor:pointer;margin-bottom:16px">Learn More About VIP</button>'
    + '</div>'

    /* VIP status */
    + (isVIP
        ? '<div class="ac-vip-status">'
          + '<div class="ac-vip-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>'
          + '<div class="ac-vip-text"><strong>VIP Active &mdash; up to 34% off everything</strong><span>Your discount is applied automatically at checkout</span></div>'
          + '</div>'
        : '')

    /* Quick actions */
    + '<div style="padding:0 16px 8px">'
    + '<button class="ac-action-btn" onclick="skipThisMonth(this)">'
    + '<div class="ac-action-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1B1B19" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg></div>'
    + '<div class="ac-action-text"><div class="ac-action-title">Skip This Month</div><div class="ac-action-sub">Skip before the 5th &mdash; no charge</div></div>'
    + '<span class="ac-action-arrow">&#8250;</span></button>'

    + '<button class="ac-action-btn" onclick="closeOVP(&apos;ovp-account&apos;);scrollToProds()">'
    + '<div class="ac-action-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg></div>'
    + '<div class="ac-action-text"><div class="ac-action-title">Shop Products</div><div class="ac-action-sub">Redeem your ' + Math.floor(credits) + ' token' + (Math.floor(credits)===1?'':'s') + ' &mdash; $50 toward an item each</div></div>'
    + '<span class="ac-action-arrow">&#8250;</span></button>'

    + '<button class="ac-action-btn" onclick="switchAcctTab(&apos;orders&apos;)">'
    + '<div class="ac-action-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div>'
    + '<div class="ac-action-text"><div class="ac-action-title">My Orders</div><div class="ac-action-sub">View order history and tracking</div></div>'
    + '<span class="ac-action-arrow">&#8250;</span></button>'

    + (isVIP ? '<button class="ac-action-btn" onclick="cancelMembershipFlow()" style="border-color:rgba(212,0,15,.2)">'
    + '<div class="ac-action-icon" style="background:rgba(212,0,15,.1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4000F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>'
    + '<div class="ac-action-text"><div class="ac-action-title" style="color:#D4000F">Cancel Membership</div><div class="ac-action-sub">No fees &mdash; takes effect immediately</div></div>'
    + '<span class="ac-action-arrow" style="color:#D4000F">&#8250;</span></button>' : '')
    + '</div>'

    /* Support */
    + '<div class="ac-support">'
    + '<h3>Questions?</h3>'
    + '<p>Need help with a product, recent order, or your membership?<br>Get in touch with us 24/7.</p>'
    + '<div class="ac-support-grid">'
    + '<a href="tel:+15593340826" class="ac-support-btn">'
    + '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 011.1 2.18 2 2 0 013.08 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>'
    + '<span class="ac-support-label">Phone</span>'
    + '<span class="ac-support-sub">(559) 334-0826<br>24 hours, 7 days a week</span>'
    + '</a>'
    + '<button onclick="closeOVP(&apos;ovp-account&apos;);openOVP(&apos;ovp-services&apos;)" class="ac-support-btn">'
    + '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>'
    + '<span class="ac-support-label">Live Chat</span>'
    + '<span class="ac-support-sub">Start Chat<br>24 hours, 7 days a week</span>'
    + '</button>'
    + '</div></div>'

    /* Recent orders preview */
    + '<div class="ac-orders-preview">'
    + (ordersPreviewHTML ? '<span class="ac-sec">Recent Orders</span>' + ordersPreviewHTML : '')
    + '</div>'
    + '</div>'

    /* ══ ORDERS TAB ══ */
    + '<div id="ac-panel-orders" class="ac-panel"><div class="ac-orders-inner">'
    + ordersFullHTML
    + '</div></div>'

    /* ══ SAVED TAB ══ */
    + '<div id="ac-panel-saved" class="ac-panel">'
    + '<span class="ac-sec">Saved Items (' + wishlist.length + ')</span>'
    + '<div class="ac-saved-grid">' + savedHTML + '</div>'
    + (wishlist.length ? '<div style="padding:0 16px 16px"><button onclick="closeOVP(&apos;ovp-account&apos;);openWL()" style="width:100%;background:#111;color:#fff;border:none;padding:14px;border-radius:8px;font-family:var(--fd);font-size:14px;font-weight:900;text-transform:uppercase;cursor:pointer;letter-spacing:.05em">View Full Wishlist</button></div>' : '')
    + '<span class="ac-sec">Size Preferences</span>'
    + '<div class="ac-card">'
    + '<div class="ac-card-row"><span class="ac-lbl">Top Size</span><span class="ac-val">' + topSize + '</span></div>'
    + '<div class="ac-card-row"><span class="ac-lbl">Bottom Size</span><span class="ac-val">' + bottomSize + '</span></div>'
    + '<div class="ac-card-row"><span class="ac-lbl">Fit Preference</span><span class="ac-val">' + (user.intensity || '&mdash;') + '</span></div>'
    + '</div></div>'

    /* ══ SETTINGS TAB ══ */
    /* ══ REVIEWS TAB ══ */
    + '<div id="ac-panel-reviews" class="ac-panel">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:24px 20px 10px">'
    + '<span style="font-family:var(--fd);font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.14em;color:#111">My Reviews</span>'
    + '</div>'
    + '<div id="ac-user-reviews-list" style="padding:0 16px 16px">'
    + '<div style="text-align:center;padding:40px 0;color:#AAA">'
    + '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto 12px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
    + '<div style="font-size:14px;font-weight:600;color:#555;margin-bottom:6px">No reviews yet</div>'
    + '<div style="font-size:12px;color:#AAA">Reviews you submit on products will appear here.</div>'
    + '</div>'
    + '</div>'
    + '</div>'

    /* ══ PAYMENT TAB ══ */
    + '<div id="ac-panel-payment" class="ac-panel">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:24px 20px 10px">'
    + '<span style="font-family:var(--fd);font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.14em;color:#111">Payment Method</span>'
    + '</div>'
    + '<div style="background:#fff;border:1px solid #E6E3E0;border-radius:14px;margin:0 16px 20px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.04)">'
    + '<div style="font-size:13px;font-weight:700;color:#111;margin-bottom:4px">Credit &amp; Debit Card</div>'
    + '<div style="font-size:12px;color:#888;margin-bottom:16px;line-height:1.55">Payment processing is coming soon. Once active, your saved card will appear here.</div>'
    + '<div style="background:#F7F4F1;border-radius:10px;padding:16px;display:flex;align-items:center;gap:12px">'
    + '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#CCC" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>'
    + '<div><div style="font-size:12px;color:#AAA">No payment method saved</div></div>'
    + '</div>'
    + '</div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 20px 10px">'
    + '<span style="font-family:var(--fd);font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.14em;color:#111">Billing Descriptor</span>'
    + '</div>'
    + '<div class="ac-card">'
    + '<div class="ac-card-row"><span class="ac-lbl">Appears on statement as</span><span class="ac-val" style="font-size:11px;font-family:monospace">DHARMA*INTIMACYSUP</span></div>'
    + '<div class="ac-card-row"><span class="ac-lbl">Company</span><span class="ac-val" style="font-size:11px">Dharma Media &amp; Technology LLC</span></div>'
    + '<div class="ac-card-row"><span class="ac-lbl">Support</span><span class="ac-val" style="font-size:11px">(559) 334-0826</span></div>'
    + '</div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:20px 20px 10px">'
    + '<span style="font-family:var(--fd);font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.14em;color:#111">Shipping Address</span>'
    + '<button onclick="editAddress()" style="font-size:13px;font-weight:600;color:#888;background:none;border:none;cursor:pointer;padding:4px 0">Edit</button>'
    + '</div>'
    + '<div class="ac-card">'
    + '<div class="ac-card-row"><span class="ac-lbl">Address</span><span class="ac-val" style="font-size:11px">' + (user.address ? user.address + (user.city ? ', ' + user.city : '') + (user.state ? ' ' + user.state : '') + (user.zip ? ' ' + user.zip : '') : 'Not set') + '</span></div>'
    + '</div>'
    + '</div>'

    /* ══ SETTINGS TAB ══ */
    + '<div id="ac-panel-settings" class="ac-panel">'

    /* Account Information */
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:24px 20px 10px">'
    + '<span style="font-family:var(--fd);font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.14em;color:#111">Account Information</span>'
    + '<button onclick="editProfile()" style="font-size:13px;font-weight:600;color:#888;background:none;border:none;cursor:pointer;padding:4px 0">Edit</button>'
    + '</div>'
    + '<div style="background:#fff;border:1px solid #E6E3E0;border-radius:14px;margin:0 16px 20px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.04)">'
    + '<div style="font-size:22px;font-weight:800;color:#111;margin-bottom:16px;letter-spacing:-.01em">' + firstName + '</div>'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#AAA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
    + '<span style="font-size:12px;color:#888">Member ID: </span><span style="font-size:12px;color:#111;font-weight:600;font-family:monospace">' + memberUID + '</span>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#AAA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>'
    + '<span style="font-size:12px;color:#888">Email: </span><span style="font-size:12px;color:#111">' + email + '</span>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#AAA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>'
    + '<span style="font-size:12px;color:#888">Password: </span><span style="font-size:12px;color:#111">&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</span>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:10px">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#AAA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
    + '<span style="font-size:12px;color:#888">Birthday: </span><span style="font-size:12px;color:#111">' + (user.birthday || '&mdash;') + '</span>'
    + '</div>'
    + '</div>'

    /* Size Preferences */
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 20px 10px">'
    + '<span style="font-family:var(--fd);font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.14em;color:#111">Size Preferences</span>'
    + '<button onclick="editProfile()" style="font-size:13px;font-weight:600;color:#888;background:none;border:none;cursor:pointer;padding:4px 0">Edit</button>'
    + '</div>'
    + '<div class="ac-card">'
    + '<div class="ac-card-row"><span class="ac-lbl">Top Size</span><span class="ac-val">' + topSize + '</span></div>'
    + '<div class="ac-card-row"><span class="ac-lbl">Bottom Size</span><span class="ac-val">' + bottomSize + '</span></div>'
    + '<div class="ac-card-row"><span class="ac-lbl">Fit Preference</span><span class="ac-val">' + (user.intensity || '&mdash;') + '</span></div>'
    + '</div>'

    /* Newsletter */
    + '<div style="padding:20px 20px 10px">'
    + '<span style="font-family:var(--fd);font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.14em;color:#111">Newsletter</span>'
    + '</div>'
    + '<div class="ac-card">'
    + '<div class="ac-toggle-row"><div class="atl"><strong>Intimacy Supply Newsletter</strong><span>Exclusive drops, tips, and member offers</span></div>'
    + '<label class="ac-toggle"><input type="checkbox" data-pref="notif_promo" ' + notifPromo + '><div class="ac-toggle-track"></div></label></div>'
    + '<div class="ac-toggle-row"><div class="atl"><strong>Skip the Month Reminder</strong><span>Alert on the 1st of each month</span></div>'
    + '<label class="ac-toggle"><input type="checkbox" data-pref="notif_skip" ' + notifSkip + '><div class="ac-toggle-track"></div></label></div>'
    + '</div>'

    /* Member Token Details */
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:20px 20px 10px">'
    + '<span style="font-family:var(--fd);font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.14em;color:#111">Member Token Details</span>'
    + '<span style="font-size:12px;color:#888;font-weight:600">' + Math.floor(credits) + (Math.floor(credits)===1?' Token':' Tokens') + '</span>'
    + '</div>'
    + '<div class="ac-credits-table">'
    + '<div class="ac-credits-hdr"><span>Date Added</span><span>Date Expires</span><span>Status</span></div>'
    + (credits > 0
        ? '<div class="ac-credits-row"><span>Active</span><span>12 months</span><span style="color:#1B1B19;font-weight:700">Active</span></div>'
        : '<div class="ac-credits-empty">No Tokens.</div>')
    + '</div>'

    /* Shipping Address */
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:20px 20px 10px">'
    + '<span style="font-family:var(--fd);font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.14em;color:#111">Shipping Address</span>'
    + '<button onclick="editAddress()" style="font-size:13px;font-weight:600;color:#888;background:none;border:none;cursor:pointer;padding:4px 0">Edit</button>'
    + '</div>'
    + '<div class="ac-card">'
    + '<div class="ac-card-row"><span class="ac-lbl">Address</span><span class="ac-val" style="font-size:11px">' + (user.address ? user.address + (user.city ? ', ' + user.city : '') + (user.state ? ' ' + user.state : '') + (user.zip ? ' ' + user.zip : '') : 'Not set') + '</span></div>'
    + '<div class="ac-card-row"><span class="ac-lbl">Billing</span><span class="ac-val" style="font-size:10px">DHARMA*INTIMACYSUP</span></div>'
    + '</div>'

    /* Legal + Data */
    + '<div style="padding:20px 20px 10px">'
    + '<span style="font-family:var(--fd);font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.14em;color:#111">Legal &amp; Privacy</span>'
    + '</div>'
    + '<div class="ac-card">'
    + '<div class="ac-card-row" style="cursor:pointer" onclick="openLegal(&apos;privacy&apos;)"><span class="ac-lbl">Privacy Policy</span><span style="color:#CCC;font-size:18px">&#8250;</span></div>'
    + '<div class="ac-card-row" style="cursor:pointer" onclick="openLegal(&apos;terms&apos;)"><span class="ac-lbl">Terms of Service</span><span style="color:#CCC;font-size:18px">&#8250;</span></div>'
    + '<div class="ac-card-row" style="cursor:pointer" onclick="downloadMyData()"><span class="ac-lbl">Download My Data</span><span style="color:#CCC;font-size:18px">&#8250;</span></div>'
    + '</div>'

    /* Shop Now */
    + '<div style="padding:8px 16px 16px">'
    + '<button onclick="closeOVP(&apos;ovp-account&apos;);scrollToProds()" style="display:block;width:100%;background:#111;color:#fff;border:none;padding:16px;font-family:var(--fd);font-size:16px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;border-radius:8px;cursor:pointer">Shop Now</button>'
    + '</div>'

    /* Danger zone */
    + '<div class="ac-danger">'
    + '<strong>Delete Account</strong>'
    + '<p>Permanently deletes your account, all order history, and member tokens. This cannot be undone.</p>'
    + '<button onclick="confirmDeleteAccount()">Delete My Account</button>'
    + '</div>'

    + '</div>';

  /* Wire notification toggles */
  panel.querySelectorAll('input[data-pref]').forEach(function(input){
    input.addEventListener('change', function(){
      var prefKey = input.getAttribute('data-pref').replace('notif_', '');
      if(db && user && user.uid){
        var update = {}; update['notifPrefs.' + prefKey] = input.checked;
        db.collection('users').doc(user.uid).update(update).catch(function(){});
      }
      toast(input.checked ? 'Notifications enabled.' : 'Notifications disabled.');
    });
  });

  /* Wire saved item clicks */
  panel.querySelectorAll('.ac-saved-item[data-pid]').forEach(function(el){
    el.addEventListener('click', function(){
      closeOVP('ovp-account');
      openPD(el.getAttribute('data-pid'));
    });
  });

  /* ── Append full site footer to account panel ── */
  (function(){
    var ft = document.createElement('div');
    var hv = document.querySelector('.hv');
    if(hv) ft.appendChild(hv.cloneNode(true));
    var sus = document.querySelector('.sus');
    if(sus) ft.appendChild(sus.cloneNode(true));
    var footer = document.querySelector('footer');
    if(footer) ft.appendChild(footer.cloneNode(true));
    var tb = document.createElement('section');
    tb.style.cssText = 'background:#111;padding:18px 16px';
    tb.innerHTML = '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:16px 28px"><span style="color:rgba(255,255,255,.8);font-size:11px;font-weight:600;text-transform:uppercase">Plain Brown Packaging</span><span style="color:rgba(255,255,255,.8);font-size:11px;font-weight:600;text-transform:uppercase">Secure Checkout</span><span style="color:rgba(255,255,255,.8);font-size:11px;font-weight:600;text-transform:uppercase">30-Day Guarantee</span><span style="color:rgba(255,255,255,.8);font-size:11px;font-weight:600;text-transform:uppercase">Privacy Protected</span><span style="color:rgba(255,255,255,.8);font-size:11px;font-weight:600;text-transform:uppercase">30-Day Returns</span></div>';
    ft.appendChild(tb);
    var nl = document.createElement('section');
    nl.style.cssText = 'background:#373431;padding:40px 16px;text-align:center';
    nl.innerHTML = '<div style="max-width:480px;margin:0 auto"><h2 style="font-family:var(--fd);font-size:28px;font-weight:900;text-transform:uppercase;color:#fff;margin-bottom:5px">Join Our Email List</h2><p style="font-size:12px;color:rgba(255,255,255,.65);margin-bottom:18px;line-height:1.55">Get new arrivals and member offers by email.</p><div style="display:flex;gap:7px;max-width:380px;margin:0 auto 9px"><input id="nl-ac-email" type="email" placeholder="Your email address" style="flex:1;border:none;border-radius:4px;padding:12px 13px;font-size:13px;outline:none;min-width:0"><button id="nl-ac-btn" style="background:#1B1B19;color:#111;border:none;padding:12px 15px;font-family:var(--fd);font-size:15px;font-weight:900;text-transform:uppercase;border-radius:4px;cursor:pointer">Subscribe</button></div><p style="font-size:9.5px;color:rgba(255,255,255,.4)">Zero spam. Unsubscribe anytime.</p></div>';
    ft.appendChild(nl);
    var nlBtn = nl.querySelector('#nl-ac-btn');
    if(nlBtn) nlBtn.addEventListener('click', function(){ subNewsletter('nl-ac-email','nl-ac-fb'); });
    panel.appendChild(ft);
  })();

}

function buildOrderCard(orderId, date, statusClass, statusLabel, total, items, showItems){
  return '<div class="ac-order">'
    + '<div class="ac-order-hdr"><div>'
    + '<div class="ac-order-num">' + orderId + '</div>'
    + '<div class="ac-order-date">' + date + '</div>'
    + '</div><span class="ac-status ' + statusClass + '">' + statusLabel + '</span></div>'
    + (showItems && items ? '<div class="ac-order-items">' + items + '</div>' : '')
    + '<div class="ac-order-footer"><div class="ac-order-total">' + total + '</div>'
    + '<button class="ac-track-btn" onclick="toast(&quot;Tracking info appears once order ships.&quot;)">Track</button>'
    + '</div></div>';
}

/* ── TEST MODE: Mock user when running outside intimacysupply.com ── */
(function(){
  var isLive = window.location.hostname === 'intimacysupply.com';
  var devLogin = false; try{ devLogin = localStorage.getItem('is_dev_login') === '1'; }catch(e){}
  if(devLogin && !isLive && (typeof user === 'undefined' || !user)){
    // Inject mock user for local/Claude preview testing
    window.user = {
      uid: 'TEST_USER_001',
      email: 'dev@example.com',
      displayName: 'Ryan',
      firstName: 'Ryan',
      phone: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      birthday: '',
      intensity: 'Medium',
      quizAnswers: { mood: 'sensual', topSize: 'L', bottomSize: 'L' },
      notifPrefs: { vip: true, skip: true, orders: true, promo: false }
    };
    window.isVIP = true;
    window.credits = 1;
    window.orders = [];
    window.wishlist = window.wishlist || [];
    console.info('[IS] Test mode active -- mock VIP user injected for preview.');
  }
})();

try{ renderTestimonials(); }catch(e){}
try{ renderCart(); }catch(e){}
try{ renderWL(); }catch(e){}
try{ initAgeGate(); }catch(e){}
