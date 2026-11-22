/* GuildCraft Hall — page logic. Data access lives in backend.js. */
(() => {
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const fmt = (n) => Number(n).toLocaleString("en-US");
// Money is stored in gold (1g = 100s = 10,000c) and shown like the game: 1g 25s 50c with coin icons.
const toCopper = (g) => Math.max(0, Math.round((Number(g) || 0) * 10000));
const gold = (g, empty) => {
  const c = toCopper(g); if (!c) return empty != null ? empty : '<span class="muted">—</span>';
  const gg = Math.floor(c / 10000), s = Math.floor((c % 10000) / 100), cc = c % 100;
  const label = [gg && gg + " gold", s && s + " silver", cc && cc + " copper"].filter(Boolean).join(" ");
  return `<span class="coins" title="${label}" aria-label="${label}">${gg ? `<span class="g">${fmt(gg)}</span>` : ""}${s ? `<span class="s">${s}</span>` : ""}${cc ? `<span class="c">${cc}</span>` : ""}</span>`;
};
// Gold / silver / copper input boxes; readCoins() turns them back into gold.
const coinInput = (id, g, label) => {
  const c = toCopper(g), gg = Math.floor(c / 10000), s = Math.floor((c % 10000) / 100), cc = c % 100;
  return `<span class="coin-input" role="group" aria-label="${esc(label || "Price")}">
    <label class="ci g"><input type="number" id="${id}-g" min="0" max="999999" step="1" inputmode="numeric" value="${gg || ""}" placeholder="0" aria-label="Gold"><span>g</span></label>
    <label class="ci s"><input type="number" id="${id}-s" min="0" max="99" step="1" inputmode="numeric" value="${s || ""}" placeholder="0" aria-label="Silver"><span>s</span></label>
    <label class="ci c"><input type="number" id="${id}-c" min="0" max="99" step="1" inputmode="numeric" value="${cc || ""}" placeholder="0" aria-label="Copper"><span>c</span></label></span>`;
};
const readCoins = (id) => {
  const n = (k) => Math.max(0, Math.floor(Number(($("#" + id + "-" + k) || {}).value) || 0));
  return (n("g") * 10000 + Math.min(99, n("s")) * 100 + Math.min(99, n("c"))) / 10000;
};
const ago = (t) => { if (!t) return ""; const s = (Date.now() - t) / 1000; if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago"; if (s < 86400) return Math.floor(s / 3600) + "h ago"; return Math.floor(s / 86400) + "d ago"; };
// Guild settings. Paste the guild's Discord invite (e.g. "https://discord.gg/abc123") to show a Join button on the front page.
const GUILD = { discordInvite: "" };
const SRC = { 1: "Crafted", 2: "World drop", 4: "Quest", 5: "Vendor", 6: "Trainer", 16: "Fishing", 21: "Pickpocket" };
const FINISHED = new Set(["done", "declined", "cancelled"]);

/* ---------- state ---------- */
const S = {
  view: "recipes", q: "", prof: -1, hasCrafter: false, onlyNew: false, limit: 150, sel: null, reqFor: null,
  B: null, me: null, uid: null, loaded: false,
  crafters: new Map(), requests: [], listings: [], profiles: {}, bnet: {}, board: [], messages: [], online: [], chatOpen: new Set(), onlineOpen: false,
  boardTab: "open", boardCat: "", viewUser: null, notifOpen: false, seenOverride: 0, postOpen: false,
  myDoc: null, pendingSave: false, editChar: lsGet("gc.editChar"), editProf: null, mineQ: "", saveState: "",
  reqTab: "open", mq: "", mtype: "", msort: "new", authTab: "in",
  news: [], newsAll: false, dms: [], settings: {}, dmWith: null, memQ: "", memClass: "", memRank: "", adminTab: "members",
};
let PROFS = [], ITEMS = {}, RECIPES = [], BYID = new Map(), INDEX = new Map(), DATA_OK = false;
let renderQueued = false;
const isTrainer = (r) => !r.src.length || r.src.includes(6);

/* ---------- recipe data ---------- */
fetch("recipes.json").then((r) => r.json()).then((d) => {
  PROFS = d.professions; ITEMS = d.items;
  RECIPES = d.recipes.map((a) => {
    const [id, name, p, lv, colors, cr, cmin, cmax, mats, q, src, isNew] = a;
    const item = ITEMS[cr];
    const r = { id, name, p, lv, colors: colors || [], cr, cmin, cmax, mats, q: item ? item[1] : (q >= 0 ? q : 1), src, isNew: !!isNew };
    r.s = (name + " " + (item ? item[0] : "") + " " + mats.map((m) => (ITEMS[m[0]] || [""])[0]).join(" ")).toLowerCase();
    return r;
  }).sort((a, b) => a.p - b.p || a.lv - b.lv || a.name.localeCompare(b.name));
  RECIPES.forEach((r) => BYID.set(r.id, r));
  DATA_OK = true;
  route();
}).catch(() => { $("#view-recipes").innerHTML = `<div class="empty"><strong>The recipe list didn't load.</strong>Refresh the page to try again.</div>`; });

const itemName = (id) => (ITEMS[id] || ["Item #" + id])[0];
const itemQ = (id) => (ITEMS[id] || [0, 1])[1];
const profName = (i) => PROFS[i] || "?";
const profIndex = (name) => PROFS.indexOf(name);
const userName = (uid) => (S.profiles[uid] && S.profiles[uid].username) || "";
const myChars = () => Object.keys((S.myDoc && S.myDoc.chars) || {});
function defaultChar() { const saved = lsGet("gc.char"); const mine = myChars(); return saved && mine.includes(saved) ? saved : (mine[0] || saved || ""); }

/* ---------- backend ---------- */
(async () => {
  S.B = await openBackend();
  $("#demo-note").hidden = S.B.mode !== "demo";
  S.B.discordEnabled().then((on) => { $("#discord-wrap").hidden = !on; });
  if (GUILD.discordInvite) { const a = $("#home-actions"); if (a) a.dataset.discord = GUILD.discordInvite; }
  S.B.onChange(() => queueRefresh());
  S.B.onAuthChange(async (event) => {
    if (event === "PASSWORD_RECOVERY") $("#newpass").hidden = false;
    await loadMe(); queueRefresh(true);
  });
  await loadMe();
  await refresh();
  // Coming back from Battle.net: say how it went, then tidy the address bar.
  const bnetResult = new URLSearchParams(location.search).get("bnet");
  if (bnetResult) {
    // The Battle.net details come back through sessionStorage; save them under this member's own sign-in.
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem("gc.bnet") || "null"); sessionStorage.removeItem("gc.bnet"); } catch {}
    if (saved && S.uid) {
      try { await S.B.saveBnet(saved); await refresh(); }
      catch (e) { note("Battle.net details came back but couldn't be saved: " + e.message); history.replaceState(null, "", location.pathname + "#mine"); return; }
    }
    const msgs = {
      linked: "Battle.net linked. Your characters are listed on My crafter; add the ones you craft on.",
      "linked-nochars": "Battle.net linked. Blizzard didn't list any WoW Forever characters for this account, so add your characters by hand.",
      cancelled: "Battle.net linking was cancelled.",
      expired: "That Battle.net link attempt expired. Try again.",
      off: "Battle.net linking isn't switched on yet.",
      failed: "Battle.net linking didn't work. Try again in a moment.",
    };
    note(msgs[bnetResult] || msgs.failed);
    history.replaceState(null, "", location.pathname + (location.hash || "#mine"));
  }
  setInterval(() => { if (S.uid && document.visibilityState === "visible") refresh(); }, 60000);
})();

async function loadMe() {
  try { S.me = await S.B.currentUser(); } catch { S.me = null; }
  if ((S.me && S.me.id) !== S.uid) { S.myDoc = null; S.crafters = new Map(); S.requests = []; S.listings = []; }
  S.uid = S.me ? S.me.id : null;
  if (!S.uid && S.presenceKey) { S.B.leavePresence(); S.presenceKey = null; S.online = []; }
  if (S.uid && S.dcIdentity === undefined) loadDiscordIdentity();
  if (!S.uid) S.dcIdentity = undefined;
  renderWho();
}
function renderWho() {
  $("#who").innerHTML = S.me
    ? `<a class="me-link" href="#profile" title="Your profile">${avatarImg(S.uid, 26)}<span>${esc(S.me.username)}</span></a><button class="btn small" data-act="signout">Sign out</button>`
    : `<button class="btn small primary" data-act="signin">Sign in</button>`;
}
// Tell the guild who's here (and on which page), once profile details are loaded.
function presenceInfo() { const p = prof(S.uid); return { username: S.me ? S.me.username : "", char: p.mainChar || defaultChar() || "", cls: p.mainClass || "", avatar: p.avatar || "", page: S.view }; }
function syncPresence() {
  if (!S.uid || !S.B) return;
  if (S.presenceKey !== S.uid) {
    S.presenceKey = S.uid;
    S.B.joinPresence({ id: S.uid, ...presenceInfo() }, (list) => { S.online = list; renderOnline(); });
  } else S.B.updatePresence({ id: S.uid, ...presenceInfo() });
}

let refreshTimer = null;
function queueRefresh(now) { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, now ? 0 : 400); }
async function refresh() {
  S.B.loadSettings().then((s) => { S.settings = s || {}; renderHome(); }).catch(() => {});
  S.B.loadNews().then((n) => { S.news = n || []; renderNews(); if (S.view === "admin" && S.adminTab === "news") renderAdmin(); }).catch(() => {});
  if (S.view === "guides" || S.gLoaded) loadGuideData();
  loadEvents();
  if (!S.uid) { S.loaded = true; buildIndex(); render(); return; }
  loadAlerts();
  try {
    const d = await S.B.loadAll();
    S.profiles = d.profiles; S.bnet = d.bnet || {}; S.board = d.board || []; S.messages = d.messages || []; S.dms = d.dms || [];
    if (S.me) S.me.isAdmin = !!(S.profiles[S.uid] && S.profiles[S.uid].isAdmin);
    S.crafters = new Map(d.crafters.map((c) => [c.uid, c]));
    S.requests = d.requests; S.listings = d.listings;
    if (!S.pendingSave) { const mine = S.crafters.get(S.uid); S.myDoc = mine ? structuredClone({ chars: mine.chars, note: mine.note }) : (S.myDoc || null); }
    if (S.presenceKey !== S.uid) { syncPresence(); renderWho(); }
    S.loaded = true; setStatus("");
  } catch (e) { setStatus("<strong>Guild data didn't load.</strong> " + esc(e.message || "") + " It will retry in a minute."); }
  buildIndex(); render();
}
function setStatus(html) { const el = $("#status-note"); el.innerHTML = html; el.hidden = !html; }
function note(msg) { setStatus(`<strong>${esc(msg)}</strong>`); $("#status-note").scrollIntoView({ block: "nearest" }); }

function buildIndex() {
  INDEX = new Map();
  for (const [uid, doc] of S.crafters) {
    for (const [char, c] of Object.entries(doc.chars || {})) {
      for (const [prof, p] of Object.entries(c.profs || {})) {
        for (const id of p.known || []) {
          if (!INDEX.has(id)) INDEX.set(id, []);
          INDEX.get(id).push({ uid, char, skill: p.skill || 0, prof, note: doc.note || "" });
        }
      }
    }
  }
}

/* ---------- routing ---------- */
function route() {
  const h = location.hash.slice(1);
  const VIEWS = ["home", "rules", "map", "cities", "chronicle", "classes", "loot", "board", "recipes", "mine", "requests", "market", "profile", "members", "messages", "admin", "guides", "events"];
  let view = "home";
  S.viewUser = null; S.notifOpen = false; S.onlineOpen = false;
  if (/^recipe-\d+$/.test(h)) { S.sel = Number(h.slice(7)); view = "recipes"; }
  else if (/^member-[0-9a-z_-]+$/i.test(h)) { S.viewUser = h.slice(7); view = "profile"; }
  else if (/^messages-[0-9a-z_-]+$/i.test(h)) { S.dmWith = h.slice(9); view = "messages"; }
  else if (h === "messages") { S.dmWith = null; view = "messages"; }
  else if (/^event-\d+$/.test(h)) { if (S.eventId !== h.slice(6)) S.evMsg = ""; S.eventId = h.slice(6); S.evEdit = null; view = "events"; }
  else if (h === "events") { S.eventId = null; view = "events"; }
  else if (/^guide-\d+$/.test(h)) { S.guideId = h.slice(6); S.gEdit = null; view = "guides"; }
  else if (h === "guides" || h === "prices") { S.guideId = null; if (h === "prices") S.gTab = "prices"; view = "guides"; }
  else if (/^rule-\d$|^consequences$/.test(h)) view = "rules";
  else if (VIEWS.includes(h)) view = h;
  const changed = S.view !== view;
  S.view = view;
  document.querySelectorAll("nav.tabs a").forEach((a) => a.setAttribute("aria-current", a.dataset.tab === view ? "page" : "false"));
  // Light up the menu group holding the current page, and close any open menu.
  document.querySelectorAll("nav.tabs .navgrp").forEach((g) => {
    g.querySelector(".navbtn").classList.toggle("active", !!g.querySelector(`a[data-tab="${view}"]`));
    g.classList.remove("open"); g.querySelector(".navbtn").setAttribute("aria-expanded", "false");
  });
  VIEWS.forEach((v) => ($("#view-" + v).hidden = v !== view));
  if (view === "rules" && h !== "rules") { const el = document.getElementById(h); if (el) el.scrollIntoView(); }
  else if (changed) window.scrollTo(0, 0);
  if (changed && S.presenceKey) syncPresence();
  render();
}
window.addEventListener("hashchange", route);

function render() {
  if (renderQueued) return; renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    renderHome();
    if (!DATA_OK) { $("#view-recipes").innerHTML = `<div class="empty"><strong>Loading 2,215 recipes…</strong></div>`; return; }
    const open = S.requests.filter((r) => r.to === S.uid && r.status === "pending").length;
    const b = $("#req-badge"); b.textContent = open; b.hidden = !open;
    const a = document.activeElement;
    // A half-typed chat message survives redraws (new messages still appear); other forms pause redraws while typing.
    const chatForm = a && a.closest && a.closest(".chat-form");
    const chatState = chatForm ? { key: chatForm.dataset.key, value: a.value, s: a.selectionStart, e: a.selectionEnd } : null;
    const typing = !chatForm && a && a.matches && a.matches("input[type=text],input[type=number],input[type=password],textarea") ? a : null;
    if (chatState) setTimeout(() => {
      const box = document.querySelector(`.chat-form[data-key="${chatState.key}"] input`);
      if (box && document.activeElement !== box) { box.value = chatState.value; box.focus(); try { box.setSelectionRange(chatState.s, chatState.e); } catch {} }
    }, 0);
    renderBell(); renderOnline(); renderDmButton(); renderEventBits(); renderTradeBadge();
    if (S.view === "events") { if (!(typing && typing.closest("#view-events"))) renderEvents(); }
    else if (S.view === "map") { if (window.GC_MAP) window.GC_MAP.render(); }
    else if (S.view === "cities") { if (window.GC_CITIES && !(typing && typing.closest("#view-cities"))) window.GC_CITIES.render(); }
    else if (S.view === "loot") { if (window.GC_LOOT && !(typing && typing.closest("#view-loot"))) window.GC_LOOT.render(); }
    else if (S.view === "board") { if (!(typing && typing.closest("#view-board"))) { renderBoard(); scrollChats(); } }
    else if (S.view === "profile") { if (!(typing && typing.closest("#view-profile"))) renderProfile(); }
    else if (S.view === "members") { if (!(typing && typing.closest("#view-members"))) renderMembers(); }
    else if (S.view === "messages") renderMessages();
    else if (S.view === "admin") { if (!(typing && typing.closest("#view-admin"))) renderAdmin(); }
    else if (S.view === "guides") { if (!(typing && typing.closest("#view-guides"))) renderGuides(); }
    else if (S.view === "recipes") renderRecipes();
    else if (S.view === "mine") { if (!(typing && typing.closest("#view-mine"))) renderMine(); }
    else if (S.view === "requests") { if (!(typing && typing.closest("#view-requests"))) { renderRequests(); scrollChats(); } }
    else renderMarket();
  }, 0);
}
/* ---------- Hooks for the map page (map.js) ---------- */
let ITEM_INDEX = null;
window.GC_ITEMS = () => {
  if (!DATA_OK) return null;
  if (!ITEM_INDEX) {
    const uses = {};
    RECIPES.forEach((r) => r.mats.forEach(([id]) => { uses[id] = (uses[id] || 0) + 1; }));
    const byName = {};
    for (const [id, v] of Object.entries(ITEMS)) if (uses[id]) byName[v[0].toLowerCase()] = { name: v[0], uses: uses[id] };
    ITEM_INDEX = { byName };
  }
  return ITEM_INDEX;
};
// From the Loot Vault: open the Request Board with a request already filled in.
window.GC_POST = (title, category) => {
  if (!S.uid) { openAuth("in"); return; }
  S.postOpen = true; S.boardTab = "open";
  location.hash = "#board";
  setTimeout(() => {
    renderBoard();
    const t = $("#bf-title"), c = $("#bf-cat");
    if (t) { t.value = String(title).slice(0, 80); t.focus(); }
    if (c && category) c.value = category;
  }, 50);
};
window.GC_SEARCH_RECIPES = (name) => {
  S.q = name; S.prof = -1; S.limit = 150; S.sel = null;
  location.hash = "#recipes";
  setTimeout(() => { const box = $("#rq"); if (box) { box.value = name; renderRecipes(); } }, 0);
};

/* ---------- Home ---------- */
function renderHome() {
  const act = $("#home-actions"); if (!act) return;
  const inv = (S.settings.discord_invite || GUILD.discordInvite || "").trim();
  const discord = /^https:\/\/(discord\.gg|discord\.com\/invite)\//.test(inv) ? `<a class="btn discord" href="${esc(inv)}" target="_blank" rel="noopener">Join our Discord</a>` : "";
  const ann = $("#home-announce");
  if (ann) { const t = (S.settings.announcement || "").trim(); ann.hidden = !t; ann.innerHTML = t ? `<span class="ann-label">From the officers</span><p>${esc(t)}</p>` : ""; }
  act.innerHTML = `<a class="btn primary" href="#rules">Read the guild rules</a>` + discord + (S.uid
    ? `<a class="btn" href="#mine">Go to my crafter</a>`
    : `<button class="btn" data-act="signup">Create your account</button><button class="btn" data-act="signin">Sign in</button>`);
  const st = $("#home-stats");
  if (!S.uid) { st.innerHTML = ""; return; }
  const crafters = [...S.crafters.values()].filter((c) => Object.keys(c.chars || {}).length).length;
  let known = 0; INDEX.forEach(() => known++);
  const listings = S.listings.length;
  const open = S.requests.filter((r) => r.to === S.uid && r.status === "pending").length;
  const stat = (n, label) => `<div><span class="num">${fmt(n)}</span><span>${label}</span></div>`;
  st.innerHTML = stat(crafters, crafters === 1 ? "crafter listed" : "crafters listed") + stat(known, "recipes covered")
    + stat(listings, listings === 1 ? "market listing" : "market listings") + stat(open, open === 1 ? "request for you" : "requests for you");
}

/* ---------- Guild news (home page, above the gallery) ---------- */
const NEWS_TAGS = ["News", "Coming soon", "Event", "Update"];
const newsDate = (t) => new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
function renderNews() {
  const box = $("#guild-news"); if (!box) return;
  const list = S.news;
  const shown = S.newsAll ? list : list.slice(0, 3);
  box.innerHTML = shown.length ? shown.map((n) => `<article class="gnews ${n.pinned ? "pinned" : ""}">
      <div class="gnews-top"><span class="ntag ntag-${esc(n.tag.toLowerCase().replace(/\s+/g, "-"))}">${esc(n.tag)}</span>${n.pinned ? '<span class="npin" title="Pinned">📌 Pinned</span>' : ""}<span class="muted ndate">${newsDate(n.t)}</span></div>
      <h4>${esc(n.title)}</h4>${n.body ? `<p>${esc(n.body)}</p>` : ""}
    </article>`).join("") + (list.length > 3 ? `<button class="linkish news-more" data-act="news-more">${S.newsAll ? "Show less" : `Show all ${list.length} posts`}</button>` : "")
    : `<p class="muted">No guild news yet.</p>`;
}

const signInPrompt = (what) => `<div class="card empty"><strong>Sign in to ${what}.</strong>Guild members share recipes, requests and listings once they're signed in.<div style="margin-top:12px"><button class="btn primary" data-act="signin">Sign in or create an account</button></div></div>`;

/* ---------- Recipes ---------- */
function skillBar(r) {
  const c = r.colors; if (!c || c.length < 4) return "";
  const max = Math.max(c[3] + 10, 1), min = Math.min(r.lv, c[0]);
  const span = Math.max(max - min, 1); const w = (v) => Math.max(0, (v / span) * 100);
  return `<span class="bar" title="Orange ${c[0]} · Yellow ${c[1]} · Green ${c[2]} · Grey ${c[3]}"><i style="width:${w(c[1] - c[0])}%;background:var(--sk-o)"></i><i style="width:${w(c[2] - c[1])}%;background:var(--sk-y)"></i><i style="width:${w(c[3] - c[2])}%;background:var(--sk-g)"></i><i style="flex:1;background:var(--sk-x)"></i></span>`;
}
function filteredRecipes() {
  const q = S.q.trim().toLowerCase();
  return RECIPES.filter((r) => (S.prof < 0 || r.p === S.prof) && (!S.onlyNew || r.isNew) && (!S.hasCrafter || INDEX.has(r.id)) && (!q || r.s.includes(q)));
}
function renderRecipes() {
  const root = $("#view-recipes");
  if (!root.dataset.built) {
    root.dataset.built = "1";
    root.innerHTML = `
      <div class="filters">
        <input type="search" id="rq" placeholder="Search recipes, items or materials (e.g. Thorium Bar)" aria-label="Search recipes">
        <label class="chk"><input type="checkbox" id="rhas"> Someone in the guild can craft it</label>
        <label class="chk"><input type="checkbox" id="rnew"> New in Forever</label>
      </div>
      <div class="chips" id="rprofs" style="margin-bottom:12px"></div>
      <div class="ledger">
        <div><div class="table-wrap"><table>
          <thead><tr><th>Recipe</th><th class="hide-sm">Profession</th><th>Skill</th><th>Crafters</th></tr></thead>
          <tbody id="rbody"></tbody></table></div><div id="rmore"></div></div>
        <aside class="sheet" id="sheet" aria-label="Recipe details"></aside>
      </div>`;
    $("#rq").addEventListener("input", (e) => { S.q = e.target.value; S.limit = 150; renderRecipes(); });
    $("#rhas").addEventListener("change", (e) => { S.hasCrafter = e.target.checked; S.limit = 150; renderRecipes(); });
    $("#rnew").addEventListener("change", (e) => { S.onlyNew = e.target.checked; S.limit = 150; renderRecipes(); });
  }
  const counts = PROFS.map((_, i) => RECIPES.filter((r) => r.p === i).length);
  $("#rprofs").innerHTML = `<button class="chip" data-prof="-1" aria-pressed="${S.prof < 0}">All<span class="n">${fmt(RECIPES.length)}</span></button>` +
    PROFS.map((p, i) => `<button class="chip" data-prof="${i}" aria-pressed="${S.prof === i}">${esc(p)}<span class="n">${counts[i]}</span></button>`).join("");
  const list = filteredRecipes();
  const shown = list.slice(0, S.limit);
  $("#rbody").innerHTML = shown.length ? shown.map((r) => {
    const cs = INDEX.get(r.id) || [];
    return `<tr class="click" data-recipe="${r.id}" aria-selected="${S.sel === r.id}" tabindex="0">
      <td><span class="rname q${r.q}">${esc(r.name)}</span>${r.isNew ? '<span class="tag new">New</span>' : ""}</td>
      <td class="hide-sm muted">${esc(profName(r.p))}</td>
      <td><span class="skill">${r.lv} ${skillBar(r)}</span></td>
      <td class="crafters-n ${cs.length ? "has" : ""}">${cs.length ? cs.length : '<span class="muted">' + (S.uid ? "0" : "–") + "</span>"}</td></tr>`;
  }).join("") : `<tr><td colspan="4"><div class="empty"><strong>No recipes match.</strong>Try a different search or profession.</div></td></tr>`;
  $("#rmore").innerHTML = list.length > S.limit ? `<div class="more"><button class="btn" data-act="more">Show more (${fmt(list.length - S.limit)} left)</button></div>` :
    `<div class="more muted num">${fmt(list.length)} recipe${list.length === 1 ? "" : "s"}</div>`;
  const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest("#reqform");
  if (!typing) renderSheet();
}

