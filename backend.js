/* =========================================================
   GUILDCRAFT HALL — data layer

   DEMO MODE (when BACKEND is empty): everything is saved only in
   this browser and passwords aren't checked. For trying it out.

   LIVE MODE: real accounts, shared with the whole guild.
   See SETUP.md. In short:
     1. Create a free project at https://supabase.com
     2. SQL Editor → paste supabase-setup.sql → Run
     3. Project Settings → API Keys: copy the Project URL and the
        publishable (or "anon public") key into BACKEND below.
        NEVER put the secret / service_role key here.
   ========================================================= */
const BACKEND = {
  supabaseUrl: "https://aclhzgtyucqxekzuahyx.supabase.co",
  supabaseAnonKey: "sb_publishable_wRsOqGd5oXzvIESdDEOewA_oceG9nd_", // publishable key (safe in a website)
};

const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("Couldn't load " + src));
    document.head.appendChild(s);
  });
}

// =========================================================
// DATA: DEMO (this browser only)
// =========================================================
function demoDb() {
  const KEY = "guildcraft-demo-v1";
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY)) || null; } catch { data = null; }
  if (!data) data = { users: [], session: null, crafters: {}, requests: [], listings: [], seq: 1 };
  const changeFns = [], authFns = [];
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} changeFns.forEach((f) => f()); };
  const me = () => data.users.find((u) => u.id === data.session) || null;
  const need = () => { const u = me(); if (!u) throw new Error("Please sign in first."); return u; };
  const setSession = (id) => { data.session = id; persist(); authFns.forEach((f) => f()); };

  return {
    mode: "demo",
    async currentUser() { const u = me(); return u ? { id: u.id, username: u.username, isAdmin: true } : null; },
    onAuthChange(fn) { authFns.push(fn); },
    onChange(fn) { changeFns.push(fn); },
    async signUp({ email, username }) {
      if (data.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw new Error("An account with that email already exists. Try signing in.");
      if (data.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) throw new Error("That username is taken.");
      const u = { id: "demo_" + data.seq++, email, username };
      data.users.push(u); setSession(u.id);
      return { needsConfirm: false };
    },
    async signIn({ email }) {
      const u = data.users.find((x) => x.email.toLowerCase() === email.toLowerCase());
      if (!u) throw new Error("No account with that email.");
      setSession(u.id);
    },
    async signOut() { setSession(null); },
    async resetPassword() { throw new Error("Password reset works once the site is connected to Supabase."); },
    async updatePassword() {},
    async loadAll() {
      const profiles = {};
      data.users.forEach((u) => { profiles[u.id] = { username: u.username, isAdmin: false }; });
      const uid = data.session;
      return {
        profiles,
        crafters: Object.entries(data.crafters).map(([id, c]) => ({ uid: id, chars: c.chars || {}, note: c.note || "" })),
        requests: data.requests.filter((r) => r.from === uid || r.to === uid).map((r) => ({ ...r })),
        listings: data.listings.map((l) => ({ ...l })),
      };
    },
    async linkBnet() { throw new Error("Battle.net linking works once the site is connected to Supabase."); },
    async unlinkBnet() {},
    async saveBnet() {},
    async saveMine(doc) { const u = need(); data.crafters[u.id] = { chars: doc.chars, note: doc.note }; persist(); },
    async createRequest(o) { const u = need(); data.requests.push({ ...o, id: String(data.seq++), from: u.id, status: "pending", created: Date.now() }); persist(); },
    async setRequestStatus(id, status) { const r = data.requests.find((x) => x.id === id); if (r) { r.status = status; persist(); } },
    async deleteRequest(id) { data.requests = data.requests.filter((x) => x.id !== id); persist(); },
    async createListing(o) { const u = need(); data.listings.push({ ...o, id: String(data.seq++), seller: u.id, created: Date.now() }); persist(); },
    async deleteListing(id) { data.listings = data.listings.filter((x) => x.id !== id); persist(); },
  };
}

