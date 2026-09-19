"use strict";
// Verifies a Firebase Auth ID token (RS256 JWT) using Google's published certificates.
// Returns the token claims; claims.sub is the user's uid. Throws if anything is off.

const crypto = require("crypto");

const CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let certs = null;
let certsExp = 0;

async function getCerts() {
  const now = Date.now();
  if (certs && now < certsExp) return certs;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error("could not load token certificates: " + res.status);
  const cc = res.headers.get("cache-control") || "";
  const m = /max-age=(\d+)/.exec(cc);
  certs = await res.json();
  certsExp = now + (m ? parseInt(m[1], 10) : 3600) * 1000;
  return certs;
}

async function verifyIdToken(idToken, projectId, opts) {
  const nowSec = Math.floor(((opts && opts.now) || Date.now()) / 1000);
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (header.alg !== "RS256" || !header.kid) throw new Error("bad token header");
  const all = (opts && opts.certs) || await getCerts();
  const cert = all[header.kid];
  if (!cert) throw new Error("unknown signing key");
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(parts[0] + "." + parts[1]);
  if (!verifier.verify(crypto.createPublicKey(cert), Buffer.from(parts[2], "base64url"))) {
    throw new Error("bad token signature");
  }
  if (payload.aud !== projectId) throw new Error("wrong audience");
  if (payload.iss !== "https://securetoken.google.com/" + projectId) throw new Error("wrong issuer");
  if (!payload.sub || typeof payload.sub !== "string") throw new Error("missing subject");
  if (payload.exp <= nowSec) throw new Error("token expired");
  if (payload.iat > nowSec + 60) throw new Error("token issued in the future");
  return payload;
}

module.exports = { verifyIdToken };
