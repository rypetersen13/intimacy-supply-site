"use strict";
// Minimal Firestore REST client for server functions (no dependencies).
// Uses the service account in FIREBASE_SERVICE_ACCOUNT (base64 JSON).

const crypto = require("crypto");

const PROJECT_ID = "intimacy-supply";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

let cachedToken = null;
let cachedExp = 0;

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedExp - 60) return cachedToken;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not set for this function");
  }
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString("utf8"));
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })).toString("base64url");
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(header + "." + claims);
  const jwt = header + "." + claims + "." + signer.sign(sa.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error("token exchange failed: " + res.status);
  const data = await res.json();
  cachedToken = data.access_token;
  cachedExp = now + (data.expires_in || 3600);
  return cachedToken;
}

function fromValue(v) {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue !== undefined) return null;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(fromValue);
  if (v.mapValue !== undefined) return fromFields(v.mapValue.fields || {});
  return null;
}
function fromFields(fields) {
  const out = {};
  for (const k of Object.keys(fields || {})) out[k] = fromValue(fields[k]);
  return out;
}

function toValue(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (x instanceof Date) return { timestampValue: x.toISOString() };
  if (typeof x === "boolean") return { booleanValue: x };
  if (typeof x === "number") return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === "string") return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toValue) } };
  const fields = {};
  for (const k of Object.keys(x)) fields[k] = toValue(x[k]);
  return { mapValue: { fields } };
}

// Returns the document's fields as plain values, or null when it does not exist.
async function getDoc(path) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/${path}`, { headers: { Authorization: "Bearer " + token } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`firestore get ${path} failed: ${res.status}`);
  const doc = await res.json();
  return fromFields(doc.fields || {});
}

// Updates only the listed fields (plain JS values).
async function patchDoc(path, obj) {
  const token = await getAccessToken();
  const keys = Object.keys(obj);
  const mask = keys.map(f => "updateMask.fieldPaths=" + encodeURIComponent(f)).join("&");
  const fields = {};
  for (const k of keys) fields[k] = toValue(obj[k]);
  const res = await fetch(`${BASE}/${path}?${mask}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`firestore patch ${path} failed: ${res.status}`);
  return true;
}

// Atomically adds to numeric fields (creates them at 0 if missing).
async function incrementFields(path, increments) {
  const token = await getAccessToken();
  const name = `projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  const fieldTransforms = Object.keys(increments).map(f => ({
    fieldPath: f,
    increment: Number.isInteger(increments[f]) ? { integerValue: String(increments[f]) } : { doubleValue: increments[f] },
  }));
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ writes: [{ transform: { document: name, fieldTransforms } }] }),
  });
  if (!res.ok) throw new Error(`firestore increment ${path} failed: ${res.status}`);
  return true;
}


// Documents in a collection whose top-level string field equals a value (no composite index needed).
async function queryEq(collection, field, value, limit) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE.replace("/documents", "")}/documents:runQuery`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: collection }],
      where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: String(value) } } },
      limit: limit || 500,
    } }),
  });
  if (!res.ok) throw new Error(`firestore query ${collection} failed: ${res.status}`);
  const rows = await res.json();
  return rows.filter(r => r.document).map(r => Object.assign({ id: r.document.name.split("/").pop() }, fromFields(r.document.fields || {})));
}

// Creates a document with an automatic id; returns the id.
async function createDoc(collection, obj) {
  const token = await getAccessToken();
  const fields = {};
  for (const k of Object.keys(obj)) fields[k] = toValue(obj[k]);
  const res = await fetch(`${BASE}/${collection}`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`firestore create ${collection} failed: ${res.status}`);
  return (await res.json()).name.split("/").pop();
}

module.exports = { PROJECT_ID, getAccessToken, getDoc, patchDoc, incrementFields, queryEq, createDoc, fromFields, toValue };
