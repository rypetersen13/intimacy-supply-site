// Variant base-name logic. This is a verbatim copy of stripTrailingVariant()/getBaseName() from index.html so that
// the static pages group products exactly like the shop does. Reads a JSON array of names on stdin, prints base names.
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

var names = JSON.parse(require('fs').readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(names.map(getBaseName)));
