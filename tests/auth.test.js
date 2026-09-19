const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { verifyIdToken } = require("../netlify/functions/_lib/auth");

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const pub = publicKey.export({ type: "spki", format: "pem" });
const certs = { kid1: pub };
const PROJECT = "intimacy-supply";
function token(over = {}, key = privateKey, kid = "kid1") {
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString("base64url");
  const p = Buffer.from(JSON.stringify({ aud: PROJECT, iss: "https://securetoken.google.com/" + PROJECT, sub: "user123", iat: now - 5, exp: now + 3600, ...over })).toString("base64url");
  const s = crypto.createSign("RSA-SHA256").update(h + "." + p).sign(key, "base64url");
  return h + "." + p + "." + s;
}

test("a valid Firebase token verifies and returns the uid", async () => {
  const c = await verifyIdToken(token(), PROJECT, { certs });
  assert.equal(c.sub, "user123");
});
test("wrong audience, issuer, expiry, signature, key id and garbage are all rejected", async () => {
  await assert.rejects(verifyIdToken(token({ aud: "other" }), PROJECT, { certs }), /audience/);
  await assert.rejects(verifyIdToken(token({ iss: "https://evil" }), PROJECT, { certs }), /issuer/);
  await assert.rejects(verifyIdToken(token({ exp: 1 }), PROJECT, { certs }), /expired/);
  const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  await assert.rejects(verifyIdToken(token({}, other), PROJECT, { certs }), /signature/);
  await assert.rejects(verifyIdToken(token({}, privateKey, "nope"), PROJECT, { certs }), /unknown signing key/);
  await assert.rejects(verifyIdToken("abc", PROJECT, { certs }), /malformed/);
});
