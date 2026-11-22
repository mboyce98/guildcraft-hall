// Starts "Link Battle.net": checks the member is signed in, then returns Blizzard's sign-in URL.
const { SUPABASE_URL, SUPABASE_PUBLISHABLE, env, json, makeState } = require("./_shared");

exports.handler = async (event) => {
  const cfg = env();
  if (!cfg.clientId || !cfg.clientSecret || !cfg.secretKey) {
    return json(503, { error: "Battle.net linking isn't switched on yet. The site owner needs to finish the Battle.net steps in SETUP.md." });
  }
  // ?check=1 shows the public client ID and whether the other settings are present (never their values).
  if ((event.queryStringParameters || {}).check) {
    // Test the secrets by using them (an app-only Blizzard token and a read from Supabase), reporting only pass/fail.
    let blizzardSecretWorks = false, supabaseSecretWorks = false;
    try {
      const r = await fetch("https://oauth.battle.net/token", {
        method: "POST",
        headers: { Authorization: "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      blizzardSecretWorks = r.ok;
    } catch {}
    try {
      const r = await fetch(SUPABASE_URL + "/rest/v1/bnet_links?select=user_id&limit=1", { headers: { apikey: cfg.secretKey } });
      supabaseSecretWorks = r.ok;
    } catch {}
    return json(200, {
      blizzardSecretWorks, supabaseSecretWorks,
      clientId: cfg.clientId, clientIdLooksRight: /^[0-9a-f]{32}$/.test(cfg.clientId),
      hasClientSecret: cfg.clientSecret.length > 0, clientSecretLength: cfg.clientSecret.length,
      hasSupabaseSecret: cfg.secretKey.length > 0, region: cfg.region,
      redirectUri: cfg.site + "/.netlify/functions/bnet-callback",
    });
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
    state: makeState(user.id, cfg.secretKey),
  });
  return json(200, { url });
};
