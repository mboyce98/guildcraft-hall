// Shared helpers for the Battle.net link functions (server side only).
const crypto = require("crypto");

const SUPABASE_URL = "https://aclhzgtyucqxekzuahyx.supabase.co";
const SUPABASE_PUBLISHABLE = "sb_publishable_wRsOqGd5oXzvIESdDEOewA_oceG9nd_";

// Trim pasted values: a stray space or newline makes Blizzard reply "Bad client credentials".
const v = (name) => String(process.env[name] || "").trim();
const env = () => ({
  clientId: v("BNET_CLIENT_ID"),
  clientSecret: v("BNET_CLIENT_SECRET"),
  secretKey: v("SUPABASE_SECRET_KEY"),
  region: (v("BNET_REGION") || "us").toLowerCase(),
  site: (process.env.URL || "https://guildcraft-hall.netlify.app").replace(/\/$/, ""),
});

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(body),
});

const sign = (payload, key) => crypto.createHmac("sha256", key).update(payload).digest("base64url");

function makeState(userId, key) {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + 10 * 60 * 1000, n: crypto.randomBytes(8).toString("hex") })).toString("base64url");
  return payload + "." + sign(payload, key);
}

function readState(state, key) {
  const [payload, sig] = String(state || "").split(".");
  if (!payload || !sig) return null;
  const want = Buffer.from(sign(payload, key));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  return data.e > Date.now() ? data : null;
}

module.exports = { SUPABASE_URL, SUPABASE_PUBLISHABLE, env, json, makeState, readState };
