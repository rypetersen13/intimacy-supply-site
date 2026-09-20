const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanTerm, docIdFor } = require("../netlify/functions/_lib/searchmiss");
const fn = require("../netlify/functions/search-miss");

test("terms are cleaned and anything personal is dropped", () => {
  assert.equal(cleanTerm("  Fleshlight  "), "fleshlight");
  assert.equal(cleanTerm("cock ring"), "cock ring");
  for (const bad of ["me@example.com", "https://x.co", "www.site.com", "920-570-9365", "4444 4444 4444 6666", "ab", "x".repeat(80), "12345", "", null]) assert.equal(cleanTerm(bad), "", String(bad));
  assert.equal(docIdFor("cock ring!"), "cock-ring");
});

test("the function counts a miss once per call and ignores junk", async () => {
  const calls = [];
  const deps = { now: () => Date.now(), fs: { incrementFields: async (p, o) => calls.push(["inc", p, o]), patchDoc: async (p, o) => calls.push(["patch", p, Object.keys(o)]) } };
  const ev = q => ({ httpMethod: "POST", body: JSON.stringify({ q }) });
  assert.equal((await fn.handle(ev("fleshlight"), deps)).statusCode, 204);
  assert.deepEqual(calls[0], ["inc", "search_misses/fleshlight", { count: 1 }]);
  await fn.handle(ev("me@example.com"), deps);
  assert.equal(calls.length, 2);                       // the email produced no writes
  assert.equal((await fn.handle({ httpMethod: "GET" }, deps)).statusCode, 405);
});
