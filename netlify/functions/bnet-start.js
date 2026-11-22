// Starts "Link Battle.net": checks the member is signed in, then returns Blizzard's sign-in URL.
const { SUPABASE_URL, SUPABASE_PUBLISHABLE, env, ready, json, makeState } = require("./_shared");

exports.handler = async (event) => {
  const cfg = env();

  // ?check=1 shows the public client ID and tests the Blizzard secret (pass/fail only, never the value).
  if ((event.queryStringParameters || {}).check) {
    let blizzardSecretWorks = false;
    try {
      const r = await fetch("https://oauth.battle.net/token", {
        method: "POST",
        headers: { Authorization: "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      blizzardSecretWorks = r.ok;
    } catch {}
    return json(200, {
      ready: ready(cfg), blizzardSecretWorks, clientId: cfg.clientId, region: cfg.region,
      redirectUri: cfg.site + "/.netlify/functions/bnet-callback",
    });
  }

  if (!ready(cfg)) {
    return json(503, { error: "Battle.net linking isn't switched on yet. The site owner needs to finish the Battle.net steps in SETUP.md." });
  }
  const token = String(event.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Please sign in first." });
  const r = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_PUBLISHABLE, Authorization: "Bearer " + token } });
  if (!r.ok) return json(401, { error: "Your sign-in has expired. Sign in again and retry." });
  const user = await r.json();

  const url = "https://oauth.battle.net/authorize?" + new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.site + "/.netlify/functions/bnet-callback",
    response_type: "code",
    scope: "openid wow.profile",
    state: makeState(user.id, cfg.clientSecret),
  });
  return json(200, { url });
};