function renderSheet() {
  const el = $("#sheet"); if (!el) return;
  const r = S.sel && BYID.get(S.sel);
  el.dataset.empty = r ? "false" : "true";
  if (!r) { el.innerHTML = `<div class="empty"><strong>Pick a recipe</strong>See its materials, skill-up ranks and who in the guild can craft it.</div>`; return; }
  const c = r.colors.length >= 4 ? r.colors : [r.lv, r.lv, r.lv, r.lv];
  const crafters = (INDEX.get(r.id) || []).slice().sort((a, b) => b.skill - a.skill);
  const creates = r.cr ? `Creates <span class="q${itemQ(r.cr)}">${esc(itemName(r.cr))}</span>${r.cmax > 1 ? ` ×${r.cmin === r.cmax ? r.cmin : r.cmin + "–" + r.cmax}` : ""}` : "Enchant / effect";
  const src = r.src.map((s) => SRC[s] || "Other").join(", ") || "Trainer (likely)";
  let who;
  if (!S.uid) who = `<p class="muted" style="margin:0"><button class="btn small primary" data-act="signin">Sign in</button> to see who in the guild can craft this.</p>`;
  else if (!crafters.length) who = `<p class="muted" style="margin:0">Nobody has listed this recipe yet. Crafters add theirs on the <a href="#mine">My crafter</a> tab.</p>`;
  else who = crafters.map((x, i) => {
    const mine = x.uid === S.uid; const un = userName(x.uid);
    return `<div class="crafter"><div><div class="nm">${esc(x.char)}${mine ? ' <span class="muted">(you)</span>' : ""}</div>
      <div class="rl">${un ? memberLink(x.uid, un) + " · " : ""}${tagFor(x.uid) ? `<span class="bnet-tag small" title="Verified Battle.net account">✓ ${esc(tagFor(x.uid))}</span> · ` : ""}${esc(x.prof)} ${x.skill || ""}</div>${x.note ? `<div class="note">${esc(x.note)}</div>` : ""}</div>
      ${mine ? "" : `<button class="btn small primary" data-act="ask" data-i="${i}">Request</button>`}</div>
      ${S.reqFor && S.reqFor.uid === x.uid && S.reqFor.char === x.char ? requestForm() : ""}`;
  }).join("");
  el.innerHTML = `
    <div class="head">
      <div><h2 class="q${r.q}">${esc(r.name)}</h2>
      <div class="sub">${esc(profName(r.p))} · learned at ${r.lv} · ${esc(src)}${r.isNew ? ' · <span style="color:var(--brass)">New in Forever</span>' : ""}</div></div>
      <button class="btn small close" data-act="close-sheet" aria-label="Close">Close</button>
    </div>
    <p class="muted" style="margin:10px 0 0">${r.cr ? `Creates ${whItem(r.cr)}${r.cmax > 1 ? ` ×${r.cmin === r.cmax ? r.cmin : r.cmin + "–" + r.cmax}` : ""}` : creates}</p>

    <details class="dd" open><summary>Materials and where to get them</summary>
      <ul class="mats">${r.mats.map((m) => {
        const g = window.GC_MAP && window.GC_MAP.findItem(itemName(m[0]));
        return `<li><span>${whItem(m[0])}${g ? ` <button class="linkish where" data-act="mapfind" data-mapfind="${esc(g.key)}">gathered in ${g.zones} zone${g.zones === 1 ? "" : "s"}</button>` : ""}</span><span class="num muted">×${m[1]}</span></li>`;
      }).join("")}</ul>
      <p class="muted dd-note">Hover a material for its Wowhead details.</p>
    </details>

    <details class="dd"><summary>How to learn it</summary>
      <p>Learned at skill <strong>${r.lv}</strong> from: ${esc(src)}.</p>
      <div class="ranks" aria-label="Skill-up ranks">
        <div style="border-color:var(--sk-o)">${c[0]}</div><div style="border-color:var(--sk-y)">${c[1]}</div>
        <div style="border-color:var(--sk-g)">${c[2]}</div><div style="border-color:var(--sk-x)">${c[3]}</div>
      </div>
      <p class="muted dd-note">Skill-ups are guaranteed up to the orange number, likely to yellow, unlikely to green, and stop at grey.</p>
      <p><a href="https://www.wowhead.com/forever/spell=${r.id}" target="_blank" rel="noopener">Recipe, trainers and vendors on Wowhead</a></p>
    </details>

    ${r.cr ? `<details class="dd"><summary>About the crafted item</summary>
      <p>${whItem(r.cr)}${r.cmax > 1 ? ` · makes ${r.cmin === r.cmax ? r.cmin : r.cmin + "–" + r.cmax} per craft` : ""}</p>
      <p class="muted dd-note">Hover the item for its full stats, or open it on Wowhead for drops, comments and screenshots.</p>
      <p><a href="https://www.wowhead.com/forever/item=${r.cr}" target="_blank" rel="noopener">${esc(itemName(r.cr))} on Wowhead</a></p>
    </details>` : ""}

    <h3>Guild crafters${S.uid ? ` (${crafters.length})` : ""}</h3>
    <div>${who}</div>`;
  el._crafters = crafters;
  refreshWowhead();
  if (window.GC_MAP && !window.GC_MAP.ready()) window.GC_MAP.load().then(() => { if (S.sel === r.id) renderSheet(); });
}
// A Wowhead item link: hover shows Wowhead's tooltip (icon, stats, where it drops).
function whItem(id) { return `<a class="wh q${itemQ(id)}" href="https://www.wowhead.com/forever/item=${id}" target="_blank" rel="noopener">${esc(itemName(id))}</a>`; }
function refreshWowhead() { try { if (window.$WowheadPower && window.$WowheadPower.refreshLinks) window.$WowheadPower.refreshLinks(); } catch {} }
function requestForm() {
  return `<form class="form" id="reqform">
    <div class="row"><label for="rf-char">Your character</label><input type="text" id="rf-char" value="${esc(defaultChar())}" required maxlength="24" placeholder="Who should receive it"></div>
    <div class="row"><label for="rf-qty">Quantity</label><input type="number" id="rf-qty" value="1" min="1" max="999"></div>
    <div class="row"><label for="rf-tip-g">Tip</label>${coinInput("rf-tip", 0, "Tip")}</div>
    <div class="row"><label for="rf-note">Note</label><input type="text" id="rf-note" maxlength="140" placeholder="I'll bring the mats / when you're online"></div>
    <div class="actions"><button type="button" class="btn" data-act="cancel-ask">Cancel</button><button class="btn primary" type="submit">Send request</button></div>
  </form>`;
}

/* ---------- My crafter ---------- */
function ensureMyDoc() { if (!S.myDoc) S.myDoc = { chars: {}, note: "" }; if (!S.myDoc.chars) S.myDoc.chars = {}; return S.myDoc; }
let saveTimer = null, saving = Promise.resolve();
function queueSave() {
  if (!S.uid) return;
  S.pendingSave = true; S.saveState = "Saving…"; updateSaved();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const body = structuredClone(ensureMyDoc());
    saving = saving.then(() => S.B.saveMine(body))
      .then(() => { S.saveState = "Saved. The guild can see your recipes."; S.crafters.set(S.uid, { uid: S.uid, ...body }); })
      .catch((e) => { S.saveState = "Couldn't save: " + (e.message || "try again in a moment") + ". Your changes are kept on this page."; })
      .finally(() => { S.pendingSave = false; updateSaved(); buildIndex(); });
  }, 700);
}
function updateSaved() { const el = $("#saved"); if (el) el.textContent = S.saveState; }

function renderMine() {
  const root = $("#view-mine");
  if (!S.uid) { root.innerHTML = signInPrompt("list what you can craft"); return; }
  const doc = ensureMyDoc();
  const chars = Object.keys(doc.chars);
  if (!S.editChar || !doc.chars[S.editChar]) S.editChar = chars[0] || null;
  const ch = S.editChar && doc.chars[S.editChar];
  const profs = ch ? Object.keys(ch.profs || {}) : [];
  if (!S.editProf || !profs.includes(S.editProf)) S.editProf = profs[0] || null;
  const left = `
    <div class="card">
      <h2>Your characters</h2>
      <div style="display:grid;gap:4px">${chars.map((c) => {
        const n = Object.values(doc.chars[c].profs || {}).reduce((s, p) => s + (p.known || []).length, 0);
        return `<button class="list-btn" data-act="pick-char" data-char="${esc(c)}" aria-pressed="${c === S.editChar}"><span>${esc(c)}</span><span class="muted num">${n} recipes</span></button>`;
      }).join("") || `<p class="muted" style="margin:0 0 6px">Add the character that does your crafting.</p>`}</div>
      <form class="inline" id="addchar" style="margin-top:10px"><input type="text" id="newchar" maxlength="24" placeholder="Character name" aria-label="Character name"><button class="btn" type="submit">Add</button></form>
      ${bnetCard()}
      <h3>Crafter note</h3>
      <textarea id="mynote" rows="3" maxlength="200" placeholder="e.g. Bring mats, free for guildies. Online most evenings.">${esc(doc.note || "")}</textarea>
      <p class="saved" id="saved">${esc(S.saveState)}</p>
    </div>`;
  let right;
  if (!ch) right = `<div class="card empty"><strong>Add a character to start.</strong>Then add their professions and tick the recipes they know.</div>`;
  else {
    const avail = PROFS.filter((p) => !profs.includes(p));
    const p = S.editProf && ch.profs[S.editProf];
    const pi = profIndex(S.editProf);
    let body = `<p class="muted">Add a profession to list its recipes.</p>`;
    if (p) {
      const known = new Set(p.known || []);
      const q = S.mineQ.trim().toLowerCase();
      const rs = RECIPES.filter((r) => r.p === pi && (!q || r.s.includes(q)));
      body = `
        <div class="inline" style="margin-top:6px">
          <label class="muted" for="skill">Skill</label><input type="number" id="skill" min="1" max="300" value="${p.skill || 1}" style="width:80px">
          <button class="btn" data-act="mark-trainer">Tick all trainer recipes up to my skill</button>
          <button class="btn danger" data-act="clear-prof">Untick all</button>
          <button class="btn danger" data-act="remove-prof">Remove profession</button>
        </div>
        <div class="inline" style="margin-top:10px"><input type="search" id="mineq" value="${esc(S.mineQ)}" placeholder="Filter ${esc(S.editProf)} recipes" aria-label="Filter recipes" style="flex:1 1 220px">
          <span class="muted num">${known.size} of ${RECIPES.filter((r) => r.p === pi).length} known</span></div>
        <div class="known">${rs.map((r) => `<label><input type="checkbox" data-known="${r.id}" ${known.has(r.id) ? "checked" : ""}><span class="t q${r.q}">${esc(r.name)}</span><span class="lv">${r.lv}</span></label>`).join("")}</div>`;
    }
    right = `<div class="card">
      <div class="inline" style="justify-content:space-between"><h2 style="margin:0">${esc(S.editChar)}</h2><button class="btn small danger" data-act="remove-char">Remove character</button></div>
      <div class="chips" style="margin-top:12px">${profs.map((x) => `<button class="chip" data-act="pick-prof" data-prof="${esc(x)}" aria-pressed="${x === S.editProf}">${esc(x)} <span class="n">${(ch.profs[x].known || []).length}</span></button>`).join("")}
        ${avail.length ? `<select id="addprof" aria-label="Add profession"><option value="">+ Add profession</option>${avail.map((x) => `<option>${esc(x)}</option>`).join("")}</select>` : ""}</div>
      ${body}</div>`;
  }
  root.innerHTML = `<div class="cols">${left}${right}</div>`;
  const nq = $("#mineq"); if (nq && S._focusMine) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); }
}

function bnetCard() {
  const link = S.bnet[S.uid];
  if (!link) {
    const onNetlify = /netlify\.app$/.test(location.hostname) || location.hostname === "localhost";
    return `<h3>Battle.net</h3>
      <p class="muted" style="margin:0 0 8px">Link your Battle.net account so guildmates see your verified BattleTag, and import your characters.</p>
      ${onNetlify ? `<button class="btn primary" data-act="link-bnet">Link Battle.net account</button>`
        : `<a class="btn primary" href="https://guildcraft-hall.netlify.app/#mine">Link on guildcraft-hall.netlify.app</a>`}`;
  }
  const mine = new Set(myChars().map((c) => c.toLowerCase()));
  const chars = link.characters || [];
  return `<h3>Battle.net</h3>
    <div class="inline" style="justify-content:space-between"><span class="bnet-tag">✓ ${esc(link.battletag || "Linked")}</span><button class="btn small danger" data-act="unlink-bnet">Unlink</button></div>
    ${chars.length ? `<div class="bnet-chars">${chars.slice(0, 30).map((c, i) => `
      <div class="bnet-char"><div><strong>${esc(c.name)}</strong> <span class="muted">${esc(c.realm || "")}</span>
        <div class="muted" style="font-size:.78rem">${c.level ? "Level " + c.level + " " : ""}${esc(c.cls || "")}${c.game ? " · " + esc(c.game) : ""}</div></div>
        ${mine.has(String(c.name).toLowerCase()) ? '<span class="muted" style="font-size:.8rem">Added</span>' : `<button class="btn small" data-act="import-char" data-i="${i}">Add</button>`}</div>`).join("")}</div>`
      : `<p class="muted" style="margin:6px 0 0;font-size:.84rem">Blizzard didn't list any characters for this account. Add your WoW Forever characters by hand above.</p>`}`;
}
const tagFor = (uid) => (S.bnet[uid] && S.bnet[uid].battletag) || "";