// =========================================================
// DATA: LIVE (Supabase — real accounts, shared with the guild)
// =========================================================
async function supabaseDb() {
  await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.105.4/dist/umd/supabase.min.js");
  const sb = window.supabase.createClient(BACKEND.supabaseUrl, BACKEND.supabaseAnonKey);
  const changeFns = [], authFns = [];
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const redirectTo = location.origin + location.pathname;
  let uid = null, live = null;

  const subscribe = () => {
    if (live || !uid) return;
    live = sb.channel("guildcraft-live")
      .on("postgres_changes", { event: "*", schema: "public" }, () => changeFns.forEach((f) => f()))
      .subscribe();
  };
  sb.auth.onAuthStateChange((event, session) => {
    uid = session?.user?.id || null;
    if (uid) subscribe(); else if (live) { sb.removeChannel(live); live = null; }
    setTimeout(() => authFns.forEach((f) => f(event)), 0); // avoid calling Supabase inside its own callback
  });
  const need = async () => {
    const { data } = await sb.auth.getSession();
    const id = data.session?.user?.id;
    if (!id) throw new Error("Please sign in first.");
    return id;
  };

  return {
    mode: "live",
    async currentUser() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      if (!u) return null;
      uid = u.id; subscribe();
      const { data: p } = await sb.from("profiles").select("username,is_admin").eq("id", u.id).maybeSingle();
      return { id: u.id, username: p?.username || "crafter", isAdmin: !!p?.is_admin };
    },
    onAuthChange(fn) { authFns.push(fn); },
    onChange(fn) { changeFns.push(fn); },
    async signUp({ email, password, username }) {
      // Visitors can't read member profiles, so ask the database's username_taken() helper instead.
      const { data: taken } = await sb.rpc("username_taken", { name: username });
      if (taken === true) throw new Error("That username is taken.");
      const res = ok(await sb.auth.signUp({ email, password, options: { data: { username }, emailRedirectTo: redirectTo } }));
      return { needsConfirm: !res.session };
    },
    async signIn({ email, password }) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async signOut() { ok(await sb.auth.signOut()); },
    async resetPassword(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo })); },
    async updatePassword(password) { ok(await sb.auth.updateUser({ password })); },
    async loadAll() {
      const [profiles, crafters, requests, listings, links] = await Promise.all([
        sb.from("profiles").select("id,username,is_admin"),
        sb.from("crafters").select("user_id,chars,note"),
        sb.from("requests").select("*").order("created_at", { ascending: false }).limit(500),
        sb.from("listings").select("*").order("created_at", { ascending: false }).limit(500),
        sb.from("bnet_links").select("user_id,battletag,characters,linked_at"),
      ].map((p) => p.then(ok)));
      const pmap = {}, bnet = {};
      profiles.forEach((p) => { pmap[p.id] = { username: p.username, isAdmin: p.is_admin }; });
      links.forEach((l) => { bnet[l.user_id] = { battletag: l.battletag, characters: l.characters || [], linkedAt: Date.parse(l.linked_at) }; });
      return {
        profiles: pmap,
        bnet,
        crafters: crafters.map((c) => ({ uid: c.user_id, chars: c.chars || {}, note: c.note || "" })),
        requests: requests.map((r) => ({
          id: String(r.id), kind: r.kind, recipeId: r.recipe_id, listingId: r.listing_id, label: r.label, qty: r.qty,
          tip: Number(r.tip), note: r.note, from: r.from_id, fromChar: r.from_char, to: r.to_id, toChar: r.to_char,
          status: r.status, created: Date.parse(r.created_at),
        })),
        listings: listings.map((l) => ({
          id: String(l.id), seller: l.seller_id, char: l.char, type: l.type, item: l.item, qty: l.qty,
          price: Number(l.price), note: l.note, created: Date.parse(l.created_at),
        })),
      };
    },
    // ---- Battle.net link (runs through the site's Netlify function, which holds the Blizzard secret) ----
    async linkBnet() {
      const { data } = await sb.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Please sign in first.");
      const r = await fetch("/.netlify/functions/bnet-start", { headers: { Authorization: "Bearer " + token } });
      let body = {};
      try { body = await r.json(); } catch {}
      if (!r.ok || !body.url) throw new Error(body.error || "Battle.net linking isn't available right now.");
      location.href = body.url;
    },
    async saveBnet(d) {
      const id = await need();
      if (d.u && d.u !== id) throw new Error("That Battle.net sign-in was started from a different GuildCraft account.");
      ok(await sb.from("bnet_links").upsert({
        user_id: id, battletag: String(d.battletag || "").slice(0, 40), bnet_id: d.bnetId || null, region: String(d.region || "us").slice(0, 4),
        characters: Array.isArray(d.characters) ? d.characters.slice(0, 200) : [], linked_at: new Date().toISOString(),
      }));
    },
    async unlinkBnet() { const id = await need(); ok(await sb.from("bnet_links").delete().eq("user_id", id)); },
    async saveMine(doc) {
      const id = await need();
      ok(await sb.from("crafters").upsert({ user_id: id, chars: doc.chars, note: doc.note, updated_at: new Date().toISOString() }));
    },
    async createRequest(o) {
      await need();
      ok(await sb.from("requests").insert({
        kind: o.kind, recipe_id: o.recipeId ?? null, listing_id: o.listingId ? Number(o.listingId) : null, label: o.label || "",
        qty: o.qty, tip: o.tip, note: o.note || "", from_char: o.fromChar, to_id: o.to, to_char: o.toChar || "",
      }));
    },
    async setRequestStatus(id, status) { ok(await sb.from("requests").update({ status }).eq("id", Number(id))); },
    async deleteRequest(id) { ok(await sb.from("requests").delete().eq("id", Number(id))); },
    async createListing(o) {
      await need();
      ok(await sb.from("listings").insert({ char: o.char, type: o.type, item: o.item, qty: o.qty, price: o.price, note: o.note || "" }));
    },
    async deleteListing(id) { ok(await sb.from("listings").delete().eq("id", Number(id))); },
  };
}

async function openBackend() {
  if (BACKEND.supabaseUrl && BACKEND.supabaseAnonKey) {
    try { return await supabaseDb(); } catch (e) { console.warn("Supabase unavailable, using demo mode", e); }
  }
  return demoDb();
}
