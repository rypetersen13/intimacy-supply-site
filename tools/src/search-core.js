/* Shop search: word matching, plural and synonym handling, typo tolerance.
   Works in the browser (window.ISSearch) and in Node (module.exports) so it can be tested. */
(function (root) {
  "use strict";

  // Alternatives a shopper might type -> words that actually appear in product names.
  var SYN = {
    vibe: ["vibrator", "vibrating"], vibes: ["vibrator", "vibrating"], vibrator: ["vibrating", "vibrator", "vibe"], vibrating: ["vibrator", "vibrating"], vibration: ["vibrator", "vibrating"], massager: ["vibrator", "massager"],
    dong: ["dildo"], cock: ["dildo"], phallic: ["dildo"],
    cage: ["chastity"], chastity: ["cage", "chastity"], lock: ["chastity"],
    lube: ["lubricant"], lubricant: ["lube"], slick: ["lubricant"],
    cuff: ["handcuff", "restraint", "cuff"], handcuff: ["cuff", "restraint"], restraints: ["cuff", "restraint"],
    fleshlight: ["stroker", "masturbator"], pocketpussy: ["stroker", "masturbator"], masturbator: ["stroker", "masturbator"],
    cockring: ["ring"], panty: ["panty", "thong", "brief"], panties: ["panty", "thong", "brief"], thong: ["thong", "panty"],
    stocking: ["stocking", "hosiery", "thigh"], hosiery: ["stocking", "hosiery"], garter: ["garter", "stocking"],
    lingerie: ["lingerie", "teddy", "babydoll", "chemise", "bodysuit", "corset"],
    outfit: ["lingerie", "teddy", "babydoll", "chemise", "bodysuit", "costume"], outfits: ["lingerie", "teddy", "babydoll", "chemise", "bodysuit", "costume"],
    whip: ["flogger", "whip", "crop"], flogger: ["whip", "flogger"], paddle: ["paddle", "spanker"],
    blindfold: ["blindfold", "mask", "eye"], gag: ["gag", "ball"], clamp: ["clamp", "nipple"], nipple: ["nipple", "clamp"],
    butt: ["anal", "butt"], anal: ["anal", "butt"], plug: ["plug"], beads: ["bead"], prostate: ["prostate"],
    strapon: ["strap"], harness: ["harness", "strap"], kegel: ["kegel", "ben"], benwa: ["kegel", "ben"],
    lace: ["lace"], sexy: ["lingerie", "teddy", "babydoll"], toy: [], toys: [], sex: [], adult: []
  };
  // Two-word phrases collapsed before splitting.
  var PHRASES = [
    [/strap[\s-]?on/g, "strapon"], [/cock[\s-]?ring/g, "cockring"], [/pocket[\s-]?pussy/g, "pocketpussy"], [/ben[\s-]?wa/g, "benwa"],
    [/g[\s-]?spot/g, "gspot"], [/buttplugs?/g, "butt plug"], [/nipple[\s-]?clamps?/g, "nipple clamp"], [/hand[\s-]?cuffs?/g, "handcuff"]
  ];
  var STOP = { the: 1, a: 1, an: 1, and: 1, for: 1, of: 1, with: 1, to: 1, in: 1, my: 1, some: 1, best: 1 };

  function singular(w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 4 && /(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function norm(s) {
    s = String(s || "").toLowerCase().replace(/&/g, " and ").replace(/['\u2019]/g, "");
    for (var i = 0; i < PHRASES.length; i++) s = s.replace(PHRASES[i][0], PHRASES[i][1]);
    return s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }
  function tokens(s) {
    return norm(s).split(" ").filter(function (w) { return w && !STOP[w]; }).map(singular);
  }

  // Edit distance with transposition, bounded by max (returns max+1 when exceeded).
  function dist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev2 = null, prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i]; var best = i;
      for (j = 1; j <= b.length; j++) {
        var c = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
        if (prev2 && i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v; if (v < best) best = v;
      }
      if (best > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[b.length];
  }

  function Index(products) {
    this.items = [];
    this.vocab = Object.create(null);
    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      var nameT = tokens(p.name), brandT = tokens(p.brand || ""), catT = tokens(p.cat || "");
      var set = Object.create(null);
      nameT.concat(brandT).concat(catT).forEach(function (w) { set[w] = 1; });
      var words = Object.keys(set);
      this.items.push({ p: p, words: words, nameSet: nameT.reduce(function (o, w) { o[w] = 1; return o; }, Object.create(null)), brandSet: brandT.reduce(function (o, w) { o[w] = 1; return o; }, Object.create(null)) });
      for (var k = 0; k < words.length; k++) this.vocab[words[k]] = (this.vocab[words[k]] || 0) + 1;
    }
    this.vocabList = Object.keys(this.vocab);
  }
  Index.prototype.correct = function (w) {
    if (this.vocab[w] || w.length < 4) return null;
    var max = w.length >= 8 ? 2 : 1, best = null, bestD = max + 1, bestF = 0;
    var cands = this.vocabList.concat(Object.keys(SYN));
    for (var i = 0; i < cands.length; i++) {
      var v = cands[i];
      var d = dist(w, v, max);
      var f = this.vocab[v] || 1;
      if (d < bestD || (d === bestD && d <= max && f > bestF)) { bestD = d; best = v; bestF = f; }
    }
    return bestD <= max ? best : null;
  };
  Index.prototype.hasPrefix = function (w) {
    if (w.length < 3) return false;
    for (var i = 0; i < this.vocabList.length; i++) if (this.vocabList[i].indexOf(w) === 0) return true;
    return false;
  };

  // Returns { results, usedQuery, corrected }.
  Index.prototype.search = function (query, opts) {
    opts = opts || {};
    var original = tokens(query);
    if (!original.length) return { results: [], usedQuery: "", corrected: false };
    var self = this;
    function run(qtokens) {
      // each query token becomes a group of acceptable words
      var groups = qtokens.map(function (w) {
        var g = [w]; (SYN[w] || []).forEach(function (s) { g.push(singular(s)); });
        return g;
      });
      var out = [];
      for (var i = 0; i < self.items.length; i++) {
        var it = self.items[i], score = 0, ok = true;
        for (var gi = 0; gi < groups.length && ok; gi++) {
          var hit = 0;
          for (var wi = 0; wi < groups[gi].length; wi++) {
            var w = groups[gi][wi], orig = (wi === 0);          // the word as typed counts for more than its synonyms
            if (it.nameSet[w]) { hit = Math.max(hit, orig ? 6 : 3); }
            else if (it.brandSet[w]) { hit = Math.max(hit, orig ? 4 : 2); }
            else if (it.words.indexOf(w) !== -1) { hit = Math.max(hit, orig ? 2 : 1); }
            else if (gi === groups.length - 1 && w.length >= 3) {          // the word still being typed
              for (var k = 0; k < it.words.length; k++) if (it.words[k].indexOf(w) === 0) { hit = Math.max(hit, orig ? 2 : 1); break; }
            }
          }
          if (!hit) ok = false; else score += hit;
        }
        if (ok) out.push({ p: it.p, score: score });
      }
      out.sort(function (a, b) { return (b.score - a.score) || ((a.p.f == null ? 1e9 : a.p.f) - (b.p.f == null ? 1e9 : b.p.f)); });
      return out.map(function (x) { return x.p; });
    }
    var res = run(original);
    if (res.length || opts.noCorrect) return { results: res, usedQuery: original.join(" "), corrected: false };
    // typo tolerance: fix unknown words, then search again
    var fixed = original.map(function (w) {
      if (self.vocab[w] || SYN[w] || self.hasPrefix(w)) return w;
      return self.correct(w) || w;
    });
    if (fixed.join(" ") !== original.join(" ")) {
      res = run(fixed);
      if (res.length) return { results: res, usedQuery: fixed.join(" "), corrected: true };
    }
    return { results: [], usedQuery: original.join(" "), corrected: false };
  };

  var api = { Index: Index, tokens: tokens, norm: norm, dist: dist, SYN: SYN };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ISSearch = api;
})(typeof window !== "undefined" ? window : this);