/* ---------- Requests ---------- */
function renderRequests() {
  const root = $("#view-requests");
  if (!S.uid) { root.innerHTML = signInPrompt("see your requests"); return; }
  const filt = (r) => (S.reqTab === "open" ? !FINISHED.has(r.status) : FINISHED.has(r.status));
  const inc = S.requests.filter((r) => r.to === S.uid && filt(r)).sort((a, b) => (b.created || 0) - (a.created || 0));
  const out = S.requests.filter((r) => r.from === S.uid && filt(r)).sort((a, b) => (b.created || 0) - (a.created || 0));
  const card = (r, dir) => {
    const other = dir === "in" ? r.from : r.to;
    const otherChar = dir === "in" ? r.fromChar : r.toChar;
    const un = userName(other);
    const verb = r.kind === "craft" ? "Craft" : r.kind === "buy" ? "Buy" : "Sell";
    const rec = r.kind === "craft" && BYID.get(r.recipeId);
    let acts;
    if (dir === "in") acts = r.status === "pending" ? [["accepted", "Accept", "primary"], ["declined", "Decline", ""]] : r.status === "accepted" ? [["done", "Mark done", "primary"], ["declined", "Decline", ""]] : [["delete", "Remove", ""]];
    else acts = r.status === "pending" || r.status === "accepted" ? [["cancelled", "Cancel", ""]] : [["delete", "Remove", ""]];
    const mats = rec && dir === "in" && r.status !== "done" ? `<div class="meta">Mats for ×${r.qty}: ${rec.mats.map((m) => `${esc(itemName(m[0]))} ×${m[1] * (r.qty || 1)}`).join(", ")}</div>` : "";
    return `<div class="req">
      <div><div class="what">${verb}: ${rec ? `<a class="q${rec.q}" href="#recipe-${rec.id}">${esc(rec.name)}</a>` : esc(r.label || "Item")} <span class="num">×${r.qty || 1}</span></div>
        <div class="meta">${dir === "in" ? "From" : "To"} <strong>${esc(otherChar || "?")}</strong>${un ? ` (${esc(un)}${tagFor(other) ? " · " + esc(tagFor(other)) : ""})` : ""}${dir === "out" && r.fromChar ? ` · for ${esc(r.fromChar)}` : ""}${dir === "in" && r.toChar ? ` · to ${esc(r.toChar)}` : ""} · ${ago(r.created)} · ${r.kind === "craft" ? "Tip" : "Price"} ${gold(r.tip)}</div>
        ${r.note ? `<div class="meta">“${esc(r.note)}”</div>` : ""}${mats}</div>
      <div class="acts"><span class="pill st-${esc(r.status)}">${esc(r.status)}</span>${chatToggle("request", r.id)}${acts.map((a) => `<button class="btn small ${a[2]}" data-act="req" data-id="${esc(r.id)}" data-st="${a[0]}">${a[1]}</button>`).join("")}</div>
      ${chatBox("request", r.id) ? `<div class="req-chat">${chatBox("request", r.id)}</div>` : ""}
    </div>`;
  };
  root.innerHTML = `
    <div class="chips" style="margin-bottom:14px"><button class="chip" data-act="reqtab" data-t="open" aria-pressed="${S.reqTab === "open"}">Open</button><button class="chip" data-act="reqtab" data-t="closed" aria-pressed="${S.reqTab !== "open"}">Finished</button></div>
    <div class="split">
      <div><h2>Asked of me</h2><div class="box">${inc.map((r) => card(r, "in")).join("") || `<div class="empty"><strong>Nothing for you right now.</strong>List your recipes on My crafter so guildmates can ask.</div>`}</div></div>
      <div><h2>I asked for</h2><div class="box">${out.map((r) => card(r, "out")).join("") || `<div class="empty"><strong>You haven't asked for anything.</strong>Find a recipe and press Request next to a crafter.</div>`}</div></div>
    </div>`;
}

/* ---------- Market ---------- */
function renderMarket() {
  const root = $("#view-market");
  if (!S.uid) { root.dataset.built = ""; root.innerHTML = signInPrompt("use the guild market"); return; }
  if (!root.dataset.built) {
    root.dataset.built = "1";
    const itemNames = [...new Set(Object.values(ITEMS).map((x) => x[0]))].sort();
    root.innerHTML = `
      <div class="map-head board-head"><div><p class="eyebrow">Bark and Stone · Trade</p><h2 class="hero-title">Guild market</h2>
        <p class="muted map-intro">Buy and sell with guildmates. Press <strong>Buy</strong> or <strong>Sell to them</strong> and they get a request to arrange the trade in game.</p></div>
        <button class="btn primary" data-act="mk-post">Post a listing</button></div>
      <form class="form mk-post" id="postform" hidden>
        <div class="mk-type" role="radiogroup" aria-label="Selling or buying">
          <button type="button" class="chip" data-act="mk-type" data-t="S" aria-pressed="true">I'm selling</button>
          <button type="button" class="chip" data-act="mk-type" data-t="B" aria-pressed="false">I want to buy</button></div>
        <input type="hidden" id="pf-type" value="S">
        <div class="mk-grid">
          <div class="mk-f mk-item"><label for="pf-item">Item</label><input type="text" id="pf-item" list="itemlist" maxlength="60" required placeholder="e.g. Arcanite Bar"></div>
          <div class="mk-f"><label for="pf-qty">How many</label><input type="number" id="pf-qty" min="1" max="9999" value="1"></div>
          <div class="mk-f mk-price"><label for="pf-price-g">Price each</label>${coinInput("pf-price", 0, "Price each")}<small class="muted">Leave at 0 to take offers.</small></div>
          <div class="mk-f"><label for="pf-char">Your character</label><input type="text" id="pf-char" maxlength="24" required></div>
          <div class="mk-f mk-note"><label for="pf-note">Note <span class="muted">(optional)</span></label><input type="text" id="pf-note" maxlength="140" placeholder="e.g. Can craft more on request"></div>
        </div>
        <div class="actions"><span class="saved" id="pf-total"></span><button class="btn" type="button" data-act="mk-post">Cancel</button><button class="btn primary" type="submit">Post listing</button></div>
      </form>
      <datalist id="itemlist">${itemNames.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
      <div class="mk-bar">
        <input type="search" id="mq" placeholder="Search items, sellers or notes" aria-label="Search listings">
        <div class="chips" id="mk-tabs"></div>
        <select id="msort" aria-label="Sort"><option value="new">Newest first</option><option value="cheap">Cheapest first</option><option value="az">Item A–Z</option></select>
      </div>
      <div id="mk-list"></div>`;
    $("#mq").addEventListener("input", (e) => { S.mq = e.target.value; renderMarket(); });
    $("#msort").addEventListener("change", (e) => { S.msort = e.target.value; renderMarket(); });
    // Live total while typing a price.
    root.addEventListener("input", (e) => {
      if (!e.target.closest("#postform")) return;
      const each = readCoins("pf-price"), qty = Math.max(1, Number($("#pf-qty").value) || 1);
      $("#pf-total").innerHTML = each > 0 ? `${qty > 1 ? `${qty} × ${gold(each)} = ` : ""}<strong>${gold(each * qty)}</strong> in total` : "Offers welcome";
    });
  }
  const pc = $("#pf-char"); if (pc && !pc.value) pc.value = defaultChar();
  const q = S.mq.trim().toLowerCase(), tab = S.mtype || "";
  const counts = { "": S.listings.length, S: S.listings.filter((l) => l.type === "S").length, B: S.listings.filter((l) => l.type === "B").length, mine: S.listings.filter((l) => l.seller === S.uid).length };
  $("#mk-tabs").innerHTML = [["", "Everything"], ["S", "For sale"], ["B", "Wanted"], ["mine", "My listings"]]
    .map(([k, l]) => `<button class="chip" data-act="mtype" data-t="${k}" aria-pressed="${tab === k}">${l} <span class="n">${counts[k]}</span></button>`).join("");
  const byName = {}; for (const [id, v] of Object.entries(ITEMS)) byName[v[0].toLowerCase()] = { id, q: v[1] };
  const rows = S.listings.filter((l) => (tab === "mine" ? l.seller === S.uid : !tab || l.type === tab)
      && (!q || [l.item, l.char, l.note, userName(l.seller)].join(" ").toLowerCase().includes(q)))
    .sort(S.msort === "az" ? (a, b) => String(a.item).localeCompare(String(b.item))
      : S.msort === "cheap" ? (a, b) => (a.price || Infinity) - (b.price || Infinity) || String(a.item).localeCompare(String(b.item))
      : (a, b) => (b.created || 0) - (a.created || 0));
  const card = (l) => {
    const mine = l.seller === S.uid, un = userName(l.seller), it = byName[String(l.item).toLowerCase()];
    const name = it ? `<a class="q${it.q}" href="https://www.wowhead.com/forever/item=${it.id}" target="_blank" rel="noopener">${esc(l.item)}</a>` : `<span>${esc(l.item)}</span>`;
    const qty = l.qty || 1;
    const btns = [
      !mine ? `<button class="btn small primary" data-act="deal" data-id="${esc(l.id)}">${l.type === "B" ? "Sell to them" : "Buy"}</button>` : "",
      !mine ? `<a class="btn small" href="#messages-${esc(l.seller)}">Message</a>` : "",
      mine || (S.me && S.me.isAdmin && S.B.mode === "live") ? `<button class="btn small danger" data-act="unlist" data-id="${esc(l.id)}">Remove</button>` : "",
    ].join("");
    return `<article class="mk-card ${l.type === "B" ? "want" : "sell"}">
      <div class="mk-top"><span class="mk-badge">${l.type === "B" ? "Wanted" : "For sale"}</span><span class="muted mk-when">${ago(l.created)}</span></div>
      <h3 class="mk-name">${name} <span class="mk-qty">×${qty}</span></h3>
      <div class="mk-price-row">${l.price > 0 ? `<div><span class="muted">Each</span>${gold(l.price)}</div>${qty > 1 ? `<div><span class="muted">All ${qty}</span>${gold(l.price * qty)}</div>` : ""}` : `<div><span class="muted">Price</span><span class="mk-offer">Open to offers</span></div>`}</div>
      ${l.note ? `<p class="mk-note">${esc(l.note)}</p>` : ""}
      <div class="mk-foot"><span class="mk-who">${avatarImg(l.seller, 22)}<span><strong>${esc(l.char || "?")}</strong>${un ? ` <span class="muted">· ${memberLink(l.seller, un)}</span>` : ""}${mine ? ' <span class="muted">(you)</span>' : ""}</span></span>
        <span class="mk-btns">${btns}</span></div>
    </article>`;
  };
  const group = (title, list) => (list.length ? `<h3 class="sec mk-sec">${title} <span class="muted num">${list.length}</span></h3><div class="mk-grid-cards">${list.map(card).join("")}</div>` : "");
  const empty = `<div class="empty"><strong>${q ? "Nothing matches that search." : tab === "mine" ? "You haven't listed anything." : "No listings yet."}</strong>${q ? "Try another word." : "Press “Post a listing” to sell something or ask for what you need."}</div>`;
  $("#mk-list").innerHTML = !rows.length ? empty
    : tab ? `<div class="mk-grid-cards">${rows.map(card).join("")}</div>`
    : group("For sale", rows.filter((l) => l.type === "S")) + group("Wanted", rows.filter((l) => l.type === "B"));
  refreshWowhead();
}

/* ---------- Members & profiles ---------- */
const CLASSES = ["Druid", "Hunter", "Mage", "Paladin", "Priest", "Rogue", "Shaman", "Warlock", "Warrior"];
const CLASS_COLOR = { Druid: "#FF7C0A", Hunter: "#AAD372", Mage: "#3FC7EB", Paladin: "#F48CBA", Priest: "#E8E8E8", Rogue: "#FFF468", Shaman: "#0070DD", Warlock: "#8788EE", Warrior: "#C69B6D" };
const prof = (uid) => S.profiles[uid] || {};
const classDot = (c) => (CLASS_COLOR[c] ? `<span class="cdot" style="background:${CLASS_COLOR[c]}" title="${esc(c)}"></span>` : "");
const memberLink = (uid, label) => `<a class="mlink" href="#member-${esc(uid)}">${esc(label || userName(uid) || "Someone")}</a>`;
function profsOf(uid) {
  const out = [];
  const doc = S.crafters.get(uid);
  for (const [char, c] of Object.entries((doc && doc.chars) || {}))
    for (const [p, v] of Object.entries(c.profs || {})) out.push({ char, prof: p, skill: v.skill || 0, known: (v.known || []).length });
  return out;
}

// Profile picture, or the first letter on a class-coloured circle.
function avatarImg(uid, size) {
  const p = (S.profiles && S.profiles[uid]) || {};
  const url = /^https:\/\/|^data:image\//.test(p.avatar || "") ? p.avatar : "";
  const letter = esc(((p.mainChar || p.username || (uid === S.uid && S.me && S.me.username) || "?")[0] || "?").toUpperCase());
  const bg = CLASS_COLOR[p.mainClass] || "var(--brass)";
  return url ? `<img class="avatar" src="${esc(url)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px" loading="lazy">`
    : `<span class="avatar" aria-hidden="true" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px;background:${bg}">${letter}</span>`;
}

/* ---------- Chat threads (on requests and board posts) ---------- */
const threadMsgs = (type, id) => S.messages.filter((m) => m.type === type && m.thread === String(id));
function threadUnread(type, id) { const seen = seenAt(); return threadMsgs(type, id).filter((m) => m.author !== S.uid && m.t > seen).length; }
function chatToggle(type, id) {
  const n = threadMsgs(type, id).length, u = threadUnread(type, id), key = type + ":" + id;
  return `<button class="btn small chat-btn" data-act="chat" data-key="${key}" aria-expanded="${S.chatOpen.has(key)}">Chat${n ? ` (${n})` : ""}${u ? ' <span class="badge">' + u + "</span>" : ""}</button>`;
}
function chatBox(type, id) {
  const key = type + ":" + id;
  if (!S.chatOpen.has(key)) return "";
  const msgs = threadMsgs(type, id);
  return `<div class="chat">
    <div class="chat-log" aria-live="polite">${msgs.map((m) => `<div class="msg ${m.author === S.uid ? "me" : ""}">${avatarImg(m.author, 26)}
      <div class="msg-b"><div class="msg-meta"><strong>${esc(userName(m.author) || "Someone")}</strong> · ${ago(m.t)}${m.author === S.uid || (S.me && S.me.isAdmin) ? ` <button class="linkish small-x" data-act="msg-del" data-id="${esc(m.id)}" aria-label="Delete message">delete</button>` : ""}</div>
      <div class="msg-body">${esc(m.body)}</div></div></div>`).join("") || `<p class="muted chat-empty">No messages yet. Say hi, or sort out the details here.</p>`}</div>
    <form class="chat-form" data-key="${key}"><input type="text" maxlength="500" placeholder="Write a message…" aria-label="Message" autocomplete="off"><button class="btn small primary" type="submit">Send</button></form>
  </div>`;
}
function scrollChats() { document.querySelectorAll(".chat-log").forEach((el) => { el.scrollTop = el.scrollHeight; }); }

/* ---------- Who's online ---------- */
const PAGE_NAMES = { home: "Home", rules: "Rules", map: "the map", loot: "the Loot Vault", chronicle: "the Lore", classes: "Classes and races", cities: "the city guide", board: "the Request Board", recipes: "Recipes", mine: "My crafter", requests: "Requests", market: "the Market", profile: "profiles", members: "Members", messages: "Messages", admin: "Admin" };
function renderOnline() {
  const btn = $("#online-btn"); if (!btn) return;
  const list = S.uid ? S.online.slice().sort((a, b) => (a.id === S.uid ? -1 : b.id === S.uid ? 1 : (a.username || "").localeCompare(b.username || ""))) : [];
  btn.hidden = !S.uid;
  $("#online-count").textContent = list.length;
  const row = (o) => `<li><a href="#member-${esc(o.id)}">${avatarImg(o.id, 28)}<span><strong>${esc(o.char || o.username || "Someone")}</strong>${o.id === S.uid ? " (you)" : ""}<small>${o.username && o.char ? esc(o.username) + " · " : ""}on ${esc(PAGE_NAMES[o.page] || "the site")}</small></span></a></li>`;
  const panel = $("#online-panel");
  panel.hidden = !S.onlineOpen;
  if (S.onlineOpen) panel.innerHTML = `<div class="np-head"><strong>Online now (${list.length})</strong></div><ul class="online-list">${list.map(row).join("")}</ul>`;
  const home = $("#home-online");
  if (home) home.innerHTML = S.uid && list.length ? `<h3 class="sec">Online now <span class="online-dot"></span> ${list.length}</h3><ul class="online-list inline">${list.slice(0, 12).map(row).join("")}</ul>` : "";
}

function memberCard(uid, big) {
  const p = prof(uid), tag = tagFor(uid);
  const main = p.mainChar ? `${classDot(p.mainClass)}<strong>${esc(p.mainChar)}</strong>${p.mainLevel ? ` <span class="muted">${p.mainLevel}</span>` : ""}${p.mainClass ? ` <span class="muted">${esc(p.mainClass)}</span>` : ""}${p.mainRealm ? ` <span class="muted">· ${esc(p.mainRealm)}</span>` : ""}` : `<span class="muted">No main character set</span>`;
  const profs = profsOf(uid);
  return `<div class="member ${big ? "big" : ""}">
    ${avatarImg(uid, big ? 56 : 40)}
    <div class="minfo">
      <div class="mname">${big ? esc(p.username || "Member") : memberLink(uid, p.username)}${p.rank ? ` <span class="rank-tag rank-${esc(p.rank.toLowerCase())}">${esc(p.rank)}</span>` : ""}${p.isAdmin ? ' <span class="rank-tag admin">Admin</span>' : ""}${p.faction ? ` <span class="tag ${p.faction === "Horde" ? "horde" : "ally"}">${esc(p.faction)}</span>` : ""}${tag ? ` <span class="bnet-tag small">✓ ${esc(tag)}</span>` : ""}</div>
      <div class="mmain">${main}</div>
      ${profs.length ? `<div class="mprofs">${profs.map((x) => `<span class="pchip">${esc(x.prof)}${x.skill ? " " + x.skill : ""}</span>`).join("")}</div>` : ""}
    </div></div>`;
}

function renderProfile() {
  const root = $("#view-profile");
  if (!S.uid) { root.innerHTML = signInPrompt("see member profiles"); return; }
  const uid = S.viewUser || S.uid;
  const mine = uid === S.uid;
  const p = prof(uid);
  if (!S.profiles[uid]) { root.innerHTML = `<div class="card empty"><strong>That member wasn't found.</strong><a href="#profile">Back to your profile</a></div>`; return; }

  const posts = S.board.filter((b) => b.author === uid && b.status === "open");
  const others = Object.keys(S.profiles).filter((id) => id !== uid)
    .sort((a, b) => (userName(a) || "").localeCompare(userName(b) || ""));
  const details = `
    <div class="card">
      ${memberCard(uid, true)}
      ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ""}
      <dl class="pfacts">
        ${p.discord ? `<div><dt>Discord</dt><dd>${esc(p.discord)}</dd></div>` : ""}
        ${p.playTimes ? `<div><dt>Usually on</dt><dd>${esc(p.playTimes)}</dd></div>` : ""}
        ${p.joined ? `<div><dt>Joined the hall</dt><dd>${new Date(p.joined).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</dd></div>` : ""}
      </dl>
      ${!mine && posts.length ? `<h3>Open requests on the board</h3><ul class="mats">${posts.map((b) => `<li><a href="#board">${esc(b.title)}</a><span class="muted num">×${b.qty}</span></li>`).join("")}</ul>` : ""}
    </div>`;

  let editor = "";
  if (mine) {
    const chars = ((S.bnet[S.uid] || {}).characters) || [];
    editor = `
    <div class="card">
      <h2>Edit your profile</h2>
      <div class="avatar-edit">${avatarImg(S.uid, 72)}
        <div><label class="btn small" for="pr-avatar">Choose a picture</label><input type="file" id="pr-avatar" accept="image/jpeg,image/png,image/webp" class="visually-hidden">
          ${p.avatar ? `<button class="btn small danger" type="button" data-act="avatar-remove">Remove</button>` : ""}
          <p class="saved" id="pr-avatar-msg">Square works best. It's shrunk to 256 × 256.</p></div></div>
      ${chars.length ? `<div class="fillrow"><label class="muted" for="pf-fill">Fill from your WoW character</label>
        <select id="pf-fill"><option value="">Choose a character…</option>${chars.map((c, i) => `<option value="${i}">${esc(c.name)} · ${c.level || "?"} ${esc(c.cls || "")}${c.realm ? " · " + esc(c.realm) : ""}${c.game ? " (" + esc(c.game) + ")" : ""}</option>`).join("")}</select></div>`
      : `<p class="muted" style="margin:0 0 10px">Link your Battle.net account on <a href="#mine">My crafter</a> to fill this in from your WoW character.</p>`}
      <form class="form" id="profform" style="margin:0">
        <div class="row"><label for="pr-char">Main character</label><input type="text" id="pr-char" maxlength="24" value="${esc(p.mainChar || "")}"></div>
        <div class="row"><label for="pr-realm">Surname</label><input type="text" id="pr-realm" maxlength="40" value="${esc(p.mainRealm || "")}" placeholder="Your WoW Forever surname, e.g. Nightwin"></div>
        <div class="row"><label for="pr-armory">Armory link</label><input type="url" id="pr-armory" placeholder="Paste your Armory link to fill name and surname"></div>
        <div class="row"><label for="pr-class">Class</label><select id="pr-class"><option value="">—</option>${CLASSES.map((c) => `<option ${p.mainClass === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
        <div class="row"><label for="pr-level">Level</label><input type="number" id="pr-level" min="0" max="80" value="${p.mainLevel || ""}"></div>
        <div class="row"><label for="pr-faction">Faction</label><select id="pr-faction"><option value="">—</option>${["Alliance", "Horde"].map((f) => `<option ${p.faction === f ? "selected" : ""}>${f}</option>`).join("")}</select></div>
        <div class="row"><label for="pr-discord">Discord name</label><input type="text" id="pr-discord" maxlength="40" value="${esc(p.discord || "")}"></div>
        <div class="row"><label for="pr-times">Usually on</label><input type="text" id="pr-times" maxlength="80" value="${esc(p.playTimes || "")}" placeholder="e.g. Weeknights 7–10pm AEST"></div>
        <div class="row"><label for="pr-bio">About you</label><textarea id="pr-bio" rows="3" maxlength="400">${esc(p.bio || "")}</textarea></div>
        <div class="actions"><span class="saved" id="pr-saved"></span><button class="btn primary" type="submit">Save profile</button></div>
      </form>
      ${S.B && S.B.mode !== "demo" ? `<div class="dc-link" id="dc-link">${discordLinkBox()}</div>` : ""}
    </div>`;
  }
  root.innerHTML = `
    <div class="map-head prof-head"><div><p class="eyebrow"><a href="#members">Bark and Stone · Members</a></p><h2 class="hero-title">${mine ? "Your profile" : esc(p.username || "Member")}</h2></div>
      <div class="prof-acts">${mine ? "" : `<a class="btn primary" href="#messages-${esc(uid)}">Send a message</a>`}<a class="btn" href="#members">All members</a></div></div>
    <div class="cols prof-cols">${details}${editor || `<div class="card"><h2>Get in touch</h2><p class="muted">Send ${esc(p.username || "them")} a <a href="#messages-${esc(uid)}">private message</a>, find a recipe they know on <a href="#recipes">Recipes</a> and press Request, or post on the <a href="#board">Request Board</a> for anyone to pick up.</p></div>`}</div>
    ${armoryCard(uid, mine)}`;
  void others;
}

/* ---------- Members directory ---------- */
const RANKS = ["Thane", "Archdruid", "Backburner", "Officer", "Clansfolk", "Initiate"];
const rankTag = (p) => (p.rank ? `<span class="rank-tag rank-${esc(p.rank.toLowerCase())}">${esc(p.rank)}</span>` : "") + (p.isAdmin ? ' <span class="rank-tag admin">Admin</span>' : "");
function renderMembers() {
  const root = $("#view-members");
  if (!S.uid) { root.innerHTML = signInPrompt("see the guild's members"); delete root.dataset.built; return; }
  if (!root.dataset.built) {
    root.dataset.built = "1";
    root.innerHTML = `
      <div class="map-head"><p class="eyebrow">Bark and Stone · The guild</p><h2 class="hero-title">Members</h2>
        <p class="muted map-intro">Everyone in the hall. Click a member to see their profile, gear and professions, or to send them a message.</p></div>
      <div class="filters mem-filters">
        <input type="search" id="memq" placeholder="Search names, characters or professions" aria-label="Search members">
        <select id="memclass" aria-label="Class"><option value="">All classes</option>${CLASSES.map((c) => `<option>${c}</option>`).join("")}</select>
        <select id="memrank" aria-label="Rank"><option value="">All ranks</option>${RANKS.map((r) => `<option>${r}</option>`).join("")}</select>
        <span class="muted num" id="mem-count"></span>
      </div>
      <div class="mem-grid" id="mem-grid"></div>`;
    $("#memq").addEventListener("input", (e) => { S.memQ = e.target.value; drawMembers(); });
    $("#memclass").addEventListener("change", (e) => { S.memClass = e.target.value; drawMembers(); });
    $("#memrank").addEventListener("change", (e) => { S.memRank = e.target.value; drawMembers(); });
  }
  drawMembers();
}
function drawMembers() {
  const online = new Set(S.online.map((o) => o.id));
  const q = S.memQ.trim().toLowerCase();
  const all = Object.keys(S.profiles);
  const rankNo = (id) => { const i = RANKS.indexOf(prof(id).rank); return i < 0 ? 99 : i; };
  const ids = all.filter((id) => {
    const p = prof(id);
    if (S.memClass && p.mainClass !== S.memClass) return false;
    if (S.memRank && p.rank !== S.memRank) return false;
    if (q && ![p.username, p.mainChar, p.mainRealm, p.mainClass, p.rank, tagFor(id), ...profsOf(id).map((x) => x.prof)].join(" ").toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => (online.has(b) - online.has(a)) || rankNo(a) - rankNo(b) || (userName(a) || "").localeCompare(userName(b) || ""));
  $("#mem-count").textContent = ids.length === all.length ? `${all.length} member${all.length === 1 ? "" : "s"}` : `${ids.length} of ${all.length}`;
  $("#mem-grid").innerHTML = ids.map((id) => {
    const p = prof(id); const profs = profsOf(id);
    const main = p.mainChar ? `${classDot(p.mainClass)}<strong>${esc(p.mainChar)}${p.mainRealm ? " " + esc(p.mainRealm) : ""}</strong>${p.mainLevel || p.mainClass ? ` <span class="muted">${p.mainLevel ? p.mainLevel + " " : ""}${esc(p.mainClass || "")}</span>` : ""}` : `<span class="muted">No main character yet</span>`;
    return `<a class="mcard" href="#member-${esc(id)}">
      <span class="mc-av">${avatarImg(id, 56)}${online.has(id) ? '<span class="online-dot" title="Online now"></span>' : ""}</span>
      <span class="mc-info">
        <span class="mc-name">${esc(p.username || "Member")}${id === S.uid ? ' <span class="muted">(you)</span>' : ""}</span>
        <span class="mc-tags">${rankTag(p)}</span>
        <span class="mc-main">${main}</span>
        ${profs.length ? `<span class="mprofs">${profs.slice(0, 4).map((x) => `<span class="pchip">${esc(x.prof)}${x.skill ? " " + x.skill : ""}</span>`).join("")}</span>` : ""}
      </span></a>`;
  }).join("") || `<div class="empty"><strong>No one matches that.</strong>Try a different search or filter.</div>`;
}

/* ---------- Private messages ---------- */
const dmUnread = () => S.dms.filter((m) => m.to === S.uid && !m.read).length;
function renderDmButton() {
  const b = $("#dm-btn"); if (!b) return;
  b.hidden = !S.uid;
  const n = S.uid ? dmUnread() : 0, c = $("#dm-count");
  c.textContent = n > 9 ? "9+" : n; c.hidden = !n;
  b.setAttribute("aria-label", n ? `Messages, ${n} unread` : "Messages");
  document.querySelectorAll(".admin-only").forEach((el) => { el.hidden = !(S.me && S.me.isAdmin); });
}
function conversations() {
  const map = new Map();
  for (const m of S.dms) {
    const other = m.from === S.uid ? m.to : m.from;
    const c = map.get(other) || { id: other, last: null, unread: 0 };
    if (!c.last || m.t >= c.last.t) c.last = m;
    if (m.to === S.uid && !m.read) c.unread++;
    map.set(other, c);
  }
  return [...map.values()].sort((a, b) => b.last.t - a.last.t);
}
function renderMessages() {
  const root = $("#view-messages");
  if (!S.uid) { root.innerHTML = signInPrompt("send private messages"); return; }
  const w = S.dmWith && S.dmWith !== S.uid && S.profiles[S.dmWith] ? S.dmWith : null;
  const list = conversations();
  if (w && !list.some((c) => c.id === w)) list.unshift({ id: w, last: null, unread: 0 });
  // Opening a conversation marks it read.
  const unreadHere = w ? S.dms.filter((m) => m.from === w && m.to === S.uid && !m.read) : [];
  if (unreadHere.length) { unreadHere.forEach((m) => { m.read = true; }); S.B.markDmsRead(w).catch(() => {}); setTimeout(() => { renderBell(); renderDmButton(); }, 0); }
  const others = Object.keys(S.profiles).filter((id) => id !== S.uid).sort((a, b) => (userName(a) || "").localeCompare(userName(b) || ""));
  const side = `<aside class="dm-side card">
      <label class="muted" for="dm-new">New message to</label>
      <select id="dm-new"><option value="">Choose a member…</option>${others.map((id) => `<option value="${esc(id)}">${esc(userName(id) || "Member")}${prof(id).mainChar ? " · " + esc(prof(id).mainChar) : ""}</option>`).join("")}</select>
      <ul class="dm-convos">${list.map((c) => `<li><a href="#messages-${esc(c.id)}" class="${c.id === w ? "cur" : ""} ${c.unread ? "unread" : ""}">${avatarImg(c.id, 36)}
        <span class="dmc-text"><strong>${esc(userName(c.id) || "Member")}</strong><small>${c.last ? (c.last.from === S.uid ? "You: " : "") + esc(c.last.body.slice(0, 50)) : "New conversation"}</small></span>
        <span class="dmc-meta">${c.last ? `<small class="muted">${ago(c.last.t)}</small>` : ""}${c.unread ? `<span class="badge">${c.unread}</span>` : ""}</span></a></li>`).join("") || `<li class="muted dm-none">No conversations yet.</li>`}</ul>
    </aside>`;
  let main;
  if (!w) main = `<div class="card dm-main empty"><strong>Private messages</strong>Pick a conversation, choose someone above, or press “Send a message” on any member's profile. Only the two of you can read them.</div>`;
  else {
    const msgs = S.dms.filter((m) => (m.from === w && m.to === S.uid) || (m.from === S.uid && m.to === w));
    const p = prof(w);
    main = `<div class="card dm-main">
      <div class="dm-head"><a href="#member-${esc(w)}">${avatarImg(w, 40)}</a><div><a href="#member-${esc(w)}"><strong>${esc(p.username || "Member")}</strong></a> ${rankTag(p)}<div class="muted small">${p.mainChar ? esc(p.mainChar + (p.mainRealm ? " " + p.mainRealm : "")) : ""}${S.online.some((o) => o.id === w) ? ' · <span class="online-dot"></span> online now' : ""}</div></div></div>
      <div class="chat"><div class="chat-log dm-log" aria-live="polite">${msgs.map((m) => `<div class="msg ${m.from === S.uid ? "me" : ""}">${avatarImg(m.from, 26)}
        <div class="msg-b"><div class="msg-meta"><strong>${esc(userName(m.from) || "Someone")}</strong> · ${ago(m.t)}${m.from === S.uid ? ` <button class="linkish small-x" data-act="dm-del" data-id="${esc(m.id)}" aria-label="Delete message">delete</button>` : ""}</div>
        <div class="msg-body">${esc(m.body)}</div></div></div>`).join("") || `<p class="muted chat-empty">Start the conversation with ${esc(p.username || "them")}.</p>`}</div>
      <form class="chat-form dm-form" data-key="dm:${esc(w)}"><input type="text" maxlength="1000" placeholder="Write a private message…" aria-label="Message" autocomplete="off"><button class="btn small primary" type="submit">Send</button></form></div>
    </div>`;
  }
  root.innerHTML = `<div class="map-head"><p class="eyebrow">Bark and Stone · Messages</p><h2 class="hero-title">Messages</h2></div><div class="dm-layout">${side}${main}</div>`;
  const log = root.querySelector(".dm-log"); if (log) log.scrollTop = log.scrollHeight;
}

/* ---------- Admin ---------- */
function renderAdmin() {
  const root = $("#view-admin");
  if (!S.uid) { root.innerHTML = signInPrompt("open the admin page"); return; }
  if (!(S.me && S.me.isAdmin)) { root.innerHTML = `<div class="card empty"><strong>Admins only.</strong>This page is for guild officers. Ask the guildmaster if you need access.</div>`; return; }
  const ids = Object.keys(S.profiles);
  const rankNo = (id) => { const i = RANKS.indexOf(prof(id).rank); return i < 0 ? 99 : i; };
  const openPosts = S.board.filter((b) => b.status === "open" || b.status === "claimed");
  const stat = (n, label) => `<div><span class="num">${fmt(n)}</span><span>${label}</span></div>`;
  const tabs = [["members", "Members & ranks"], ["news", "Guild news"], ["discord", "Discord bot"], ["site", "Announcement & Discord link"], ["mod", "Moderation"]];
  let body = "";
  if (S.adminTab === "discord") {
    const D = S.dc || (S.dc = { loading: true });
    if (D.loading && !D.started) {
      D.started = true;
      Promise.allSettled([S.B.discordBot("status"), S.B.discordConfig(), S.B.discordChannels()]).then(([a, b, c]) => {
        S.dc = { bot: a.status === "fulfilled" ? a.value : null, botErr: a.status === "rejected" ? a.reason.message : "", cfg: b.status === "fulfilled" ? b.value : null, cfgErr: b.status === "rejected" ? b.reason.message : "",
          ch: c.status === "fulfilled" ? c.value : null, chErr: c.status === "rejected" ? c.reason.message : "" };
        if (S.view === "admin" && S.adminTab === "discord") renderAdmin();
      });
    }
    const b = D.bot || {}, c = D.cfg || {}, k = b.configured || {};
    const tick = (ok) => (ok ? '<span class="dc-ok">✓</span>' : '<span class="dc-no">✗</span>');
    const stepCls = (n) => ({ keys: 1, invite: 2, setup: 3, ready: 4 }[b.step] || 1) > n ? "done" : ({ keys: 1, invite: 2, setup: 3, ready: 4 }[b.step] || 1) === n ? "now" : "";
    body = D.loading ? `<div class="empty"><strong>Checking the bot…</strong></div>` : `
      ${D.botErr ? `<p class="dc-err">${esc(D.botErr)}</p>` : ""}${b.error ? `<p class="dc-err">${esc(b.error)}</p>` : ""}${b.warning ? `<p class="dc-err">${esc(b.warning)}</p>` : ""}
      ${b.step === "ready" ? `<p class="dc-ready">✓ <strong>${esc((b.bot || {}).name || "The bot")}</strong> is live in ${b.servers.map((s) => esc(s.name)).join(", ")}. Type <code>/</code> in Discord to use it.</p>` : ""}
      <ol class="dc-steps">
        <li class="${stepCls(1)}"><h4>1. Create the bot on Discord and add its keys to Netlify</h4>
          <p class="muted">In the <a href="https://discord.com/developers/applications" target="_blank" rel="noopener">Discord Developer Portal</a>, make a New Application (e.g. “Bark and Stone”). Then add these to Netlify → Site configuration → Environment variables, and redeploy:</p>
          <ul class="dc-keys"><li>${tick(k.appId)} <code>DISCORD_APP_ID</code> <span class="muted">General Information → Application ID</span></li>
            <li>${tick(k.publicKey)} <code>DISCORD_PUBLIC_KEY</code> <span class="muted">General Information → Public Key</span></li>
            <li>${tick(k.token)} <code>DISCORD_BOT_TOKEN</code> <span class="muted">Bot → Reset Token (keep it secret)</span></li></ul></li>
        <li class="${stepCls(2)}"><h4>2. Invite the bot to the guild's server</h4>
          ${b.inviteUrl ? `<p><a class="btn small" href="${esc(b.inviteUrl)}" target="_blank" rel="noopener">Invite the bot</a> <span class="muted">Pick the Bark and Stone server, then come back and press Check again.</span></p>` : '<p class="muted">Available once the keys are in.</p>'}
          ${(b.servers || []).length ? `<p class="muted">In: ${b.servers.map((s) => `<strong>${esc(s.name)}</strong>${s.commands ? ` (${s.commands} commands)` : ""}`).join(", ")}</p>` : ""}</li>
        <li class="${stepCls(3)}"><h4>3. Set up the slash commands</h4>
          <p><button class="btn small primary" data-act="dc-setup" ${(b.servers || []).length ? "" : "disabled"}>Set up slash commands</button> <span class="muted">Points Discord at the website and adds the commands. Run it again after inviting the bot to another server.</span></p>
          ${(b.done || []).length ? `<ul class="dc-done">${b.done.map((d) => `<li>✓ ${esc(d)}</li>`).join("")}</ul>` : ""}</li>
      </ol>
      <p><button class="btn small" data-act="dc-check">Check again</button></p>
      <details class="dd"><summary>What the bot can do</summary><ul class="dc-cmds">
        <li><code>/whocan</code> who in the guild can craft a recipe (with suggestions as you type)</li>
        <li><code>/board</code> open jobs on the Request Board</li><li><code>/market</code> what's for sale or wanted</li>
        <li><code>/member</code> a member's rank, main character and crafting</li><li><code>/armory</code> a WoW Forever character's level, gear and professions</li>
        <li><code>/news</code> guild news · <code>/wownews</code> WoW Forever headlines · <code>/site</code> links to the website</li>
        <li><code>/price</code> an item's picture, recent prices, trend and market listings · <code>/event</code> plan an event with sign-up buttons · <code>/events</code> what's coming up · <code>/eventchannel</code> where site events are posted · <code>/feedchannel</code> the channel for new market posts, jobs, news, guides and members</li></ul></details>

      <h3 class="sec">Channels</h3>
      ${(() => {
        const ch = D.ch, conf = (ch && ch.config) || {};
        if (D.chErr) return `<p class="dc-err">${esc(D.chErr)}</p>`;
        if (!ch) return `<p class="muted">Loading the server's channels…</p>`;
        const groups = {}; (ch.channels || []).forEach((c) => { (groups[c.group || "Channels"] = groups[c.group || "Channels"] || []).push(c); });
        const opts = (cur) => `<option value="">Not set</option>` + Object.entries(groups).map(([g, list]) => `<optgroup label="${esc(g)}">${list.map((c) => `<option value="${esc(c.id)}" ${cur === c.id ? "selected" : ""}>#${esc(c.name)}</option>`).join("")}</optgroup>`).join("");
        const TZ = [["America/New_York", "Eastern (New York)"], ["America/Chicago", "Central (Chicago)"], ["America/Denver", "Mountain (Denver)"], ["America/Phoenix", "Arizona (Phoenix)"], ["America/Los_Angeles", "Pacific (Los Angeles)"], ["Europe/London", "UK (London)"], ["Europe/Berlin", "Central Europe (Berlin)"], ["Australia/Sydney", "Australia East (Sydney)"]];
        return `<form class="form" id="dcchform" style="margin:0 0 18px">
          <p class="muted" style="margin:0 0 10px">Pick where the bot posts. You don't need to be a Discord admin: the bot posts as itself, so it only needs to be allowed to send messages in those channels.</p>
          <div class="row"><label for="dc-feed">Guild feed</label><select id="dc-feed">${opts(conf.feed_webhook ? "" : conf.feed_channel)}</select></div>
          <p class="muted small" style="margin:-4px 0 10px">New market listings, Request Board jobs, guild news, guides, events and members.${conf.feed_webhook ? " Right now a webhook is used; picking a channel here replaces it." : ""}</p>
          <div class="row"><label for="dc-evch">Events</label><select id="dc-evch">${opts(conf.events_channel)}</select></div>
          <p class="muted small" style="margin:-4px 0 10px">Events planned on the website are posted here with sign-up buttons.</p>
          <div class="row"><label for="dc-tz">Guild time zone</label><select id="dc-tz">${TZ.map(([v, l]) => `<option value="${v}" ${(conf.tz || "America/New_York") === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <p class="muted small" style="margin:-4px 0 10px">Used to read times typed in Discord, like <code>/event when:Sat 8pm</code>.</p>
          <div class="actions"><span class="saved" id="dcch-saved">${esc(D.chMsg || "")}</span><button class="btn primary" type="submit">Save channels</button></div>
        </form>`;
      })()}
      <h3 class="sec">Channel announcements</h3>
      ${D.cfgErr ? `<p class="dc-err">${esc(D.cfgErr)}${/function|schema/i.test(D.cfgErr) ? " (the Discord database update hasn't been run yet)" : ""}</p>` : ""}
      <form class="form" id="dcform" style="margin:0">
        <p class="muted" style="margin:0 0 10px">Posts new market listings, Request Board jobs, guild news, guides, events and members to one Discord channel. Easiest: type <code>/feedchannel</code> in that channel in Discord. (Or make a webhook in the channel settings → Integrations → Webhooks, and paste its link here.)</p>${c.feed_channel ? `<p class="dc-ready" style="margin:0 0 10px">✓ Posting to the channel picked with <code>/feedchannel</code>.</p>` : ""}
        <div class="row"><label for="dc-hook">Webhook link</label><input type="url" id="dc-hook" autocomplete="off" placeholder="${c.webhook_set ? "A webhook is saved. Paste a new one to replace it." : "https://discord.com/api/webhooks/…"}"></div>
        <div class="row"><label>Announce</label><div class="dc-checks">
          <label class="adm-check"><input type="checkbox" id="dc-news" ${c.news !== false ? "checked" : ""}> guild news</label>
          <label class="adm-check"><input type="checkbox" id="dc-board" ${c.board !== false ? "checked" : ""}> Request Board jobs</label>
          <label class="adm-check"><input type="checkbox" id="dc-market" ${c.market !== false ? "checked" : ""}> market listings</label>
          <label class="adm-check"><input type="checkbox" id="dc-guides" ${c.guides !== false ? "checked" : ""}> new guides</label>
          <label class="adm-check"><input type="checkbox" id="dc-events" ${c.events !== false ? "checked" : ""}> new events</label>
          <label class="adm-check"><input type="checkbox" id="dc-members" ${c.members !== false ? "checked" : ""}> new members</label></div></div>
        <div class="actions"><span class="saved" id="dc-saved">${c.webhook_set ? "✓ Webhook saved." : ""}</span>
          ${c.webhook_set ? '<button class="btn small danger" type="button" data-act="dc-hook-clear">Remove webhook</button><button class="btn small" type="button" data-act="dc-test">Send a test message</button>' : ""}
          <button class="btn primary" type="submit">Save</button></div>
      </form>`;
  } else if (S.adminTab === "news") {
    body = `<form class="form" id="newsform" style="margin:0 0 16px">
      <div class="row"><label for="nf-title">Headline</label><input type="text" id="nf-title" maxlength="120" required placeholder="e.g. Raid night this Friday"></div>
      <div class="row"><label for="nf-tag">Label</label><select id="nf-tag">${NEWS_TAGS.map((t) => `<option>${t}</option>`).join("")}</select></div>
      <div class="row"><label for="nf-body">Details</label><textarea id="nf-body" rows="4" maxlength="1500" placeholder="What's happening, when and where."></textarea></div>
      <div class="row"><label for="nf-pin">Pin to top</label><label class="adm-check"><input type="checkbox" id="nf-pin"> keep this first in the feed</label></div>
      <div class="actions"><span class="saved" id="nf-saved"></span><button class="btn primary" type="submit">Post to the news feed</button></div>
    </form>
    <h3 class="sec">Posted (${S.news.length})</h3>
    <ul class="adm-list">${S.news.map((n) => `<li><span><span class="ntag ntag-${esc(n.tag.toLowerCase().replace(/\s+/g, "-"))}">${esc(n.tag)}</span> <strong>${esc(n.title)}</strong> <span class="muted">${newsDate(n.t)}${n.pinned ? " · pinned" : ""}</span></span>
      <span class="adm-btns"><button class="btn small" data-act="adm-news-pin" data-id="${esc(n.id)}">${n.pinned ? "Unpin" : "Pin"}</button><button class="btn small danger" data-act="adm-news-del" data-id="${esc(n.id)}">Delete</button></span></li>`).join("") || '<li class="muted">No posts yet.</li>'}</ul>
    <p class="muted small">Guild news shows on the home page above the picture gallery, for everyone, signed in or not. Pinned posts stay first.</p>`;
  } else if (S.adminTab === "members") {
    const sorted = ids.slice().sort((a, b) => rankNo(a) - rankNo(b) || (userName(a) || "").localeCompare(userName(b) || ""));
    body = `<div class="table-wrap"><table class="adm-table"><thead><tr><th>Member</th><th>Main character</th><th>Joined</th><th>Rank</th><th>Admin</th><th></th></tr></thead><tbody>
      ${sorted.map((id) => { const p = prof(id); const self = id === S.uid; return `<tr>
        <td><a class="adm-mem" href="#member-${esc(id)}">${avatarImg(id, 28)}<strong>${esc(p.username || "Member")}</strong></a>${self ? ' <span class="muted">(you)</span>' : ""}</td>
        <td>${p.mainChar ? `${classDot(p.mainClass)}${esc(p.mainChar + (p.mainRealm ? " " + p.mainRealm : ""))} <span class="muted">${p.mainLevel || ""} ${esc(p.mainClass || "")}</span>` : '<span class="muted">—</span>'}</td>
        <td class="muted num">${p.joined ? new Date(p.joined).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : ""}</td>
        <td><select data-admin-rank="${esc(id)}" aria-label="Rank for ${esc(p.username || "member")}">${p.rank ? "" : `<option value="" selected disabled>—</option>`}${RANKS.map((r) => `<option ${p.rank === r ? "selected" : ""}>${r}</option>`).join("")}</select></td>
        <td><label class="adm-check"><input type="checkbox" data-admin-admin="${esc(id)}" ${p.isAdmin ? "checked" : ""} ${self ? "disabled title=\"You can't remove your own admin access\"" : ""}> admin</label></td>
        <td>${self ? "" : `<a class="btn small" href="#messages-${esc(id)}">Message</a>`}</td></tr>`; }).join("")}
      </tbody></table></div>
      <p class="muted small">Ranks show on member cards and profiles. Admins can open this page, set ranks, post the announcement and remove posts, listings and chat messages. Nobody, admins included, can read other people's private messages.</p>`;
  } else if (S.adminTab === "site") {
    body = `<form class="form" id="adminset" style="margin:0">
      <div class="row"><label for="as-ann">Home page announcement</label><textarea id="as-ann" rows="3" maxlength="500" placeholder="e.g. Guild meeting Saturday 8pm AEST in Ironforge. Leave empty to hide.">${esc(S.settings.announcement || "")}</textarea></div>
      <div class="row"><label for="as-discord">Discord invite link</label><input type="url" id="as-discord" maxlength="200" value="${esc(S.settings.discord_invite || "")}" placeholder="https://discord.gg/…"></div>
      <div class="actions"><span class="saved" id="as-saved"></span><button class="btn primary" type="submit">Save</button></div>
    </form><p class="muted small">The announcement shows at the top of the home page for everyone, signed in or not. The Discord link adds a “Join our Discord” button there.</p>`;
  } else {
    const listItem = (l) => `<li><span><strong>${esc(l.item)}</strong> ×${l.qty} · ${gold(l.price)} <span class="muted">by ${esc(l.char)} (${memberLink(l.seller)}) · ${ago(l.created)}</span></span><button class="btn small danger" data-act="adm-listing-del" data-id="${esc(l.id)}">Remove</button></li>`;
    const postItem = (b) => `<li><span><strong>${esc(b.title)}</strong> ×${b.qty} <span class="muted">${esc(b.status)} · by ${esc(b.authorChar || "?")} (${memberLink(b.author)}) · ${ago(b.created)}</span></span><button class="btn small danger" data-act="adm-post-del" data-id="${esc(b.id)}">Remove</button></li>`;
    const msgItem = (m) => `<li><span>“${esc(m.body.slice(0, 140))}” <span class="muted">${memberLink(m.author)} on a board post · ${ago(m.t)}</span></span><button class="btn small danger" data-act="msg-del" data-id="${esc(m.id)}">Delete</button></li>`;
    body = `<h3 class="sec">Request Board (${S.board.length})</h3><ul class="adm-list">${S.board.slice().sort((a, b) => b.created - a.created).map(postItem).join("") || '<li class="muted">Nothing posted.</li>'}</ul>
      <h3 class="sec">Market listings (${S.listings.length})</h3><ul class="adm-list">${S.listings.slice().sort((a, b) => b.created - a.created).map(listItem).join("") || '<li class="muted">No listings.</li>'}</ul>
      <h3 class="sec">Recent chat on the Request Board</h3><ul class="adm-list">${S.messages.filter((m) => m.type === "board").slice(-60).reverse().map(msgItem).join("") || '<li class="muted">No messages.</li>'}</ul>
      <p class="muted small">Chat on private crafting requests and private messages are only visible to the people in them.</p>`;
  }
  root.innerHTML = `
    <div class="map-head"><p class="eyebrow">Bark and Stone · Officers</p><h2 class="hero-title">Admin</h2></div>
    <div class="home-stats adm-stats">${stat(ids.length, "members")}${stat(ids.filter((id) => prof(id).isAdmin).length, "admins")}${stat(S.online.length, "online now")}${stat(openPosts.length, "open board jobs")}${stat(S.listings.length, "market listings")}</div>
    <div class="chips adm-tabs">${tabs.map(([k, l]) => `<button class="chip" data-act="adm-tab" data-t="${k}" aria-pressed="${S.adminTab === k}">${l}</button>`).join("")}</div>
    <div class="card adm-body">${body}</div>`;
}

/* ---------- Armory: the member's WoW Forever character, from Blizzard ---------- */
const ARM = {};
const armorySlug = (p) => (p.mainChar && p.mainRealm ? `${p.mainChar}-${p.mainRealm}`.trim().toLowerCase().replace(/\s+/g, "-") : "");
const QUAL = { poor: 0, common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, artifact: 5, heirloom: 5 };
const GEAR_L = ["HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "SHIRT", "TABARD", "WRIST"];
const GEAR_R = ["HANDS", "WAIST", "LEGS", "FEET", "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2"];
const GEAR_W = ["MAIN_HAND", "OFF_HAND", "RANGED"];
function loadArmory(slug) {
  if (ARM[slug]) return ARM[slug];
  ARM[slug] = { state: "loading" };
  fetch("/.netlify/functions/armory?c=" + encodeURIComponent(slug))
    .then(async (r) => { const d = await r.json().catch(() => ({})); ARM[slug] = r.ok ? { state: "ok", d } : { state: "err", msg: d.error || "The Armory didn't answer." }; })
    .catch(() => { ARM[slug] = { state: "err", msg: "The Armory only loads on the live site." }; })
    .then(() => { if (S.view === "profile") { renderProfile(); refreshWowhead(); } });
  return ARM[slug];
}
function armoryCard(uid, mine) {
  const p = prof(uid); const slug = armorySlug(p);
  if (!slug) return mine ? `<div class="card armory-empty"><h2>Your Armory</h2><p class="muted">Add your main character and their <strong>surname</strong> (or paste your Armory link) below, then save. Your gear, stats, talents and professions will show here for the guild.</p></div>` : "";
  const a = loadArmory(slug);
  if (a.state === "loading") return `<div class="card armory"><div class="empty"><strong>Opening the Armory…</strong></div></div>`;
  if (a.state === "err") return `<div class="card armory"><h2>Armory</h2><p class="muted">${esc(a.msg)}</p>${mine ? `<p class="muted">Looking for <strong>${esc(slug)}</strong>. Check the name and surname on your profile match the game.</p>` : ""}</div>`;
  const d = a.d; const bySlot = Object.fromEntries(d.gear.map((g) => [g.slot, g]));
  const slot = (k, side) => { const g = bySlot[k]; if (!g) return `<li class="gs empty ${side}"><span class="muted">${esc(k.replace(/_\d/, "").replace("_", " ").toLowerCase())}</span></li>`;
    return `<li class="gs ${side}"><a class="q${QUAL[g.q] ?? 1}" href="https://www.wowhead.com/forever/item=${g.id}" target="_blank" rel="noopener">${esc(g.name)}</a><span class="muted num">${g.ilvl ? "ilvl " + g.ilvl : ""}${g.enchant ? " · " + esc(g.enchant.replace(/^Enchanted: /, "")) : ""}</span></li>`; };
  const s = d.stats || {};
  const statRow = (l, v, suf = "") => (v || v === 0) && v !== null ? `<div><dt>${l}</dt><dd>${typeof v === "number" ? v.toLocaleString() : esc(v)}${suf}</dd></div>` : "";
  const specLine = d.specs.length ? d.specs.map((x) => x.points).join(" / ") : "";
  const topSpec = [...d.specs].sort((x, y) => y.points - x.points)[0];
  const seen = d.lastLogin ? ago(d.lastLogin) : "";
  return `<div class="card armory">
    <div class="arm-head">
      ${d.avatar ? `<img class="arm-av" src="${esc(d.avatar)}" alt="" width="60" height="60" loading="lazy">` : ""}
      <div><h2>${esc(d.name)} ${esc(d.surname)}</h2>
        <div class="sub">${d.title && d.title !== d.name ? esc(d.title) + " · " : ""}Level ${d.level} ${esc(d.race)} <span class="cls-${esc(d.cls.toLowerCase())}">${esc(d.cls)}</span>${topSpec && topSpec.points ? ` · ${esc(topSpec.name)}` : ""}</div>
        <div class="sub">${d.guild ? `&lt;${esc(d.guild)}&gt; · ` : ""}${esc(d.faction)}${seen ? ` · last seen ${seen}` : ""}</div></div>
      ${d.ilvl ? `<div class="arm-ilvl"><strong>${d.ilvl}</strong><span>item level</span></div>` : ""}
    </div>
    <div class="arm-body">
      <ul class="gear">${GEAR_L.map((k) => slot(k, "l")).join("")}</ul>
      <div class="arm-render">${d.render ? `<img src="${esc(d.render)}" alt="${esc(d.name)} in their current gear" loading="lazy">` : ""}</div>
      <ul class="gear">${GEAR_R.map((k) => slot(k, "r")).join("")}</ul>
      <ul class="gear weapons">${GEAR_W.filter((k) => bySlot[k]).map((k) => slot(k, "w")).join("")}</ul>
    </div>
    <div class="arm-grid">
      ${d.stats ? `<section><h3>Stats</h3><dl class="arm-stats">
        ${statRow("Health", s.health)}${statRow(s.powerType || "Power", s.power)}
        ${statRow("Strength", s.strength)}${statRow("Agility", s.agility)}${statRow("Stamina", s.stamina)}${statRow("Intellect", s.intellect)}${statRow("Spirit", s.spirit)}
        ${statRow("Armor", s.armor)}${statRow("Attack power", s.attackPower)}${s.spellPower ? statRow("Spell power", s.spellPower) : ""}
        ${statRow("Crit", s.crit, "%")}${s.spellCrit && s.spellCrit !== s.crit ? statRow("Spell crit", s.spellCrit, "%") : ""}${statRow("Dodge", s.dodge, "%")}${s.parry ? statRow("Parry", s.parry, "%") : ""}${s.block ? statRow("Block", s.block, "%") : ""}
      </dl></section>` : ""}
      ${d.specs.length ? `<section><h3>Talents <span class="muted num">${specLine}</span></h3>${d.specs.map((x) => `<details class="dd"><summary>${esc(x.name)} <span class="muted num">${x.points} points</span></summary>
        <ul class="talents">${x.talents.map((t) => `<li><a href="https://www.wowhead.com/forever/spell=${t.spell}" target="_blank" rel="noopener">${esc(t.name)}</a> <span class="muted num">${t.rank}</span></li>`).join("")}</ul></details>`).join("")}</section>` : ""}
      ${d.professions.length ? `<section><h3>Professions</h3><ul class="arm-profs">${d.professions.map((x) => `<li><span>${esc(x.name)}</span><span class="num muted">${x.skill} / ${x.max}</span>
        <span class="pbar"><i style="width:${x.max ? Math.round((x.skill / x.max) * 100) : 0}%"></i></span></li>`).join("")}</ul></section>` : ""}
      ${d.pets.length ? `<section><h3>Hunter pets</h3><ul class="arm-list">${d.pets.map((x) => `<li><span>${esc(x.name)}${x.active ? ' <span class="tag">active</span>' : ""}</span><span class="muted">Level ${x.level} ${esc(x.creature)}</span></li>`).join("")}</ul></section>` : ""}
      ${d.pvp ? `<section><h3>Player vs player</h3><dl class="arm-stats">${statRow("Honorable kills", d.pvp.kills)}${statRow("Rank", d.pvp.rank)}</dl></section>` : ""}
      ${d.reputations.length ? `<section><h3>Reputation</h3><details class="dd"><summary>${d.reputations.length} factions</summary><ul class="arm-reps">${d.reputations.map((r) => `<li><span>${esc(r.name)}</span><span class="rep rep-${r.tier ?? 3}">${esc(r.standing)}</span>
        <span class="pbar"><i style="width:${r.max ? Math.round((r.value / r.max) * 100) : 100}%"></i></span></li>`).join("")}</ul></details></section>` : ""}
    </div>
    <p class="muted arm-foot">From Blizzard's Armory, refreshed every half hour or so. <a href="${esc(d.armory)}" target="_blank" rel="noopener">See ${esc(d.name)} on the official Armory</a>.</p>
  </div>`;
}

/* ---------- Public request board ---------- */
const CATS = { craft: "Craft", item: "Find an item", gather: "Gather", help: "Help" };
function renderBoard() {
  const root = $("#view-board");
  if (!S.uid) { root.innerHTML = signInPrompt("use the Request Board"); return; }
  const tabs = [["open", "Open"], ["claimed", "Taken"], ["done", "Done"], ["mine", "Mine"]];
  const list = S.board.filter((b) => {
    if (S.boardCat && b.category !== S.boardCat) return false;
    if (S.boardTab === "mine") return b.author === S.uid || b.claimer === S.uid;
    return b.status === S.boardTab;
  }).sort((a, b) => b.created - a.created);
  const counts = { open: S.board.filter((b) => b.status === "open").length, claimed: S.board.filter((b) => b.status === "claimed").length };
  const recipeNames = DATA_OK ? [...new Set(RECIPES.map((r) => r.name))].sort() : [];

  const card = (b) => {
    const rec = b.recipeId && BYID.get(b.recipeId);
    const crafters = rec ? (INDEX.get(rec.id) || []) : [];
    const canMake = crafters.some((c) => c.uid === S.uid);
    const mine = b.author === S.uid, took = b.claimer === S.uid, admin = S.me && S.me.isAdmin;
    let acts = [];
    if (b.status === "open" && !mine) acts.push(["claim", "I'll do it", "primary"]);
    if (b.status === "claimed" && took) acts.push(["done", "Mark done", "primary"], ["release", "Give it back", ""]);
    if (mine && b.status === "open") acts.push(["cancel", "Cancel", ""]);
    if (mine && b.status === "claimed") acts.push(["done", "Mark done", "primary"], ["reopen", "Reopen", ""]);
    if ((mine || admin) && (b.status === "done" || b.status === "cancelled")) acts.push(["delete", "Remove", "danger"]);
    if (admin && !mine && b.status !== "done" && b.status !== "cancelled") acts.push(["delete", "Remove", "danger"]);
    const statusLabel = { open: "open", claimed: "taken", done: "done", cancelled: "cancelled" }[b.status];
    return `<article class="post ${b.status}">
      <div class="post-main">
        <div class="post-top"><span class="tag cat-${esc(b.category)}">${esc(CATS[b.category] || b.category)}</span><span class="pill st-${b.status === "claimed" ? "accepted" : b.status === "open" ? "pending" : esc(b.status)}">${statusLabel}</span>${canMake && b.status === "open" ? '<span class="tag can">You can craft this</span>' : ""}</div>
        <h3 class="post-title">${rec ? `<a class="q${rec.q}" href="#recipe-${rec.id}">${esc(b.title)}</a>` : esc(b.title)} <span class="num muted">×${b.qty}</span></h3>
        ${b.note ? `<p class="post-note">${esc(b.note)}</p>` : ""}
        <div class="meta">Posted by <strong>${esc(b.authorChar || "?")}</strong> (${memberLink(b.author)}) · ${ago(b.created)} · Offer ${gold(b.offer)}${rec ? ` · ${crafters.length} guild crafter${crafters.length === 1 ? "" : "s"} know this` : ""}</div>
        ${b.claimer ? `<div class="meta">${b.status === "done" ? "Done by" : "Taken by"} <strong>${esc(b.claimerChar || "?")}</strong> (${memberLink(b.claimer)})${b.claimed ? " · " + ago(b.claimed) : ""}</div>` : ""}
      </div>
      <div class="acts">${chatToggle("board", b.id)}${acts.map((a) => `<button class="btn small ${a[2]}" data-act="post" data-op="${a[0]}" data-id="${esc(b.id)}">${a[1]}</button>`).join("")}</div>
      ${chatBox("board", b.id) ? `<div class="req-chat">${chatBox("board", b.id)}</div>` : ""}
    </article>`;
  };

  root.innerHTML = `
    <div class="map-head board-head"><div><p class="eyebrow">Bark and Stone · Request Board</p><h2 class="hero-title">Request Board</h2>
      <p class="muted map-intro">Post what you need and anyone in the guild can take the job. Crafts, items, materials or a hand with something.</p></div>
      <button class="btn primary" data-act="post-toggle">${S.postOpen ? "Close" : "Post a request"}</button></div>
    ${S.postOpen ? `<form class="form postform" id="boardform">
      <div class="row"><label for="bf-cat">What kind</label><select id="bf-cat">${Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
      <div class="row"><label for="bf-title">What you need</label><input type="text" id="bf-title" list="recipelist" maxlength="80" required placeholder="e.g. Elixir of Lion's Strength, 10 Copper Bars, help with a quest"></div>
      <div class="row"><label for="bf-qty">Quantity</label><input type="number" id="bf-qty" min="1" max="9999" value="1"></div>
      <div class="row"><label for="bf-offer-g">Offer</label>${coinInput("bf-offer", 0, "Offer")}</div>
      <div class="row"><label for="bf-char">Your character</label><input type="text" id="bf-char" maxlength="24" value="${esc(defaultChar() || prof(S.uid).mainChar || "")}" required></div>
      <div class="row"><label for="bf-note">Details</label><textarea id="bf-note" rows="2" maxlength="300" placeholder="I'll bring the mats, need it by Friday raid, etc."></textarea></div>
      <div class="actions"><button class="btn primary" type="submit">Post to the board</button></div>
      <datalist id="recipelist">${recipeNames.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
    </form>` : ""}
    <div class="filters">
      <div class="chips">${tabs.map(([k, l]) => `<button class="chip" data-act="board-tab" data-t="${k}" aria-pressed="${S.boardTab === k}">${l}${counts[k] != null ? `<span class="n">${counts[k]}</span>` : ""}</button>`).join("")}</div>
      <div class="chips"><button class="chip" data-act="board-cat" data-c="" aria-pressed="${!S.boardCat}">All kinds</button>${Object.entries(CATS).map(([k, v]) => `<button class="chip" data-act="board-cat" data-c="${k}" aria-pressed="${S.boardCat === k}">${v}</button>`).join("")}</div>
    </div>
    <div class="posts">${list.map(card).join("") || `<div class="card empty"><strong>${S.boardTab === "open" ? "No open requests right now." : "Nothing here yet."}</strong>${S.boardTab === "open" ? "Post one, and the whole guild will see it." : ""}</div>`}</div>`;
}

/* ---------- Notifications ---------- */
function seenAt() { return Math.max(S.seenOverride, (prof(S.uid).notifSeen) || 0); }
function notifications() {
  if (!S.uid) return [];
  const out = [];
  const label = (r) => (r.kind === "craft" && BYID.get(r.recipeId) ? BYID.get(r.recipeId).name : r.label || "an item");
  for (const r of S.requests) {
    if (r.to === S.uid && r.status === "pending") out.push({ t: r.created, text: `<strong>${esc(r.fromChar || userName(r.from))}</strong> asked you for ${esc(label(r))} ×${r.qty}`, href: "#requests" });
    if (r.to === S.uid && r.status === "cancelled") out.push({ t: r.updated || r.created, text: `<strong>${esc(r.fromChar || userName(r.from))}</strong> cancelled their request for ${esc(label(r))}`, href: "#requests" });
    if (r.from === S.uid && r.status !== "pending" && r.status !== "cancelled") out.push({ t: r.updated || r.created, text: `<strong>${esc(r.toChar || userName(r.to))}</strong> marked your request for ${esc(label(r))} as ${esc(r.status)}`, href: "#requests" });
  }
  for (const b of S.board) {
    if (b.author === S.uid && b.claimer && b.claimer !== S.uid && (b.status === "claimed" || b.status === "done"))
      out.push({ t: b.updated, text: `<strong>${esc(b.claimerChar || userName(b.claimer))}</strong> ${b.status === "done" ? "finished" : "took"} your board request: ${esc(b.title)}`, href: "#board" });
    if (b.author !== S.uid && b.status === "open")
      out.push({ t: b.created, text: `New on the board from <strong>${esc(b.authorChar || userName(b.author))}</strong>: ${esc(b.title)}`, href: "#board" });
    if (b.author !== S.uid && b.claimer === S.uid && b.status === "cancelled")
      out.push({ t: b.updated, text: `A job you took was cancelled: ${esc(b.title)}`, href: "#board" });
  }
  // Chat messages from others in threads I'm part of (my requests, and board posts I posted, took or wrote in).
  const mineBoard = new Set(S.board.filter((b) => b.author === S.uid || b.claimer === S.uid).map((b) => b.id));
  S.messages.forEach((m) => { if (m.type === "board" && m.author === S.uid) mineBoard.add(m.thread); });
  for (const m of S.messages) {
    if (m.author === S.uid) continue;
    if (m.type === "request") { const r = S.requests.find((x) => x.id === m.thread); if (r) out.push({ t: m.t, text: `<strong>${esc(userName(m.author))}</strong> messaged you about ${esc(label(r))}: “${esc(m.body.slice(0, 60))}”`, href: "#requests" }); }
    else if (mineBoard.has(m.thread)) { const b = S.board.find((x) => x.id === m.thread); if (b) out.push({ t: m.t, text: `<strong>${esc(userName(m.author))}</strong> on “${esc(b.title)}”: “${esc(m.body.slice(0, 60))}”`, href: "#board" }); }
  }
  for (const m of S.dms) if (m.to === S.uid) out.push({ t: m.t, text: `<strong>${esc(userName(m.from) || "Someone")}</strong> sent you a message: “${esc(m.body.slice(0, 60))}”`, href: "#messages-" + m.from });
  // Guild events: new ones planned by others, and ones you're going to that start within 3 hours.
  for (const ev of upcomingEvents()) {
    if (ev.createdBy !== S.uid) out.push({ t: ev.t, text: `New event: <strong>${esc(ev.title)}</strong> on ${esc(evWhen(ev.starts))}`, href: "#event-" + ev.id });
    const me = mySignup(ev);
    if (me && me.status === "yes" && ev.starts - Date.now() < 3 * 3600000) out.push({ t: ev.starts - 3 * 3600000, text: `Starting ${evUntil(ev.starts)}: <strong>${esc(ev.title)}</strong>`, href: "#event-" + ev.id });
  }
  out.push(...alertNotifications());
  const seen = seenAt();
  return out.filter((n) => n.t).sort((a, b) => b.t - a.t).slice(0, 40).map((n) => ({ ...n, unread: n.t > seen }));
}
function renderBell() {
  const bell = $("#bell"); if (!bell) return;
  bell.hidden = !S.uid;
  if (!S.uid) { $("#notif-panel").hidden = true; return; }
  const list = notifications();
  const unread = list.filter((n) => n.unread).length;
  const badge = $("#bell-count"); badge.textContent = unread > 9 ? "9+" : unread; badge.hidden = !unread;
  bell.setAttribute("aria-label", unread ? `Notifications, ${unread} new` : "Notifications");
  const panel = $("#notif-panel");
  panel.hidden = !S.notifOpen;
  if (S.notifOpen) panel.innerHTML = `
    <div class="np-head"><strong>Notifications</strong>${unread ? `<button class="linkish" data-act="notif-read">Mark all read</button>` : ""}</div>
    ${list.length ? `<ul class="np-list">${list.map((n) => `<li class="${n.unread ? "unread" : ""}"><a href="${n.href}" data-act="notif-go">${n.text}<span class="np-time">${ago(n.t)}</span></a></li>`).join("")}</ul>`
      : `<p class="muted np-empty">Nothing yet. Requests, board jobs and replies will show up here.</p>`}`;
}
async function markRead() {
  S.seenOverride = Date.now(); renderBell();
  try { await S.B.markNotifsSeen(); } catch {}
}

/* ---------- sign-in dialog ---------- */
function openAuth(tab) {
  S.authTab = tab || "in";
  document.querySelectorAll('[data-act="auth-tab"]').forEach((b) => b.setAttribute("aria-pressed", b.dataset.t === S.authTab));
  $("#f-user").hidden = S.authTab !== "up";
  $("#f-pass").hidden = S.authTab === "reset";
  $("#a-pass").autocomplete = S.authTab === "up" ? "new-password" : "current-password";
  $("#a-go").textContent = S.authTab === "up" ? "Create account" : S.authTab === "reset" ? "Email me a reset link" : "Sign in";
  $("#a-err").textContent = ""; $("#a-err").className = "err";
  $("#auth").hidden = false;
  (S.authTab === "up" ? $("#a-user") : $("#a-email")).focus();
}

/* ---------- events ---------- */
document.addEventListener("click", async (e) => {
  // Menu groups: tap to open (hover also opens on desktop), tap elsewhere to close.
  const nb = e.target.closest(".navbtn");
  document.querySelectorAll("nav.tabs .navgrp.open").forEach((g) => { if (!nb || g !== nb.parentElement) { g.classList.remove("open"); g.querySelector(".navbtn").setAttribute("aria-expanded", "false"); } });
  if (nb) { const g = nb.parentElement; const open = !g.classList.contains("open"); g.classList.toggle("open", open); nb.setAttribute("aria-expanded", String(open)); return; }
  // Chronicle: jump to a section, or open a raid's loot.
  const jump = e.target.closest("[data-chron]");
  if (jump) {
    const el = document.getElementById(jump.dataset.chron);
    if (el) { const top = el.getBoundingClientRect().top + window.scrollY - (document.querySelector(".top").offsetHeight || 0) - 12; window.scrollTo(0, Math.max(0, top)); }
    return;
  }
  const lz = e.target.closest("[data-lootzone]");
  if (lz) { if (window.GC_LOOT) window.GC_LOOT.openZone(Number(lz.dataset.lootzone)); return; }
  const ls = e.target.closest("[data-lootsearch]");
  if (ls) { if (window.GC_LOOT) window.GC_LOOT.openSearch(ls.dataset.lootsearch); return; }
  if (S.notifOpen && !e.target.closest("#notif-panel,#bell")) { S.notifOpen = false; renderBell(); }
  if (S.onlineOpen && !e.target.closest("#online-panel,#online-btn")) { S.onlineOpen = false; renderOnline(); }
  const t = e.target.closest("[data-act],[data-recipe],[data-prof]");
  if (!t) { if (e.target.id === "auth") $("#auth").hidden = true; return; }
  if (t.dataset.recipe) { S.sel = Number(t.dataset.recipe); S.reqFor = null; history.replaceState(null, "", "#recipe-" + S.sel); renderRecipes(); return; }
  if (t.dataset.prof !== undefined && !t.dataset.act) { S.prof = Number(t.dataset.prof); S.limit = 150; renderRecipes(); return; }
  const act = t.dataset.act;
  if (act === "signin") openAuth("in");
  else if (act === "signup") openAuth("up");
  else if (act === "bell") { S.notifOpen = !S.notifOpen; S.onlineOpen = false; renderBell(); renderOnline(); }
  else if (t.dataset.mapfind !== undefined || act === "mapfind") { if (window.GC_MAP) window.GC_MAP.show(t.dataset.mapfind); }
  else if (act === "online") { S.onlineOpen = !S.onlineOpen; S.notifOpen = false; renderOnline(); renderBell(); }
  else if (act === "chat") {
    const k = t.dataset.key; S.chatOpen.has(k) ? S.chatOpen.delete(k) : S.chatOpen.add(k);
    if (S.view === "board") renderBoard(); else renderRequests();
    scrollChats();
    const f = document.querySelector(`.chat-form[data-key="${k}"] input`); if (f) f.focus();
  }
  else if (act === "dm-del") { t.disabled = true; try { await S.B.deleteDm(t.dataset.id); await refresh(); } catch (err) { note("Couldn't delete that message: " + err.message); } }
  else if (act === "adm-tab") { S.adminTab = t.dataset.t; renderAdmin(); }
  else if (act === "dc-check") { S.dc = null; renderAdmin(); }
  else if (act === "dc-setup") {
    t.disabled = true; t.textContent = "Setting up…";
    try { const r = await S.B.discordBot("setup"); S.dc = { ...(S.dc || {}), bot: r, botErr: "" }; }
    catch (err) { S.dc = { ...(S.dc || {}), botErr: err.message }; }
    renderAdmin();
  }
  else if (act === "dc-test") {
    t.disabled = true; const s = $("#dc-saved");
    try { await S.B.discordTest(); if (s) s.textContent = "Test sent. Check the Discord channel."; } catch (err) { if (s) s.textContent = "Couldn't send: " + err.message; }
    t.disabled = false;
  }
  else if (act === "dc-hook-clear") {
    if (!confirm("Stop posting to the Discord channel?")) return;
    try { await S.B.discordConfigSet("", null, null, null); S.dc = { ...(S.dc || {}), cfg: await S.B.discordConfig() }; renderAdmin(); } catch (err) { note(err.message); }
  }
  else if (act === "news-more") { S.newsAll = !S.newsAll; renderNews(); }
  else if (act === "adm-news-pin" || act === "adm-news-del") {
    const n = S.news.find((x) => x.id === t.dataset.id); if (!n) return;
    if (act === "adm-news-del" && !confirm(`Delete “${n.title}” from the news feed?`)) return;
    t.disabled = true;
    try { act === "adm-news-del" ? await S.B.deleteNews(n.id) : await S.B.updateNews(n.id, { pinned: !n.pinned }); S.news = await S.B.loadNews(); renderNews(); renderAdmin(); }
    catch (err) { note("Couldn't change that post: " + err.message); t.disabled = false; }
  }
  else if (act === "adm-post-del" || act === "adm-listing-del") {
    if (!confirm("Remove this for everyone?")) return;
    t.disabled = true;
    try { act === "adm-post-del" ? await S.B.deletePost(t.dataset.id) : await S.B.deleteListing(t.dataset.id); await refresh(); }
    catch (err) { note("Couldn't remove that: " + err.message); t.disabled = false; }
  }
  else if (act === "msg-del") { t.disabled = true; try { await S.B.deleteMessage(t.dataset.id); await refresh(); } catch (err) { note("Couldn't delete that message: " + err.message); } }
  else if (act === "avatar-remove") { try { await S.B.removeAvatar(); (S.profiles[S.uid] || {}).avatar = ""; renderProfile(); renderWho(); syncPresence(); } catch (err) { note(err.message); } }
  else if (act === "discord") { try { await S.B.signInWithDiscord(); } catch (err) { $("#a-err").textContent = err.message; } }
  else if (act === "notif-read") markRead();
  else if (act === "notif-go") { S.notifOpen = false; markRead(); }
  else if (act === "post-toggle") { S.postOpen = !S.postOpen; renderBoard(); if (S.postOpen) $("#bf-title").focus(); }
  else if (act === "board-tab") { S.boardTab = t.dataset.t; renderBoard(); }
  else if (act === "board-cat") { S.boardCat = t.dataset.c; renderBoard(); }
  else if (act === "post") {
    const op = t.dataset.op, id = t.dataset.id;
    if (op === "delete" && t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to remove"; return; }
    let fields = null;
    if (op === "claim") {
      const ch = defaultChar() || prof(S.uid).mainChar;
      if (!ch) { note("Set your main character on your profile (or add one on My crafter) first, so the poster knows who's helping."); return; }
      fields = { status: "claimed", claimer: S.uid, claimerChar: ch };
    } else if (op === "done") fields = { status: "done" };
    else if (op === "release" || op === "reopen") fields = { status: "open" };
    else if (op === "cancel") fields = { status: "cancelled" };
    t.disabled = true;
    try { op === "delete" ? await S.B.deletePost(id) : await S.B.updatePost(id, fields); await refresh(); }
    catch (err) { note(err.message.includes("already taken") ? "Someone else took that job first." : "Couldn't update that post: " + err.message); t.disabled = false; refresh(); }
  }
  else if (act === "auth-tab") openAuth(t.dataset.t);
  else if (act === "auth-close") $("#auth").hidden = true;
  else if (act === "signout") { try { await S.B.signOut(); } catch {} await loadMe(); refresh(); }
  else if (act === "link-bnet") { t.disabled = true; t.textContent = "Opening Battle.net…"; try { await S.B.linkBnet(); } catch (err) { note(err.message); t.disabled = false; t.textContent = "Link Battle.net account"; } }
  else if (act === "unlink-bnet") {
    if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to unlink"; return; }
    try { await S.B.unlinkBnet(); delete S.bnet[S.uid]; renderMine(); } catch (err) { note("Couldn't unlink: " + err.message); }
  }
  else if (act === "import-char") {
    const c = ((S.bnet[S.uid] || {}).characters || [])[Number(t.dataset.i)]; if (!c) return;
    const d = ensureMyDoc(); const name = String(c.name).slice(0, 24);
    if (!d.chars[name]) d.chars[name] = { profs: {}, realm: c.realm || "", level: c.level || 0, cls: c.cls || "" };
    S.editChar = name; lsSet("gc.editChar", name); if (!lsGet("gc.char")) lsSet("gc.char", name);
    queueSave(); renderMine();
  }
  else if (act === "more") { S.limit += 300; renderRecipes(); }
  else if (act === "close-sheet") { S.sel = null; S.reqFor = null; history.replaceState(null, "", "#recipes"); renderRecipes(); }
  else if (act === "ask") { const x = $("#sheet")._crafters[Number(t.dataset.i)]; S.reqFor = { uid: x.uid, char: x.char }; renderSheet(); const f = $("#rf-char"); if (f) (f.value ? $("#rf-note") : f).focus(); }
  else if (act === "cancel-ask") { S.reqFor = null; renderSheet(); }
  else if (act === "pick-char") { S.editChar = t.dataset.char; lsSet("gc.editChar", S.editChar); S.editProf = null; S.mineQ = ""; renderMine(); }
  else if (act === "pick-prof") { S.editProf = t.dataset.prof; S.mineQ = ""; renderMine(); }
  else if (act === "remove-char" || act === "remove-prof") {
    if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to remove"; return; }
    const d = ensureMyDoc();
    if (act === "remove-char") { delete d.chars[S.editChar]; S.editChar = null; } else { delete d.chars[S.editChar].profs[S.editProf]; S.editProf = null; }
    queueSave(); renderMine();
  }
  else if (act === "mark-trainer" || act === "clear-prof") {
    const p = ensureMyDoc().chars[S.editChar].profs[S.editProf]; const pi = profIndex(S.editProf);
    if (act === "clear-prof") p.known = [];
    else { const set = new Set(p.known || []); RECIPES.forEach((r) => { if (r.p === pi && isTrainer(r) && r.lv <= (p.skill || 0)) set.add(r.id); }); p.known = [...set]; }
    queueSave(); renderMine();
  }
  else if (act === "reqtab") { S.reqTab = t.dataset.t; renderRequests(); }
  else if (act === "req") {
    t.disabled = true;
    try {
      if (t.dataset.st === "delete") await S.B.deleteRequest(t.dataset.id);
      else await S.B.setRequestStatus(t.dataset.id, t.dataset.st);
      await refresh();
    } catch (err) { note("Couldn't update that request: " + err.message); t.disabled = false; }
  }
  else if (act === "mtype") { S.mtype = t.dataset.t; renderMarket(); }
  else if (act === "mk-post") { const f = $("#postform"); f.hidden = !f.hidden; if (!f.hidden) $("#pf-item").focus(); }
  else if (act === "mk-type") { $("#pf-type").value = t.dataset.t; document.querySelectorAll('[data-act="mk-type"]').forEach((b) => b.setAttribute("aria-pressed", String(b === t))); }
  else if (act === "unlist") { t.disabled = true; try { await S.B.deleteListing(t.dataset.id); await refresh(); } catch (err) { note("Couldn't remove that listing: " + err.message); t.disabled = false; } }
  else if (act === "deal") {
    const l = S.listings.find((x) => x.id === t.dataset.id); if (!l) return;
    const ch = defaultChar() || ($("#pf-char") && $("#pf-char").value.trim());
    if (!ch) { note("Type your character name in the Character box first, or add it on My crafter."); return; }
    t.disabled = true;
    try {
      await S.B.createRequest({ kind: l.type === "B" ? "sell" : "buy", listingId: l.id, label: l.item, qty: l.qty || 1, tip: (l.price || 0) * (l.qty || 1), note: "", fromChar: ch, to: l.seller, toChar: l.char || "" });
      t.textContent = "Request sent"; refresh();
    } catch (err) { note("Couldn't send the request: " + err.message); t.disabled = false; }
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches("tr[data-recipe]")) e.target.click();
  if (e.key === "Escape") {
    const openGrp = document.querySelector("nav.tabs .navgrp.open");
    if (openGrp) { openGrp.classList.remove("open"); const b = openGrp.querySelector(".navbtn"); b.setAttribute("aria-expanded", "false"); b.focus(); return; }
    if (!$("#auth").hidden) { $("#auth").hidden = true; return; }
    if (S.sel && S.view === "recipes") { S.sel = null; S.reqFor = null; renderRecipes(); }
  }
});

document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('[type="submit"]');
  if (f.id === "authform") {
    const email = $("#a-email").value.trim(), password = $("#a-pass").value, username = $("#a-user").value.trim();
    const err = $("#a-err"); err.className = "err"; err.textContent = "";
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = "Enter the email address for your account."; return; }
    if (S.authTab !== "reset" && password.length < 8) { err.textContent = "Passwords need at least 8 characters."; return; }
    if (S.authTab === "up" && !USERNAME_RE.test(username)) { err.textContent = "Usernames use 3–24 letters, numbers or _."; return; }
    btn.disabled = true;
    try {
      if (S.authTab === "in") { await S.B.signIn({ email, password }); $("#auth").hidden = true; }
      else if (S.authTab === "up") {
        const r = await S.B.signUp({ email, password, username });
        if (r.needsConfirm) { err.className = "ok"; err.textContent = "Check your email and click the link to finish creating your account."; }
        else $("#auth").hidden = true;
      } else { await S.B.resetPassword(email); err.className = "ok"; err.textContent = "If that email has an account, a reset link is on its way."; }
      $("#a-pass").value = "";
      await loadMe(); refresh();
    } catch (x) { err.textContent = x.message || "That didn't work. Try again."; }
    btn.disabled = false;
  }
  else if (f.id === "npform") {
    try { await S.B.updatePassword($("#np-pass").value); $("#newpass").hidden = true; note("Password updated."); }
    catch (x) { $("#np-err").textContent = x.message; }
  }
  else if (f.id === "reqform") {
    const ch = $("#rf-char").value.trim(); if (!ch) return;
    lsSet("gc.char", ch); btn.disabled = true;
    try {
      await S.B.createRequest({ kind: "craft", recipeId: S.sel, label: (BYID.get(S.sel) || {}).name || "", qty: Math.max(1, Math.min(999, Number($("#rf-qty").value) || 1)),
        tip: readCoins("rf-tip"), note: $("#rf-note").value.trim().slice(0, 140), fromChar: ch, to: S.reqFor.uid, toChar: S.reqFor.char });
      S.reqFor = null; renderSheet(); note("Request sent. Track it on the Requests tab."); refresh();
    } catch (x) { note("Couldn't send the request: " + x.message); btn.disabled = false; }
  }
  else if (f.classList.contains("dm-form")) {
    const input = f.querySelector("input"), body = input.value.trim().slice(0, 1000); if (!body) return;
    const to = f.dataset.key.slice(3);
    btn.disabled = true;
    try {
      await S.B.sendDm(to, body); input.value = "";
      await refresh(); renderMessages();
      const again = document.querySelector(".dm-form input"); if (again) again.focus();
    } catch (x) { note("Couldn't send that message: " + x.message); btn.disabled = false; }
  }
  else if (f.id === "dcchform") {
    const conf = (S.dc.ch && S.dc.ch.config) || {}, feed = $("#dc-feed").value, events = $("#dc-evch").value, tz = $("#dc-tz").value;
    const feedChanged = feed !== (conf.feed_webhook ? "" : conf.feed_channel || "");
    btn.disabled = true; $("#dcch-saved").textContent = "Saving…";
    try {
      const r = await S.B.discordChannels({ feed: feedChanged ? feed : null, events, tz, announce: feedChanged && !!feed });
      S.dc = { ...S.dc, ch: r, chMsg: r.warning || (feedChanged && feed ? "✓ Saved. The bot posted a hello in the feed channel." : "✓ Saved."), cfg: await S.B.discordConfig().catch(() => S.dc.cfg) };
      renderAdmin();
    } catch (x) { $("#dcch-saved").textContent = "Couldn't save: " + x.message; btn.disabled = false; }
  }
  else if (f.id === "dcform") {
    const hook = $("#dc-hook").value.trim(), s = $("#dc-saved");
    if (hook && !/^https:\/\/(canary\.|ptb\.)?(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(hook)) { s.textContent = "That should be a Discord webhook link starting with https://discord.com/api/webhooks/"; return; }
    btn.disabled = true;
    try {
      await S.B.discordConfigSet(hook || null, $("#dc-news").checked, $("#dc-board").checked, $("#dc-market").checked, { guides: $("#dc-guides").checked, events: $("#dc-events").checked, members: $("#dc-members").checked });
      S.dc = { ...(S.dc || {}), cfg: await S.B.discordConfig() }; renderAdmin();
      const s2 = $("#dc-saved"); if (s2) s2.textContent = hook ? "✓ Saved. Press “Send a test message” to check it." : "✓ Saved.";
    } catch (x) { s.textContent = "Couldn't save: " + x.message; btn.disabled = false; }
  }
  else if (f.id === "newsform") {
    const title = $("#nf-title").value.trim().slice(0, 120); if (!title) return;
    btn.disabled = true;
    try {
      await S.B.createNews({ title, tag: $("#nf-tag").value, body: $("#nf-body").value.trim().slice(0, 1500), pinned: $("#nf-pin").checked });
      S.news = await S.B.loadNews(); renderNews(); renderAdmin();
      const s = $("#nf-saved"); if (s) s.textContent = "Posted. It's on the home page now.";
    } catch (x) { $("#nf-saved").textContent = "Couldn't post: " + x.message; btn.disabled = false; }
  }
  else if (f.id === "adminset") {
    const ann = $("#as-ann").value.trim().slice(0, 500), inv = $("#as-discord").value.trim().slice(0, 200), saved = $("#as-saved");
    if (inv && !/^https:\/\/(discord\.gg|discord\.com\/invite)\//.test(inv)) { saved.textContent = "The Discord link should start with https://discord.gg/"; return; }
    btn.disabled = true;
    try { await S.B.saveSetting("announcement", ann); await S.B.saveSetting("discord_invite", inv); S.settings = { ...S.settings, announcement: ann, discord_invite: inv }; saved.textContent = "Saved. It's on the home page now."; renderHome(); }
    catch (x) { saved.textContent = "Couldn't save: " + x.message; }
    btn.disabled = false;
  }
  else if (f.classList.contains("chat-form")) {
    const input = f.querySelector("input"), body = input.value.trim().slice(0, 500); if (!body) return;
    const [type, id] = f.dataset.key.split(":");
    btn.disabled = true;
    try {
      await S.B.sendMessage(type, id, body); input.value = ""; input.blur();
      await refresh(); if (S.view === "board") renderBoard(); else renderRequests(); scrollChats();
      const again = document.querySelector(`.chat-form[data-key="${f.dataset.key}"] input`); if (again) again.focus();
    }
    catch (x) { note("Couldn't send that message: " + x.message); btn.disabled = false; }
  }
  else if (f.id === "boardform") {
    const title = $("#bf-title").value.trim().slice(0, 80), ch = $("#bf-char").value.trim().slice(0, 24);
    if (!title || !ch) return;
    lsSet("gc.char", ch); btn.disabled = true;
    const rec = DATA_OK && RECIPES.find((r) => r.name.toLowerCase() === title.toLowerCase());
    try {
      await S.B.createPost({ category: $("#bf-cat").value, title, recipeId: rec ? rec.id : null, qty: Math.max(1, Math.min(9999, Number($("#bf-qty").value) || 1)),
        offer: readCoins("bf-offer"), note: $("#bf-note").value.trim().slice(0, 300), authorChar: ch });
      S.postOpen = false; S.boardTab = "open"; await refresh(); note("Posted. The whole guild can see it on the Request Board.");
    } catch (x) { note("Couldn't post that: " + x.message); btn.disabled = false; }
  }
  else if (f.id === "profform") {
    btn.disabled = true; const saved = $("#pr-saved");
    const fields = { mainChar: $("#pr-char").value.trim().slice(0, 24), mainRealm: $("#pr-realm").value.trim().slice(0, 40), mainClass: $("#pr-class").value,
      mainLevel: Math.max(0, Math.min(80, Number($("#pr-level").value) || 0)), faction: $("#pr-faction").value, discord: $("#pr-discord").value.trim().slice(0, 40),
      playTimes: $("#pr-times").value.trim().slice(0, 80), bio: $("#pr-bio").value.trim().slice(0, 400) };
    try { await S.B.saveProfile(fields); Object.assign(S.profiles[S.uid] || (S.profiles[S.uid] = {}), fields); saved.textContent = "Saved."; document.activeElement.blur(); renderProfile(); }
    catch (x) { saved.textContent = "Couldn't save: " + x.message; }
    btn.disabled = false;
  }
  else if (f.id === "addchar") {
    const name = $("#newchar").value.trim().slice(0, 24); if (!name) return;
    const d = ensureMyDoc(); if (!d.chars[name]) d.chars[name] = { profs: {} };
    S.editChar = name; lsSet("gc.editChar", name); if (!lsGet("gc.char")) lsSet("gc.char", name);
    queueSave(); renderMine();
  }
  else if (f.id === "postform") {
    const item = $("#pf-item").value.trim().slice(0, 60), ch = $("#pf-char").value.trim().slice(0, 24);
    if (!item || !ch) return;
    lsSet("gc.char", ch); btn.disabled = true;
    try {
      await S.B.createListing({ char: ch, type: $("#pf-type").value, item, qty: Math.max(1, Number($("#pf-qty").value) || 1), price: readCoins("pf-price"), note: $("#pf-note").value.trim().slice(0, 140) });
      $("#pf-item").value = ""; $("#pf-note").value = ""; ["g", "s", "c"].forEach((k) => { $("#pf-price-" + k).value = ""; }); $("#pf-qty").value = "1"; $("#pf-total").textContent = ""; $("#postform").hidden = true; note("Listed. It's on the guild market now.");
      refresh();
    } catch (x) { note("Couldn't post the listing: " + x.message); }
    btn.disabled = false;
  }
});

document.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.id === "dm-new" && t.value) { location.hash = "#messages-" + t.value; return; }
  if (t.dataset.adminRank || t.dataset.adminAdmin) {
    const id = t.dataset.adminRank || t.dataset.adminAdmin, p = prof(id);
    const f = t.dataset.adminRank ? { rank: t.value } : { isAdmin: t.checked };
    t.disabled = true;
    let msg;
    try { await S.B.adminSetMember(id, f); msg = `${p.username || "Member"} ${"rank" in f ? "is now " + f.rank : f.isAdmin ? "is now an admin" : "is no longer an admin"}.`; }
    catch (err) { msg = "Couldn't change that: " + err.message; }
    await refresh(); note(msg); return;
  }
  if (t.matches("[data-known]")) {
    const p = ensureMyDoc().chars[S.editChar].profs[S.editProf]; const id = Number(t.dataset.known);
    const set = new Set(p.known || []); t.checked ? set.add(id) : set.delete(id); p.known = [...set];
    queueSave();
    const chip = document.querySelector('[data-act="pick-prof"][aria-pressed="true"] .n'); if (chip) chip.textContent = set.size;
  }
  else if (t.id === "pr-avatar" && t.files && t.files[0]) {
    const msg = $("#pr-avatar-msg"); msg.textContent = "Uploading…";
    S.B.uploadAvatar(t.files[0]).then((url) => {
      (S.profiles[S.uid] || (S.profiles[S.uid] = {})).avatar = url;
      renderProfile(); renderWho(); syncPresence();
      const m = $("#pr-avatar-msg"); if (m) m.textContent = "Picture updated.";
    }).catch((err) => { const m = $("#pr-avatar-msg"); if (m) m.textContent = err.message; });
  }
  else if (t.id === "pf-fill" && t.value !== "") {
    const c = ((S.bnet[S.uid] || {}).characters || [])[Number(t.value)]; if (!c) return;
    $("#pr-char").value = String(c.name || "").slice(0, 24);
    $("#pr-realm").value = String(c.surname || c.realm || "").slice(0, 40);
    if (CLASSES.includes(c.cls)) $("#pr-class").value = c.cls;
    $("#pr-level").value = c.level || "";
    if (c.faction === "Alliance" || c.faction === "Horde") $("#pr-faction").value = c.faction;
    $("#pr-saved").textContent = "Filled in from " + c.name + ". Press Save profile to keep it.";
  }
  else if (t.id === "addprof" && t.value) {
    const c = ensureMyDoc().chars[S.editChar]; c.profs = c.profs || {}; c.profs[t.value] = { skill: 1, known: [] };
    S.editProf = t.value; queueSave(); renderMine();
  }
  else if (t.id === "skill") { const p = ensureMyDoc().chars[S.editChar].profs[S.editProf]; p.skill = Math.max(1, Math.min(300, Number(t.value) || 1)); queueSave(); }
  else if (t.id === "mynote") { ensureMyDoc().note = t.value.slice(0, 200); queueSave(); }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "mineq") { S.mineQ = e.target.value; S._focusMine = true; renderMine(); S._focusMine = false; }
  if (e.target.id === "pr-armory") {
    // .../forever/us/armory/character/mason-nightwin  ->  Mason, Nightwin
    let v = e.target.value.trim(); try { v = decodeURIComponent(v); } catch {}
    const m = v.match(/armory\/character\/([^/?#\s]+)/i) || v.match(/^([\p{L}]+-[\p{L}'-]+)$/u);
    if (!m) return;
    const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    const [name, ...rest] = m[1].split("-"); const sur = rest.map(cap).join("-");
    $("#pr-char").value = cap(name).slice(0, 24); $("#pr-realm").value = sur.slice(0, 40);
    $("#pr-saved").textContent = `Filled in ${cap(name)} ${sur}. Press Save profile to keep it.`;
  }
});

/* ---------- Guides: member-written guides plus market price trends ---------- */
const G_CATS = { Gathering: "Gathering paths", Questing: "Questing", Dungeons: "Dungeons", Market: "Market & gold", Other: "Other" };
const DAY = 86400000;
Object.assign(S, { guides: [], prices: [], gLoaded: false, gTab: "all", guideId: null, gEdit: null, gq: "", pq: "", psort: "value", pOpen: null });
async function loadGuideData() {
  try { const [g, p] = await Promise.all([S.B.loadGuides(), S.B.loadPrices()]); S.guides = g || []; S.prices = p || []; S.gLoaded = true; }
  catch (e) { S.gLoaded = true; }
  if (S.view === "guides") renderGuides();
}
// Light formatting for guide text: "## Heading", "- bullet", "1. step", **bold**.
function mdLite(text) {
  const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  let html = "", list = null, para = [];
  const flushP = () => { if (para.length) { html += `<p>${para.map(inline).join("<br>")}</p>`; para = []; } };
  const flushL = () => { if (list) { html += `<${list.t}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.t}>`; list = null; } };
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim(); let m;
    if (!line) { flushP(); flushL(); }
    else if ((m = line.match(/^#{1,3}\s+(.*)/))) { flushP(); flushL(); html += `<h3>${inline(m[1])}</h3>`; }
    else if ((m = line.match(/^[-*•]\s+(.*)/)) || (m = line.match(/^\d+[.)]\s+(.*)/))) {
      flushP(); const t = /^\d/.test(line) ? "ol" : "ul";
      if (!list || list.t !== t) { flushL(); list = { t, items: [] }; }
      list.items.push(m[1]);
    } else { flushL(); para.push(line); }
  }
  flushP(); flushL(); return html;
}
const levelText = (g) => (g.lmin || g.lmax ? `Levels ${g.lmin || "?"}–${g.lmax || "?"}` : "");
const canEditGuide = (g) => S.uid && (g.author === S.uid || (S.me && S.me.isAdmin));
const excerpt = (body) => { const l = String(body || "").split(/\n/).map((x) => x.trim()).find((x) => x && !/^(#|[-*•]\s|\d+[.)]\s)/.test(x)) || ""; return l.length > 150 ? l.slice(0, 147).replace(/\s+\S*$/, "") + "…" : l; };

// Price trends per item: typical (median) price this week, change against the week before, 30-day daily line.
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
function priceTable() {
  const by = {}, now = Date.now();
  for (const p of S.prices) { const k = String(p.item).trim().toLowerCase(); (by[k] = by[k] || { name: String(p.item).trim(), pts: [] }).pts.push(p); }
  return Object.values(by).map((x) => {
    x.pts.sort((a, b) => b.t - a.t);
    const wk = x.pts.filter((p) => p.t > now - 7 * DAY).map((p) => p.price), prev = x.pts.filter((p) => p.t <= now - 7 * DAY && p.t > now - 14 * DAY).map((p) => p.price);
    const m30 = x.pts.filter((p) => p.t > now - 30 * DAY).map((p) => p.price);
    x.now = wk.length ? median(wk) : median(x.pts.slice(0, 5).map((p) => p.price));
    x.fresh = wk.length > 0;
    x.change = wk.length && prev.length ? median(wk) / median(prev) - 1 : null;
    x.lo = m30.length ? Math.min(...m30) : null; x.hi = m30.length ? Math.max(...m30) : null;
    const days = []; for (let d = 29; d >= 0; d--) { const v = x.pts.filter((p) => p.t > now - (d + 1) * DAY && p.t <= now - d * DAY).map((p) => p.price); if (v.length) days.push([29 - d, median(v)]); }
    x.days = days; x.last = x.pts[0].t;
    return x;
  });
}
function sparkline(days) {
  if (days.length < 2) return '<span class="muted spark-none">Not enough reports yet</span>';
  const vs = days.map((d) => d[1]), lo = Math.min(...vs), hi = Math.max(...vs), W = 110, H = 28;
  const pts = days.map(([x, v]) => `${(x / 29 * (W - 4) + 2).toFixed(1)},${(hi === lo ? H / 2 : H - 3 - (v - lo) / (hi - lo) * (H - 6)).toFixed(1)}`);
  const up = vs[vs.length - 1] >= vs[0];
  return `<svg class="spark ${up ? "up" : "down"}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Price over the last 30 days, ${up ? "rising" : "falling"}"><polyline points="${pts.join(" ")}" fill="none" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${pts[pts.length - 1].split(",")[0]}" cy="${pts[pts.length - 1].split(",")[1]}" r="2.4"/></svg>`;
}
const changeTag = (c) => (c == null ? '<span class="muted">—</span>' : `<span class="chg ${c > 0.02 ? "up" : c < -0.02 ? "down" : "flat"}">${c > 0.02 ? "▲" : c < -0.02 ? "▼" : "■"} ${Math.abs(Math.round(c * 100))}%</span>`);

function renderGuides() {
  const root = $("#view-guides"); if (!root) return;
  if (!S.gLoaded) { root.innerHTML = '<div class="empty"><strong>Loading guides…</strong></div>'; loadGuideData(); return; }
  const head = `<div class="map-head board-head"><div><p class="eyebrow">Bark and Stone · Guides</p><h2 class="hero-title">Guild guides</h2>
    <p class="muted map-intro">Gathering paths, questing routes and dungeon tips written by guildmates, plus what things are selling for in trade.</p></div>
    ${S.uid ? '<button class="btn primary" data-act="g-new">Write a guide</button>' : '<button class="btn" data-act="signin">Sign in to write a guide</button>'}</div>`;
  // Writing or editing.
  if (S.gEdit) {
    const open = $("#guideform"); if (open && open.dataset.ed === String(S.gEdit)) return; // never wipe a guide being written
    const g = S.gEdit === "new" ? { title: "", category: S.gTab in G_CATS ? S.gTab : "Gathering", zone: "", lmin: "", lmax: "", body: "" } : S.guides.find((x) => x.id === S.gEdit);
    if (!g) { S.gEdit = null; return renderGuides(); }
    root.innerHTML = head + `<form class="card form guide-form" id="guideform" data-ed="${esc(S.gEdit)}">
      <h3 style="margin-top:0">${S.gEdit === "new" ? "Write a guide" : "Edit guide"}</h3>
      <label for="gf-title">Title</label><input id="gf-title" maxlength="100" required value="${esc(g.title)}" placeholder="e.g. Thorium run through Un'Goro Crater">
      <div class="gf-row">
        <div><label for="gf-cat">Kind of guide</label><select id="gf-cat">${Object.entries(G_CATS).map(([k, l]) => `<option value="${k}" ${g.category === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="gf-zone"><label for="gf-zone">Zones <span class="muted">(optional)</span></label><input id="gf-zone" maxlength="60" value="${esc(g.zone)}" placeholder="e.g. Un'Goro Crater, Silithus"></div>
        <div><label for="gf-lmin">Levels <span class="muted">(optional)</span></label><span class="gf-lv"><input id="gf-lmin" type="number" min="1" max="60" value="${esc(g.lmin || "")}" aria-label="From level"> to <input id="gf-lmax" type="number" min="1" max="60" value="${esc(g.lmax || "")}" aria-label="To level"></span></div>
      </div>
      <label for="gf-body">Guide</label>
      <textarea id="gf-body" rows="16" maxlength="10000" required placeholder="Describe the route step by step.">${esc(g.body)}</textarea>
      <p class="muted gf-help">Start a line with <code>## </code> for a heading, <code>- </code> for a bullet or <code>1. </code> for a numbered step. Wrap words in <code>**</code> to make them bold.</p>
      <div class="actions"><button class="btn" type="button" data-act="g-cancel">Cancel</button><button class="btn primary" type="submit">${S.gEdit === "new" ? "Publish guide" : "Save changes"}</button></div>
    </form>`;
    return;
  }
  // Reading one guide.
  if (S.guideId) {
    const g = S.guides.find((x) => x.id === S.guideId);
    if (!g) { root.innerHTML = head + `<div class="empty"><strong>That guide isn't here any more.</strong><a href="#guides">See all guides</a></div>`; return; }
    const meta = [G_CATS[g.category] || g.category, g.zone, levelText(g)].filter(Boolean).map(esc).join(" · ");
    root.innerHTML = `<p><a href="#guides" class="linkish">← All guides</a></p><article class="card guide-read">
      <p class="eyebrow">${meta}</p><h2 class="hero-title">${esc(g.title)}</h2>
      <p class="muted guide-by">${g.author ? `By ${memberLink(g.author)}` : "Starter guide from the officers"} · updated ${ago(g.u || g.t)}</p>
      <div class="guide-body">${mdLite(g.body)}</div>
      <div class="actions">${window.GC_CHAT ? `<button class="btn" data-act="g-ask" data-id="${esc(g.id)}">Ask the helper about this guide</button>` : ""}
        ${canEditGuide(g) ? `<button class="btn" data-act="g-edit" data-id="${esc(g.id)}">Edit</button><button class="btn danger" data-act="g-del" data-id="${esc(g.id)}">Delete</button>` : ""}</div>
    </article>`;
    refreshWowhead(); return;
  }
  const tabs = [["all", "All guides"], ...Object.entries(G_CATS).filter(([k]) => k !== "Market"), ["prices", "Market prices"]];
  const count = (k) => (k === "all" ? S.guides.length : k === "prices" ? priceTable().length : S.guides.filter((g) => g.category === k).length);
  const bar = `<div class="chips g-tabs">${tabs.map(([k, l]) => `<button class="chip" data-act="g-tab" data-t="${k}" aria-pressed="${S.gTab === k}">${l} <span class="n">${count(k)}</span></button>`).join("")}</div>`;
  if (S.gTab === "prices") { root.innerHTML = head + bar + renderPrices(); return; }
  const q = S.gq.trim().toLowerCase();
  const list = S.guides.filter((g) => (S.gTab === "all" || g.category === S.gTab || (S.gTab === "Other" && g.category === "Market"))
    && (!q || [g.title, g.zone, g.body].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => (a.category === b.category ? (a.lmin || 0) - (b.lmin || 0) : 0) || (b.u || 0) - (a.u || 0));
  const card = (g) => `<a class="card g-card" href="#guide-${esc(g.id)}">
      <span class="g-cat c-${esc(g.category)}">${esc(G_CATS[g.category] || g.category)}</span>
      <h3>${esc(g.title)}</h3>
      <p class="muted g-meta">${[g.zone, levelText(g)].filter(Boolean).map(esc).join(" · ")}</p>
      <p class="g-ex">${esc(excerpt(g.body))}</p>
      <span class="muted g-by">${g.author ? esc(userName(g.author) || "A guildmate") : "Officers"} · ${ago(g.u || g.t)}</span></a>`;
  root.innerHTML = head + bar + `<div class="g-search"><input type="search" id="gq" placeholder="Search guides, zones or items" aria-label="Search guides" value="${esc(S.gq)}"></div>`
    + (list.length ? `<div class="g-grid">${list.map(card).join("")}</div>`
      : `<div class="empty"><strong>${q ? "No guides match that search." : "No guides here yet."}</strong>${S.uid ? "Press “Write a guide” to share a route or tip." : ""}</div>`);
}

function renderPrices() {
  const rows = priceTable(), q = S.pq.trim().toLowerCase();
  const shown = rows.filter((r) => !q || r.name.toLowerCase().includes(q))
    .sort(S.psort === "moves" ? (a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0) || b.now - a.now
      : S.psort === "recent" ? (a, b) => b.last - a.last : (a, b) => b.now - a.now);
  const itemNames = [...new Set(Object.values(ITEMS).map((x) => x[0]))].sort();
  const byName = {}; for (const [id, v] of Object.entries(ITEMS)) byName[v[0].toLowerCase()] = { id, q: v[1] };
  const itemLink = (n) => { const it = byName[n.toLowerCase()]; return it ? `<a class="q${it.q}" href="https://www.wowhead.com/forever/item=${it.id}" target="_blank" rel="noopener">${esc(n)}</a>` : esc(n); };
  const report = S.uid ? `<form class="card form price-form" id="priceform">
      <div><label for="pp-item">Item</label><input id="pp-item" list="pp-items" maxlength="60" required placeholder="e.g. Arcanite Bar"></div>
      <div><label for="pp-g">Price for one</label>${coinInput("pp", 0, "Price for one")}</div>
      <div><label for="pp-src">Seen in</label><select id="pp-src"><option>Trade chat</option><option>Auction house</option><option>Vendor</option></select></div>
      <button class="btn primary" type="submit">Report price</button>
      <datalist id="pp-items">${itemNames.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
    </form>` : `<div class="card"><button class="btn small primary" data-act="signin">Sign in</button> to report prices you see in trade.</div>`;
  const row = (r) => {
    const open = S.pOpen === r.name.toLowerCase();
    const detail = open ? `<tr class="p-detail"><td colspan="6"><ul class="p-reports">${r.pts.slice(0, 25).map((p) => `<li><span>${gold(p.price)}</span><span class="muted">${esc(p.source)} · ${p.by ? esc(userName(p.by) || "a guildmate") : "someone"} · ${ago(p.t)}</span>${S.uid && (p.by === S.uid || (S.me && S.me.isAdmin)) && p.source !== "Guild market" ? `<button class="linkish small-x" data-act="p-del" data-id="${esc(p.id)}">remove</button>` : ""}</li>`).join("")}</ul></td></tr>` : "";
    return `<tr class="p-row${open ? " open" : ""}" data-act="p-open" data-k="${esc(r.name.toLowerCase())}" tabindex="0" aria-expanded="${open}">
      <td class="p-name">${itemLink(r.name)}</td>
      <td>${gold(r.now)}${r.fresh ? "" : '<span class="muted p-old"> older</span>'}</td>
      <td>${changeTag(r.change)}</td>
      <td class="p-spark">${sparkline(r.days)}</td>
      <td class="p-range muted">${r.lo != null ? `${gold(r.lo)} – ${gold(r.hi)}` : "—"}</td>
      <td class="muted num">${r.pts.length} · ${ago(r.last)}</td></tr>${detail}`;
  };
  const top = rows.filter((r) => r.fresh).sort((a, b) => b.now - a.now).slice(0, 3);
  const movers = rows.filter((r) => r.change != null && Math.abs(r.change) >= 0.05).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 3);
  const highlight = rows.length ? `<div class="p-highlights">
      <div class="card"><p class="eyebrow">Highest value this week</p>${top.length ? `<ol>${top.map((r) => `<li>${itemLink(r.name)} <span>${gold(r.now)}</span></li>`).join("")}</ol>` : '<p class="muted">No reports this week yet.</p>'}</div>
      <div class="card"><p class="eyebrow">Biggest moves vs last week</p>${movers.length ? `<ol>${movers.map((r) => `<li>${itemLink(r.name)} ${changeTag(r.change)}</li>`).join("")}</ol>` : '<p class="muted">Not enough reports to compare weeks yet.</p>'}</div>
    </div>` : "";
  return `<p class="muted p-intro">Prices come from guildmates' reports of what they see in Trade chat and the auction house, plus every priced “For sale” listing on the guild market. The typical price is the middle of this week's reports.</p>
    ${report}${alertsCard()}${highlight}
    <div class="mk-bar"><input type="search" id="pq" placeholder="Search items" aria-label="Search prices" value="${esc(S.pq)}">
      <select id="psort" aria-label="Sort"><option value="value" ${S.psort === "value" ? "selected" : ""}>Highest value</option><option value="moves" ${S.psort === "moves" ? "selected" : ""}>Biggest moves</option><option value="recent" ${S.psort === "recent" ? "selected" : ""}>Recently reported</option></select></div>
    ${shown.length ? `<div class="p-wrap"><table class="p-table"><thead><tr><th>Item</th><th>Typical price</th><th>vs last week</th><th>Last 30 days</th><th>30-day range</th><th>Reports</th></tr></thead><tbody>${shown.map(row).join("")}</tbody></table></div>`
      : `<div class="empty"><strong>${q ? "No item matches that search." : "No prices reported yet."}</strong>${q ? "" : "Report the first one above when you see an item for sale in trade."}</div>`}`;
}

document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  const act = t.dataset.act;
  if (act === "g-tab") { S.gTab = t.dataset.t; renderGuides(); }
  else if (act === "g-new") { if (!S.uid) return openAuth("in"); S.gEdit = "new"; if (S.view !== "guides" || S.guideId) location.hash = "#guides"; renderGuides(); setTimeout(() => { const i = $("#gf-title"); if (i) i.focus(); }, 0); }
  else if (act === "g-edit") { S.gEdit = t.dataset.id; renderGuides(); }
  else if (act === "g-cancel") { S.gEdit = null; renderGuides(); }
  else if (act === "g-del") {
    const g = S.guides.find((x) => x.id === t.dataset.id); if (!g || !confirm(`Delete the guide “${g.title}”? This can't be undone.`)) return;
    try { await S.B.deleteGuide(g.id); S.guides = S.guides.filter((x) => x.id !== g.id); location.hash = "#guides"; note("Guide deleted."); } catch (x) { note("Couldn't delete the guide: " + x.message); }
  }
  else if (act === "g-ask") { const g = S.guides.find((x) => x.id === t.dataset.id); if (g && window.GC_CHAT) window.GC_CHAT.open(`I'm reading the guide “${g.title}”. `); }
  else if (act === "p-open") { if (e.target.closest("a,button")) return; const k = t.dataset.k; S.pOpen = S.pOpen === k ? null : k; renderGuides(); }
  else if (act === "p-del") {
    try { await S.B.deletePrice(t.dataset.id); S.prices = S.prices.filter((x) => x.id !== t.dataset.id); renderGuides(); } catch (x) { note("Couldn't remove that price: " + x.message); }
  }
});
document.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr.p-row")) { e.preventDefault(); e.target.click(); } });
document.addEventListener("input", (e) => {
  if (e.target.id === "gq") { S.gq = e.target.value; const pos = e.target.selectionStart; renderGuides(); const b = $("#gq"); if (b) { b.focus(); try { b.setSelectionRange(pos, pos); } catch {} } }
  if (e.target.id === "pq") { S.pq = e.target.value; const pos = e.target.selectionStart; renderGuides(); const b = $("#pq"); if (b) { b.focus(); try { b.setSelectionRange(pos, pos); } catch {} } }
});
document.addEventListener("change", (e) => { if (e.target.id === "psort") { S.psort = e.target.value; renderGuides(); } });
document.addEventListener("submit", async (e) => {
  const f = e.target;
  if (f.id === "guideform") {
    e.preventDefault();
    const lv = (id) => { const n = Math.round(Number($(id).value)); return n >= 1 && n <= 60 ? n : null; };
    const o = { id: S.gEdit === "new" ? null : S.gEdit, title: $("#gf-title").value.trim().slice(0, 100), category: $("#gf-cat").value, zone: $("#gf-zone").value.trim().slice(0, 60), lmin: lv("#gf-lmin"), lmax: lv("#gf-lmax"), body: $("#gf-body").value.trim().slice(0, 10000) };
    if (o.title.length < 3 || !o.body) { note("Give the guide a title and some text."); return; }
    if (o.lmin && o.lmax && o.lmin > o.lmax) [o.lmin, o.lmax] = [o.lmax, o.lmin];
    const btn = f.querySelector('[type="submit"]'); btn.disabled = true;
    try {
      await S.B.saveGuide(o); S.gEdit = null; S.guides = await S.B.loadGuides();
      const g = o.id ? S.guides.find((x) => x.id === o.id) : S.guides.slice().sort((a, b) => b.t - a.t)[0];
      if (g) location.hash = "#guide-" + g.id; renderGuides(); note(o.id ? "Guide saved." : "Guide published. Thanks for sharing it.");
    } catch (x) { btn.disabled = false; note("Couldn't save the guide: " + x.message); }
  }
  else if (f.id === "priceform") {
    e.preventDefault();
    const item = $("#pp-item").value.trim().slice(0, 60), price = readCoins("pp");
    if (!item || !(price > 0)) { note("Enter the item and what one of them costs."); return; }
    const btn = f.querySelector('[type="submit"]'); btn.disabled = true;
    try { await S.B.reportPrice({ item, price, source: $("#pp-src").value }); S.prices = await S.B.loadPrices(); S.pOpen = item.toLowerCase(); renderGuides(); note(`Thanks. The price for ${item} is in.`); }
    catch (x) { btn.disabled = false; note("Couldn't report the price: " + x.message); }
  }
});

/* ---------- Events: the guild calendar. Sign-ups come from the website and from Discord buttons. ---------- */
const EV_KINDS = { Dungeon: "🗝️", Raid: "🐉", Farming: "⛏️", Leveling: "📜", PvP: "⚔️", Social: "🍺", Other: "📅" };
const EV_ROLES = [["Tank", "🛡️", "Tanks"], ["Healer", "💚", "Healers"], ["Damage", "🗡️", "Damage"]];
Object.assign(S, { events: [], evLoaded: false, eventId: null, evEdit: null, evPast: false, evRole: lsGet("gc.evRole") || "", evMsg: "",
  alerts: [], alertPrices: [], dcIdentity: undefined });
async function loadEvents() {
  try { S.events = (await S.B.loadEvents()) || []; } catch {}
  S.evLoaded = true;
  if (S.view === "events" && !(document.activeElement && document.activeElement.closest && document.activeElement.closest("#eventform"))) renderEvents();
  renderEventBits();
}
const evEnd = (e) => e.starts + e.dur * 60000;
const evOver = (e) => evEnd(e) < Date.now();
function evRoster(e) {
  const yes = e.signups.filter((s) => s.status === "yes");
  return { inn: yes.slice(0, e.size), standby: yes.slice(e.size), maybe: e.signups.filter((s) => s.status === "maybe"), no: e.signups.filter((s) => s.status === "no") };
}
const mySignup = (e) => (S.uid ? e.signups.find((s) => s.user === S.uid) : null);
const canEditEvent = (e) => S.uid && (e.createdBy === S.uid || (S.me && S.me.isAdmin));
const evWhen = (t, o) => new Date(t).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(o || {}) });
const evTime = (t) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
function evUntil(t) {
  const m = Math.round((t - Date.now()) / 60000);
  if (m < -1) return "started " + ago(t);
  if (m < 1) return "starting now";
  if (m < 60) return `in ${m} min`;
  if (m < 48 * 60) return `in ${Math.round(m / 60)} h`;
  return `in ${Math.round(m / 1440)} days`;
}
const hoursText = (min) => (min >= 60 ? `${+(min / 60).toFixed(1)} h` : `${min} min`);
const upcomingEvents = () => S.events.filter((e) => !e.cancelled && !evOver(e)).sort((a, b) => a.starts - b.starts);
const unansweredEvents = () => (S.uid ? upcomingEvents().filter((e) => !mySignup(e)) : []);

// Badge on the Events menu link, and the "coming up" box on the home page.
function renderEventBits() {
  const b = $("#ev-badge");
  if (b) { const n = unansweredEvents().length; b.textContent = n; b.hidden = !n; b.title = n ? `${n} event${n === 1 ? "" : "s"} you haven't answered` : ""; }
  const home = $("#home-events");
  if (home) {
    const list = upcomingEvents().slice(0, 3);
    home.innerHTML = list.length ? `<h3 class="sec">Coming up</h3><div class="hev-list">${list.map((e) => {
      const r = evRoster(e), me = mySignup(e);
      return `<a class="hev" href="#event-${esc(e.id)}"><span class="hev-ico" aria-hidden="true">${EV_KINDS[e.kind] || "📅"}</span>
        <span class="hev-main"><strong>${esc(e.title)}</strong><span class="muted">${esc(evWhen(e.starts))} · ${evUntil(e.starts)}</span></span>
        <span class="hev-n">${r.inn.length}/${e.size}${me ? `<small class="ev-mine st-${me.status}">${me.status === "yes" ? "Going" : me.status === "maybe" ? "Maybe" : "Not going"}</small>` : ""}</span></a>`;
    }).join("")}</div><p><a href="#events">All events</a></p>` : "";
  }
}

function evDateBlock(t) {
  const d = new Date(t);
  return `<div class="ev-date" aria-hidden="true"><span>${d.toLocaleDateString(undefined, { weekday: "short" })}</span><strong>${d.getDate()}</strong><span>${d.toLocaleDateString(undefined, { month: "short" })}</span></div>`;
}
const roleCounts = (r) => EV_ROLES.map(([k, ico]) => `<span title="${k}">${ico} ${r.inn.filter((s) => s.role === k).length}</span>`).join("");
const statusChip = (s) => (s ? `<span class="ev-mine st-${s.status}">${s.status === "yes" ? `Going · ${esc(s.role)}` : s.status === "maybe" ? "Maybe" : "Not going"}</span>` : "");

function renderEvents() {
  const root = $("#view-events"); if (!root) return;
  if (!S.evLoaded) { root.innerHTML = '<div class="empty"><strong>Loading events…</strong></div>'; loadEvents(); return; }
  const head = `<div class="map-head board-head"><div><p class="eyebrow">Bark and Stone · Events</p><h2 class="hero-title">Guild events</h2>
    <p class="muted map-intro">Dungeon runs, raids and farming nights. Sign up here or with the buttons on the bot's post in Discord; both show up in the same list.</p></div>
    ${S.uid ? '<button class="btn primary" data-act="ev-new">Plan an event</button>' : '<button class="btn" data-act="signin">Sign in to plan an event</button>'}</div>`;
  const msg = S.evMsg ? `<p class="ev-msg">${esc(S.evMsg)}</p>` : "";

  // An open form is never redrawn by background refreshes, so nothing typed is lost.
  const f = $("#eventform");
  if (S.evEdit) { if (f && f.dataset.ed === S.evEdit) return; root.innerHTML = head + eventForm(); return; }

  if (S.eventId) {
    const e = S.events.find((x) => x.id === S.eventId);
    if (!e) { root.innerHTML = head + `<div class="empty"><strong>That event isn't here any more.</strong><a href="#events">See all events</a></div>`; return; }
    root.innerHTML = `<p><a href="#events" class="linkish">← All events</a></p>` + msg + eventDetail(e);
    return;
  }

  const up = upcomingEvents(), past = S.events.filter((e) => e.cancelled || evOver(e)).sort((a, b) => b.starts - a.starts);
  const card = (e) => {
    const r = evRoster(e), me = mySignup(e);
    return `<a class="card ev-card k-${esc(e.kind)}${e.cancelled ? " cancelled" : ""}" href="#event-${esc(e.id)}">${evDateBlock(e.starts)}
      <div class="ev-main"><p class="ev-kind">${EV_KINDS[e.kind] || "📅"} ${esc(e.kind)}${e.cancelled ? ' · <span class="bad">Cancelled</span>' : ""}</p>
        <h3>${esc(e.title)}</h3>
        <p class="muted">${esc(evTime(e.starts))} · ${hoursText(e.dur)}${e.location ? " · " + esc(e.location) : ""}</p>
        <p class="ev-fill"><span class="ev-roles">${roleCounts(r)}</span><span>${r.inn.length}/${e.size} going${r.maybe.length ? ` · ${r.maybe.length} maybe` : ""}</span></p></div>
      <div class="ev-side">${evOver(e) || e.cancelled ? "" : `<span class="muted small">${evUntil(e.starts)}</span>`}${statusChip(me) || (S.uid && !e.cancelled && !evOver(e) ? '<span class="ev-mine st-none">Not answered</span>' : "")}</div></a>`;
  };
  root.innerHTML = head + msg
    + (up.length ? `<div class="ev-list">${up.map(card).join("")}</div>`
      : `<div class="empty"><strong>Nothing planned yet.</strong>${S.uid ? "Press “Plan an event”, or type <code>/event</code> in the guild Discord." : ""}</div>`)
    + (past.length ? `<button class="linkish ev-pastbtn" data-act="ev-past" aria-expanded="${S.evPast}">${S.evPast ? "Hide" : "Show"} past and cancelled events (${past.length})</button>${S.evPast ? `<div class="ev-list past">${past.map(card).join("")}</div>` : ""}` : "");
}

function eventDetail(e) {
  const r = evRoster(e), me = mySignup(e), open = !e.cancelled && !evOver(e), edit = canEditEvent(e);
  const who = (s) => {
    const name = s.user ? `<a href="#member-${esc(s.user)}">${esc(s.name)}</a>` : esc(s.name);
    const rm = edit || s.user === S.uid ? `<button class="linkish small-x" data-act="ev-rm" data-id="${esc(s.id)}" title="Remove from this event" aria-label="Remove ${esc(s.name)}">✕</button>` : "";
    return `<li class="${s.user === S.uid ? "me" : ""}">${name}${s.user ? "" : ' <span class="dc-tag" title="Signed up in Discord">Discord</span>'}${rm}</li>`;
  };
  const col = ([k, ico, label]) => {
    const list = r.inn.filter((s) => s.role === k);
    return `<div class="ev-col"><h4>${ico} ${label} <span class="muted">${list.length}</span></h4><ul>${list.map(who).join("") || '<li class="muted">Nobody yet</li>'}</ul></div>`;
  };
  const extra = (title, list) => (list.length ? `<div class="ev-extra"><h4>${title} <span class="muted">${list.length}</span></h4><ul class="ev-names">${list.map((s) => who(s).replace("<li", `<li data-role="${esc(s.role)}"`)).join("")}</ul></div>` : "");
  const p = prof(S.uid);
  const myName = (me && me.name) || p.mainChar || defaultChar() || (S.me ? S.me.username : "");
  const role = S.evRole || (me && me.role) || "Damage";
  const rsvp = !S.uid ? `<div class="card ev-rsvp"><button class="btn primary" data-act="signin">Sign in</button> to sign up on the website, or use the buttons on the event's post in the guild Discord.</div>`
    : !open ? "" : `<form class="card ev-rsvp" id="rsvpform">
      <h3>${me ? "Your answer" : "Are you coming?"}${me ? ` ${statusChip(me)}` : ""}</h3>
      <div class="ev-rsvp-row">
        <div><label for="ev-name">Character</label><input id="ev-name" maxlength="40" value="${esc(myName)}" required></div>
        <fieldset class="ev-rolepick"><legend>Role</legend>${EV_ROLES.map(([k, ico]) => `<label><input type="radio" name="ev-role" value="${k}" ${role === k ? "checked" : ""}><span>${ico} ${k}</span></label>`).join("")}</fieldset>
      </div>
      <div class="actions ev-answers">
        <button class="btn primary" type="submit" data-st="yes">${me && me.status === "yes" ? "Update" : "I'm coming"}</button>
        <button class="btn" type="submit" data-st="maybe">Maybe</button>
        <button class="btn" type="submit" data-st="no">Can't make it</button>
      </div></form>`;
  const left = Math.max(0, e.size - r.inn.length);
  return `<article class="card ev-detail k-${esc(e.kind)}">
    <div class="ev-dhead">${evDateBlock(e.starts)}<div>
      <p class="eyebrow">${EV_KINDS[e.kind] || "📅"} ${esc(e.kind)}${e.inDiscord ? ' · <span class="dc-tag" title="The bot posted this event in Discord">Posted in Discord</span>' : ""}</p>
      <h2 class="hero-title">${e.cancelled ? '<span class="bad">Cancelled:</span> ' : ""}${esc(e.title)}</h2>
      <p class="ev-meta"><strong>${esc(evWhen(e.starts, { weekday: "long", month: "long" }))}</strong> to ${esc(evTime(evEnd(e)))} <span class="muted">(${evUntil(e.starts)}, your time)</span></p>
      <p class="muted ev-meta">${[e.location, e.host ? "Hosted by " + e.host : ""].filter(Boolean).map(esc).join(" · ")}</p>
    </div></div>
    ${e.note ? `<p class="ev-note">${esc(e.note)}</p>` : ""}
    <p class="ev-fill big"><span class="ev-roles">${roleCounts(r)}</span><span><strong>${r.inn.length}/${e.size}</strong> going${open ? (left ? ` · ${left} spot${left === 1 ? "" : "s"} left` : " · full, new sign-ups go on standby") : ""}</span></p>
    ${S.uid ? `<div class="ev-cols">${EV_ROLES.map(col).join("")}</div>${extra("Standby", r.standby)}${extra("Maybe", r.maybe)}${extra("Can't make it", r.no)}`
      : `<p class="muted">Sign in to see who's going.</p>`}
    ${edit ? `<div class="actions ev-host">${open ? `<button class="btn" data-act="ev-edit" data-id="${esc(e.id)}">Edit</button>` : ""}
      ${evOver(e) ? "" : `<button class="btn" data-act="ev-cancel" data-id="${esc(e.id)}">${e.cancelled ? "Restore event" : "Cancel event"}</button>`}
      <button class="btn danger" data-act="ev-del" data-id="${esc(e.id)}">Delete</button></div>` : ""}
  </article>${rsvp}`;
}

function localInput(t) { const d = new Date(t - new Date(t).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); }
function eventForm() {
  const now = new Date(); now.setDate(now.getDate() + 1); now.setHours(20, 0, 0, 0);
  const e = S.evEdit === "new" ? { title: "", kind: "Dungeon", starts: now.getTime(), dur: 120, location: "", size: 5, note: "", host: prof(S.uid).mainChar || defaultChar() || "" }
    : S.events.find((x) => x.id === S.evEdit);
  if (!e) { S.evEdit = null; return ""; }
  const durs = [30, 60, 90, 120, 150, 180, 240, 300, 360, 480];
  if (!durs.includes(e.dur)) durs.push(e.dur);
  return `<form class="card form guide-form" id="eventform" data-ed="${esc(S.evEdit)}">
    <h3 style="margin-top:0">${S.evEdit === "new" ? "Plan an event" : "Edit event"}</h3>
    <label for="ef-title">What is it?</label><input id="ef-title" maxlength="80" required value="${esc(e.title)}" placeholder="e.g. Scarlet Monastery: Library and Armory">
    <div class="gf-row ef-row">
      <div><label for="ef-kind">Kind</label><select id="ef-kind">${Object.entries(EV_KINDS).map(([k, i]) => `<option value="${k}" ${e.kind === k ? "selected" : ""}>${i} ${k}</option>`).join("")}</select></div>
      <div><label for="ef-when">Starts <span class="muted">(your time)</span></label><input id="ef-when" type="datetime-local" required value="${localInput(e.starts)}"></div>
      <div><label for="ef-dur">How long</label><select id="ef-dur">${durs.sort((a, b) => a - b).map((d) => `<option value="${d}" ${e.dur === d ? "selected" : ""}>${hoursText(d)}</option>`).join("")}</select></div>
    </div>
    <div class="gf-row ef-row">
      <div><label for="ef-size">Spots</label><input id="ef-size" type="number" min="2" max="40" value="${e.size}" required></div>
      <div><label for="ef-loc">Meet at <span class="muted">(optional)</span></label><input id="ef-loc" maxlength="80" value="${esc(e.location)}" placeholder="e.g. Ironforge bank"></div>
      <div><label for="ef-host">Host</label><input id="ef-host" maxlength="60" value="${esc(e.host)}"></div>
    </div>
    <label for="ef-note">Details <span class="muted">(optional)</span></label>
    <textarea id="ef-note" rows="4" maxlength="1000" placeholder="Level range, what to bring, loot rules…">${esc(e.note)}</textarea>
    <p class="muted gf-help">The event is posted in the guild Discord with sign-up buttons once the bot has an events channel (type <code>/eventchannel</code> there).</p>
    <div class="actions"><button class="btn" type="button" data-act="ev-cancel-edit">Cancel</button><button class="btn primary" type="submit">${S.evEdit === "new" ? "Post event" : "Save changes"}</button></div>
  </form>`;
}

// After a change on the website, update the event's post in Discord and say how it went.
async function evSync(id, quiet) {
  const r = await S.B.syncEvent(id);
  if (!quiet && r && !r.posted && r.reason && S.B.mode !== "demo") S.evMsg = "Saved on the website. Discord wasn't updated: " + r.reason;
  else if (!quiet && r && r.posted) S.evMsg = r.updated ? "" : "Saved and posted in Discord.";
  if (S.view === "events") renderEvents();
}

document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  const act = t.dataset.act;
  if (act === "ev-new") { if (!S.uid) return openAuth("in"); S.evEdit = "new"; S.evMsg = ""; if (S.eventId) location.hash = "#events"; renderEvents(); setTimeout(() => { const i = $("#ef-title"); if (i) i.focus(); }, 0); }
  else if (act === "ev-edit") { S.evEdit = t.dataset.id; S.evMsg = ""; renderEvents(); }
  else if (act === "ev-cancel-edit") { S.evEdit = null; renderEvents(); }
  else if (act === "ev-past") { S.evPast = !S.evPast; renderEvents(); }
  else if (act === "ev-cancel") {
    const ev = S.events.find((x) => x.id === t.dataset.id); if (!ev) return;
    if (!ev.cancelled && !confirm(`Cancel “${ev.title}”? Everyone will see it as cancelled, here and in Discord.`)) return;
    try { await S.B.setEventCancelled(ev.id, !ev.cancelled); ev.cancelled = !ev.cancelled; S.evMsg = ""; renderEvents(); evSync(ev.id); loadEvents(); }
    catch (x) { note("Couldn't change the event: " + x.message); }
  }
  else if (act === "ev-del") {
    const ev = S.events.find((x) => x.id === t.dataset.id); if (!ev || !confirm(`Delete “${ev.title}” and its sign-ups? This can't be undone. (To keep it visible as cancelled, use Cancel event instead.)`)) return;
    try { await S.B.syncEvent(ev.id, "delete"); await S.B.deleteEvent(ev.id); S.events = S.events.filter((x) => x.id !== ev.id); location.hash = "#events"; note("Event deleted."); renderEventBits(); }
    catch (x) { note("Couldn't delete the event: " + x.message); }
  }
  else if (act === "ev-rm") {
    const ev = S.events.find((x) => x.signups.some((s) => s.id === t.dataset.id)); if (!ev) return;
    const s = ev.signups.find((x) => x.id === t.dataset.id);
    if (!confirm(s.user === S.uid ? "Take yourself off this event?" : `Remove ${s.name} from this event?`)) return;
    try { await S.B.removeSignup(s.id); ev.signups = ev.signups.filter((x) => x.id !== s.id); renderEvents(); renderEventBits(); evSync(ev.id, true); }
    catch (x) { note("Couldn't remove that sign-up: " + x.message); }
  }
});
document.addEventListener("change", (e) => { if (e.target.name === "ev-role") { S.evRole = e.target.value; lsSet("gc.evRole", S.evRole); } });
document.addEventListener("submit", async (e) => {
  const f = e.target;
  if (f.id === "rsvpform") {
    e.preventDefault();
    const st = (e.submitter && e.submitter.dataset.st) || "yes";
    const ev = S.events.find((x) => x.id === S.eventId); if (!ev) return;
    const name = $("#ev-name").value.trim().slice(0, 40), role = (f.querySelector('input[name="ev-role"]:checked') || {}).value || "Damage";
    if (!name) { note("Enter your character's name."); return; }
    f.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try { await S.B.rsvp(ev.id, st, role, name); S.evMsg = ""; await loadEvents(); evSync(ev.id, true); }
    catch (x) { f.querySelectorAll("button").forEach((b) => (b.disabled = false)); note("Couldn't save your answer: " + x.message); }
  }
  else if (f.id === "eventform") {
    e.preventDefault();
    const starts = new Date($("#ef-when").value).getTime();
    const o = { id: S.evEdit === "new" ? null : S.evEdit, title: $("#ef-title").value.trim().slice(0, 80), kind: $("#ef-kind").value, starts,
      dur: Number($("#ef-dur").value) || 120, size: Math.max(2, Math.min(40, Math.round(Number($("#ef-size").value) || 5))),
      location: $("#ef-loc").value.trim().slice(0, 80), host: $("#ef-host").value.trim().slice(0, 60), note: $("#ef-note").value.trim().slice(0, 1000) };
    if (o.title.length < 3) { note("Give the event a name of at least 3 letters."); return; }
    if (!starts) { note("Choose when the event starts."); return; }
    if (!o.id && starts < Date.now() - 600000) { note("That start time has already passed."); return; }
    const btn = f.querySelector('[type="submit"]'); btn.disabled = true;
    try {
      const id = await S.B.saveEvent(o); S.evEdit = null; S.evMsg = "Saved.";
      await loadEvents(); location.hash = "#event-" + id; evSync(id);
    } catch (x) { btn.disabled = false; note("Couldn't save the event: " + x.message); }
  }
});

/* ---------- Price alerts: tell me when an item is reported under or over a price ---------- */
async function loadAlerts() {
  if (!S.uid) { S.alerts = []; S.alertPrices = []; return; }
  try { S.alerts = (await S.B.loadAlerts()) || []; S.alertPrices = await S.B.recentPrices([...new Set(S.alerts.map((a) => a.item))]); } catch {}
  renderBell(); if (S.view === "guides" && S.gTab === "prices") renderGuides();
}
const alertHit = (a, p) => p.item.trim().toLowerCase() === a.item.trim().toLowerCase() && p.t > a.t && p.by !== S.uid && ((a.below && p.price <= a.below) || (a.above && p.price >= a.above));
function alertNotifications() {
  const out = [];
  for (const a of S.alerts) for (const p of S.alertPrices) if (alertHit(a, p))
    out.push({ t: p.t, text: `<strong>${esc(p.item)}</strong> was reported at ${gold(p.price, "")} in ${esc(p.source.toLowerCase())} (${a.below && p.price <= a.below ? "under" : "over"} your alert)`, href: "#prices" });
  return out;
}
function alertsCard(itemNames) {
  if (!S.uid) return "";
  const latest = (item) => { const p = S.alertPrices.filter((x) => x.item.trim().toLowerCase() === item.toLowerCase()).sort((a, b) => b.t - a.t)[0]; return p ? `last seen ${gold(p.price, "")} ${ago(p.t)}` : "no reports lately"; };
  return `<details class="card p-alerts" ${S.alertsOpen ? "open" : ""}><summary><strong>Your price alerts</strong> <span class="muted">${S.alerts.length ? `(${S.alerts.length})` : "· get a notification when an item is reported under or over a price"}</span></summary>
    ${S.alerts.length ? `<ul class="pa-list">${S.alerts.map((a) => `<li><strong>${esc(a.item)}</strong> ${a.below ? `under ${gold(a.below, "")}` : ""}${a.below && a.above ? " or " : ""}${a.above ? `over ${gold(a.above, "")}` : ""} <span class="muted">· ${latest(a.item)}</span> <button class="linkish small-x" data-act="pa-del" data-id="${esc(a.id)}">remove</button></li>`).join("")}</ul>` : ""}
    <form class="form price-form pa-form" id="alertform">
      <div><label for="pa-item">Item</label><input id="pa-item" list="pp-items" maxlength="60" required placeholder="e.g. Arcanite Bar"></div>
      <div><label for="pa-dir">Tell me when it's</label><select id="pa-dir"><option value="below">under</option><option value="above">over</option></select></div>
      <div><label for="pa-g">Price for one</label>${coinInput("pa", 0, "Alert price")}</div>
      <button class="btn" type="submit">Add alert</button>
    </form><p class="muted small">Alerts show in your notifications bell when a guildmate reports a matching price.</p></details>`;
}
document.addEventListener("toggle", (e) => { if (e.target.classList && e.target.classList.contains("p-alerts")) S.alertsOpen = e.target.open; }, true);
document.addEventListener("click", async (e) => {
  const t = e.target.closest('[data-act="pa-del"]'); if (!t) return;
  try { await S.B.deleteAlert(t.dataset.id); S.alerts = S.alerts.filter((a) => a.id !== t.dataset.id); renderGuides(); renderBell(); } catch (x) { note("Couldn't remove the alert: " + x.message); }
});
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "alertform") return;
  e.preventDefault();
  const item = $("#pa-item").value.trim().slice(0, 60), price = readCoins("pa"), dir = $("#pa-dir").value;
  if (!item || !(price > 0)) { note("Enter the item and a price."); return; }
  try { await S.B.addAlert({ item, [dir]: price }); S.alertsOpen = true; await loadAlerts(); renderGuides(); note(`Alert set: ${item} ${dir === "below" ? "under" : "over"} the price you chose.`); }
  catch (x) { note("Couldn't add the alert: " + x.message); }
});

/* ---------- Link a Discord account (so Discord sign-ups count as you) ---------- */
async function loadDiscordIdentity() {
  if (!S.uid || S.B.mode === "demo") { S.dcIdentity = null; return; }
  S.dcIdentity = await S.B.discordIdentity();
  if (S.view === "profile" && !S.viewUser) { const box = $("#dc-link"); if (box) box.innerHTML = discordLinkBox(); }
}
function discordLinkBox() {
  if (S.dcIdentity === undefined) return "";
  return S.dcIdentity ? `<p class="dc-linked">✓ Discord linked${S.dcIdentity.name && S.dcIdentity.name !== "linked" ? ` as <strong>${esc(S.dcIdentity.name)}</strong>` : ""}. Event sign-ups you make with the bot's buttons count as you.</p>`
    : `<p class="muted" style="margin:0 0 8px">Link your Discord account so sign-ups you make in Discord count as you, and so you can sign in with Discord.</p><button class="btn small discord" type="button" data-act="dc-link">Link Discord</button> <span class="saved" id="dc-link-msg"></span>`;
}
document.addEventListener("click", async (e) => {
  if (!e.target.closest('[data-act="dc-link"]')) return;
  const m = $("#dc-link-msg");
  try { await S.B.linkDiscord(); }
  catch (x) { if (m) m.textContent = /manual linking|disabled|not enabled|provider/i.test(x.message) ? "Discord linking isn't switched on yet. An admin needs to turn it on in Supabase (see SETUP.md)." : x.message; }
});

/* ---------- "New" count on the Trade menu: board jobs posted since you last looked ---------- */
function boardSeen() { let t = Number(lsGet("gc.boardSeen")); if (!t) { t = Date.now() - 3 * 86400000; lsSet("gc.boardSeen", String(t)); } return t; }
function renderTradeBadge() {
  const b = $("#trade-badge"); if (!b) return;
  if (S.view === "board") lsSet("gc.boardSeen", String(Date.now()));
  const seen = boardSeen();
  const n = S.uid ? S.board.filter((p) => p.status === "open" && p.author !== S.uid && p.created > seen).length : 0;
  b.textContent = n; b.hidden = !n; b.title = n ? `${n} new job${n === 1 ? "" : "s"} on the Request Board` : "";
}

// The guild helper (chat.js) reaches the site through this.
window.GC_AI = {
  token: () => (S.B && S.B.accessToken ? S.B.accessToken() : Promise.resolve(null)),
  signedIn: () => !!S.uid, signIn: () => openAuth("in"), page: () => S.view, demo: () => !S.B || S.B.mode === "demo",
};

route();
})();
