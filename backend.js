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

// Shrink a picture to a square of `size` pixels (centre crop) and return a JPEG blob.
function shrinkImage(file, size) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) return reject(new Error("Choose a picture file (JPG, PNG or WebP)."));
    if (file.size > 15 * 1024 * 1024) return reject(new Error("That picture is over 15 MB. Choose a smaller one."));
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement("canvas"); c.width = c.height = size;
      c.getContext("2d").drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that picture."))), "image/jpeg", 0.85);
    };
    img.onerror = () => reject(new Error("Couldn't read that picture."));
    img.src = URL.createObjectURL(file);
  });
}

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
      data.users.forEach((u) => { profiles[u.id] = { username: u.username, isAdmin: u.isAdmin !== false, joined: u.joined || 0, notifSeen: u.notifSeen || 0, ...(u.profile || {}) }; });
      const uid = data.session;
      return {
        profiles,
        board: (data.board || []).map((b) => ({ ...b })),
        messages: (data.messages || []).map((m) => ({ ...m })),
        dms: (data.dms || []).filter((m) => m.from === uid || m.to === uid).map((m) => ({ ...m })),
        crafters: Object.entries(data.crafters).map(([id, c]) => ({ uid: id, chars: c.chars || {}, note: c.note || "" })),
        requests: data.requests.filter((r) => r.from === uid || r.to === uid).map((r) => ({ ...r })),
        listings: data.listings.map((l) => ({ ...l })),
      };
    },
    async linkBnet() { throw new Error("Battle.net linking works once the site is connected to Supabase."); },
    async unlinkBnet() {},
    async saveBnet() {},
    async saveProfile(f) { const u = need(); u.profile = { ...(u.profile || {}), ...f }; persist(); },
    async sendMessage(type, thread, body) { const u = need(); (data.messages = data.messages || []).push({ id: String(data.seq++), type, thread: String(thread), author: u.id, body, t: Date.now() }); persist(); },
    async deleteMessage(id) { data.messages = (data.messages || []).filter((m) => m.id !== id); persist(); },
    async uploadAvatar(file) {
      const u = need(); const blob = await shrinkImage(file, 256);
      const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
      u.profile = { ...(u.profile || {}), avatar: url }; persist(); return url;
    },
    async removeAvatar() { const u = need(); u.profile = { ...(u.profile || {}), avatar: "" }; persist(); },
    joinPresence(info, onChange) { onChange([{ ...info, since: Date.now() }]); },
    updatePresence() {}, leavePresence() {},
    async discordEnabled() { return false; },
    async signInWithDiscord() { throw new Error("Discord sign-in works once the site is connected to Supabase."); },
    async markNotifsSeen() { const u = need(); u.notifSeen = Date.now(); persist(); },
    async sendDm(to, body) { const u = need(); (data.dms = data.dms || []).push({ id: String(data.seq++), from: u.id, to, body, t: Date.now(), read: false }); persist(); },
    async markDmsRead(from) { const u = need(); (data.dms || []).forEach((m) => { if (m.to === u.id && m.from === from) m.read = true; }); persist(); },
    async deleteDm(id) { data.dms = (data.dms || []).filter((m) => m.id !== id); persist(); },
    async loadSettings() { return { ...(data.settings || {}) }; },
    async discordConfig() { return { webhook_set: false, news: true, board: true, market: true, bot_linked: false }; },
    async discordConfigSet() { throw new Error("Discord works once the site is connected to Supabase."); },
    async discordTest() { throw new Error("Discord works once the site is connected to Supabase."); },
    async discordBot() { throw new Error("The Discord bot works on the live site."); },
    async loadNews() { return (data.news || []).slice().sort((a, b) => (b.pinned - a.pinned) || b.t - a.t).map((n) => ({ ...n })); },
    async createNews(o) { const u = need(); (data.news = data.news || []).push({ ...o, pinned: !!o.pinned, id: String(data.seq++), author: u.id, t: Date.now() }); persist(); },
    async updateNews(id, f) { const n = (data.news || []).find((x) => x.id === id); if (n) { Object.assign(n, f); persist(); } },
    async deleteNews(id) { data.news = (data.news || []).filter((x) => x.id !== id); persist(); },
    // ---- Guides and prices (demo copy keeps them in this browser) ----
    async loadGuides() {
      if (!data.guides) {
        data.guides = [{ id: String(data.seq++), title: "Copper and Tin: Elwynn, Westfall and Redridge loop", category: "Gathering", zone: "Elwynn Forest, Westfall", lmin: 1, lmax: 25, body: "A starter mining run.\n\n## Route\n1. Start at Goldshire and loop the hills east.\n2. Ride into Westfall and circle the **Jangolode Mine**.\n\n## Tips\n- Smelt as you go.", author: null, t: Date.now() - 86400000, u: Date.now() - 86400000 }];
        const d = 86400000, now = Date.now(), pts = [["Arcanite Bar", [9, 10, 11, 12.5, 12]], ["Black Lotus", [14, 13, 12.75]], ["Runecloth", [0.15, 0.18, 0.2, 0.22]], ["Linen Cloth", [0.0125, 0.012]]];
        data.prices = []; pts.forEach(([item, vals]) => vals.forEach((v, i) => data.prices.push({ id: String(data.seq++), item, price: v, source: i % 2 ? "Auction house" : "Trade chat", by: null, t: now - (vals.length - i) * 3 * d })));
      }
      return data.guides.map((g) => ({ ...g }));
    },
    async saveGuide(o) { const u = need(); if (o.id) { const g = data.guides.find((x) => x.id === o.id); Object.assign(g, o, { u: Date.now() }); } else data.guides.push({ ...o, id: String(data.seq++), author: u.id, t: Date.now(), u: Date.now() }); persist(); },
    async deleteGuide(id) { data.guides = data.guides.filter((x) => x.id !== id); persist(); },
    async loadPrices() { return (data.prices || []).map((p) => ({ ...p })); },
    async reportPrice(o) { const u = need(); (data.prices = data.prices || []).push({ ...o, id: String(data.seq++), by: u.id, t: Date.now() }); persist(); },
    async deletePrice(id) { data.prices = (data.prices || []).filter((x) => x.id !== id); persist(); },
    async accessToken() { return null; },
    async saveSetting(key, value) { (data.settings = data.settings || {})[key] = value; persist(); },
    async adminSetMember(id, f) { const u = data.users.find((x) => x.id === id); if (u) { u.profile = { ...(u.profile || {}), ...("rank" in f ? { rank: f.rank } : {}) }; if ("isAdmin" in f) u.isAdmin = !!f.isAdmin; persist(); } },
    async createPost(o) { const u = need(); (data.board = data.board || []).push({ ...o, id: String(data.seq++), author: u.id, status: "open", created: Date.now(), updated: Date.now() }); persist(); },
    async updatePost(id, f) { const p = (data.board || []).find((x) => x.id === id); if (p) { Object.assign(p, f, { updated: Date.now() }); if (f.status === "open") { p.claimer = null; p.claimerChar = ""; } persist(); } },
    async deletePost(id) { data.board = (data.board || []).filter((x) => x.id !== id); persist(); },
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
  let uid = null, live = null, presence = null;

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
      const [profiles, crafters, requests, listings, links, board, messages] = await Promise.all([
        sb.from("profiles").select("*"),
        sb.from("crafters").select("user_id,chars,note"),
        sb.from("requests").select("*").order("created_at", { ascending: false }).limit(500),
        sb.from("listings").select("*").order("created_at", { ascending: false }).limit(500),
        sb.from("bnet_links").select("user_id,battletag,characters,linked_at"),
        sb.from("board_posts").select("*").order("created_at", { ascending: false }).limit(300),
        sb.from("messages").select("*").order("created_at", { ascending: false }).limit(1000),
      ].map((p) => p.then(ok)));
      const pmap = {}, bnet = {};
      const dmRes = await sb.from("direct_messages").select("*").order("created_at", { ascending: false }).limit(1000);
      const dms = dmRes.error ? [] : dmRes.data;
      profiles.forEach((p) => {
        pmap[p.id] = {
          username: p.username, isAdmin: p.is_admin, joined: Date.parse(p.created_at),
          mainChar: p.main_char || "", mainRealm: p.main_realm || "", mainClass: p.main_class || "", mainLevel: p.main_level || 0,
          faction: p.faction || "", bio: p.bio || "", discord: p.discord || "", playTimes: p.play_times || "",
          notifSeen: p.notif_seen_at ? Date.parse(p.notif_seen_at) : 0, avatar: p.avatar_url || "", rank: p.guild_rank || "",
        };
      });
      links.forEach((l) => { bnet[l.user_id] = { battletag: l.battletag, characters: l.characters || [], linkedAt: Date.parse(l.linked_at) }; });
      return {
        profiles: pmap,
        bnet,
        dms: dms.reverse().map((m) => ({ id: String(m.id), from: m.sender_id, to: m.recipient_id, body: m.body, t: Date.parse(m.created_at), read: !!m.read_at })),
        messages: messages.reverse().map((m) => ({ id: String(m.id), type: m.thread_type, thread: String(m.thread_id), author: m.author_id, body: m.body, t: Date.parse(m.created_at) })),
        board: board.map((b) => ({
          id: String(b.id), author: b.author_id, authorChar: b.author_char, category: b.category, title: b.title, recipeId: b.recipe_id,
          qty: b.qty, offer: Number(b.offer), note: b.note, status: b.status, claimer: b.claimer_id, claimerChar: b.claimer_char,
          created: Date.parse(b.created_at), updated: Date.parse(b.updated_at), claimed: b.claimed_at ? Date.parse(b.claimed_at) : 0,
        })),
        crafters: crafters.map((c) => ({ uid: c.user_id, chars: c.chars || {}, note: c.note || "" })),
        requests: requests.map((r) => ({
          id: String(r.id), kind: r.kind, recipeId: r.recipe_id, listingId: r.listing_id, label: r.label, qty: r.qty,
          tip: Number(r.tip), note: r.note, from: r.from_id, fromChar: r.from_char, to: r.to_id, toChar: r.to_char,
          status: r.status, created: Date.parse(r.created_at), updated: Date.parse(r.updated_at),
        })),
        listings: listings.map((l) => ({
          id: String(l.id), seller: l.seller_id, char: l.char, type: l.type, item: l.item, qty: l.qty,
          price: Number(l.price), note: l.note, created: Date.parse(l.created_at),
        })),
      };
    },
    // ---- Private messages ----
    async sendDm(to, body) { await need(); ok(await sb.from("direct_messages").insert({ recipient_id: to, body })); },
    async markDmsRead(from) { const id = await need(); ok(await sb.from("direct_messages").update({ read_at: new Date().toISOString() }).eq("recipient_id", id).eq("sender_id", from).is("read_at", null)); },
    async deleteDm(id) { ok(await sb.from("direct_messages").delete().eq("id", Number(id))); },
    // ---- Discord (admins) ----
    async discordConfig() { return ok(await sb.rpc("discord_config_get")); },
    async discordConfigSet(webhook, news, board, market) { ok(await sb.rpc("discord_config_set", { p_webhook: webhook, p_news: news, p_board: board, p_market: market })); },
    async discordTest() { ok(await sb.rpc("discord_test")); },
    async discordBot(action) {
      const { data } = await sb.auth.getSession();
      const token = data.session?.access_token; if (!token) throw new Error("Please sign in first.");
      const r = await fetch("/.netlify/functions/discord-admin?action=" + action, { method: action === "setup" ? "POST" : "GET", headers: { Authorization: "Bearer " + token } });
      let body = {}; try { body = await r.json(); } catch {}
      if (!r.ok) throw new Error(body.error || "The Discord helper didn't answer.");
      return body;
    },
    // ---- Guild news (anyone reads; admins post) ----
    async loadNews() {
      const r = await sb.from("guild_news").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(50);
      return r.error ? [] : r.data.map((n) => ({ id: String(n.id), title: n.title, body: n.body, tag: n.tag, pinned: n.pinned, author: n.author_id, t: Date.parse(n.created_at) }));
    },
    async createNews(o) { await need(); ok(await sb.from("guild_news").insert({ title: o.title, body: o.body, tag: o.tag, pinned: !!o.pinned })); },
    async updateNews(id, f) { ok(await sb.from("guild_news").update(f).eq("id", Number(id))); },
    async deleteNews(id) { ok(await sb.from("guild_news").delete().eq("id", Number(id))); },
    // ---- Guides (anyone reads; members write their own) and reported prices ----
    async loadGuides() {
      const r = await sb.from("guides").select("*").order("updated_at", { ascending: false }).limit(300);
      return r.error ? [] : r.data.map((g) => ({ id: String(g.id), title: g.title, category: g.category, zone: g.zone, lmin: g.level_min, lmax: g.level_max, body: g.body, author: g.author_id, t: Date.parse(g.created_at), u: Date.parse(g.updated_at) }));
    },
    async saveGuide(o) {
      await need();
      const row = { title: o.title, category: o.category, zone: o.zone || "", level_min: o.lmin || null, level_max: o.lmax || null, body: o.body };
      ok(o.id ? await sb.from("guides").update(row).eq("id", Number(o.id)) : await sb.from("guides").insert(row));
    },
    async deleteGuide(id) { ok(await sb.from("guides").delete().eq("id", Number(id))); },
    async loadPrices() {
      const since = new Date(Date.now() - 90 * 86400000).toISOString();
      const r = await sb.from("price_points").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(5000);
      return r.error ? [] : r.data.map((p) => ({ id: String(p.id), item: p.item, price: Number(p.price), source: p.source, by: p.reporter_id, t: Date.parse(p.created_at) }));
    },
    async reportPrice(o) { await need(); ok(await sb.from("price_points").insert({ item: o.item, price: o.price, source: o.source })); },
    async deletePrice(id) { ok(await sb.from("price_points").delete().eq("id", Number(id))); },
    async accessToken() { const { data } = await sb.auth.getSession(); return data.session?.access_token || null; },
    // ---- Site settings (anyone can read; admins write) ----
    async loadSettings() { const r = await sb.from("site_settings").select("key,value"); return r.error ? {} : Object.fromEntries(r.data.map((x) => [x.key, x.value])); },
    async saveSetting(key, value) { await need(); ok(await sb.from("site_settings").upsert({ key, value, updated_at: new Date().toISOString() })); },
    // ---- Admin ----
    async adminSetMember(id, f) {
      const row = {};
      if ("rank" in f) row.guild_rank = f.rank;
      if ("isAdmin" in f) row.is_admin = !!f.isAdmin;
      const res = ok(await sb.from("profiles").update(row).eq("id", id).select("id"));
      if (!res || !res.length) throw new Error("The database didn't allow that change. Is your account an admin?");
    },
    // ---- Chat ----
    async sendMessage(type, threadId, body) { await need(); ok(await sb.from("messages").insert({ thread_type: type, thread_id: Number(threadId), body })); },
    async deleteMessage(id) { ok(await sb.from("messages").delete().eq("id", Number(id))); },
    // ---- Profile picture: shrink to 256px in the browser, then store under avatars/<user id>/ ----
    async uploadAvatar(file) {
      const id = await need();
      const blob = await shrinkImage(file, 256);
      const path = `${id}/avatar-${Date.now()}.jpg`;
      ok(await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: false }));
      const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      ok(await sb.from("profiles").update({ avatar_url: url }).eq("id", id));
      return url;
    },
    async removeAvatar() { const id = await need(); ok(await sb.from("profiles").update({ avatar_url: "" }).eq("id", id)); },
    // ---- Who's online (Supabase Realtime presence) ----
    joinPresence(info, onChange) {
      if (presence) sb.removeChannel(presence);
      presence = sb.channel("guild-online", { config: { presence: { key: info.id } } });
      presence.on("presence", { event: "sync" }, () => {
        const st = presence.presenceState(); const list = [];
        for (const [key, metas] of Object.entries(st)) if (metas && metas[0]) list.push({ id: key, ...metas[0] });
        onChange(list);
      }).subscribe((status) => { if (status === "SUBSCRIBED") presence.track({ ...info, since: Date.now() }); });
    },
    updatePresence(info) { if (presence) presence.track(info); },
    leavePresence() { if (presence) { sb.removeChannel(presence); presence = null; } },
    // ---- Discord sign-in (shows once switched on in Supabase) ----
    async discordEnabled() {
      try { const r = await fetch(`${BACKEND.supabaseUrl}/auth/v1/settings`, { headers: { apikey: BACKEND.supabaseAnonKey } }); return !!(await r.json()).external?.discord; } catch { return false; }
    },
    async signInWithDiscord() { ok(await sb.auth.signInWithOAuth({ provider: "discord", options: { redirectTo } })); },
    // ---- Profile & notifications ----
    async saveProfile(f) {
      const id = await need();
      ok(await sb.from("profiles").update({
        main_char: f.mainChar, main_realm: f.mainRealm, main_class: f.mainClass, main_level: f.mainLevel || 0,
        faction: f.faction, bio: f.bio, discord: f.discord, play_times: f.playTimes,
      }).eq("id", id));
    },
    async markNotifsSeen() { const id = await need(); ok(await sb.from("profiles").update({ notif_seen_at: new Date().toISOString() }).eq("id", id)); },
    // ---- Public request board ----
    async createPost(o) {
      await need();
      ok(await sb.from("board_posts").insert({ author_char: o.authorChar, category: o.category, title: o.title, recipe_id: o.recipeId || null, qty: o.qty, offer: o.offer, note: o.note || "" }));
    },
    async updatePost(id, fields) {
      const row = {};
      if ("status" in fields) row.status = fields.status;
      if ("claimer" in fields) row.claimer_id = fields.claimer;
      if ("claimerChar" in fields) row.claimer_char = fields.claimerChar;
      ok(await sb.from("board_posts").update(row).eq("id", Number(id)));
    },
    async deletePost(id) { ok(await sb.from("board_posts").delete().eq("id", Number(id))); },
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
