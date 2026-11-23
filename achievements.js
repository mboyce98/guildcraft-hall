/* Bark and Stone — Achievements (#achievements).
   Site achievements are earned automatically from what members do on the site. Guild deeds (dungeons, raids,
   adventures) are claimed by members and approved by the guild master. Honours can only be given by the guild master.
   The guild master (rank Thane) is the ruling authority: creates, edits and retires achievements, decides claims,
   awards honours and can revoke anything. The database enforces this (supabase-achievements.sql). */
(() => {
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const root = document.getElementById("view-achievements"); if (!root) return;
const app = () => window.GC_APP || {};
const A = () => (app().ach || {});
const ICON = (ic) => `https://wow.zamimg.com/images/wow/icons/large/${/^[a-z0-9_]+$/.test(ic || "") ? ic : "inv_misc_questionmark"}.jpg`;
const img = (ic, cls) => `<img class="${cls || "ach-ic"}" src="${ICON(ic)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${ICON("inv_misc_questionmark")}'">`;
const ago = (t) => { if (!t) return ""; const s = (Date.now() - t) / 1000; if (s < 3600) return Math.max(1, Math.floor(s / 60)) + "m ago"; if (s < 86400) return Math.floor(s / 3600) + "h ago"; return Math.floor(s / 86400) + "d ago"; };
const day = (t) => (t ? new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "");
const KIND = { auto: "Earned on the site", claim: "Claim it, the guild master approves", award: "Only the guild master can award this" };

const st = { tab: "mine", cat: "", list: [], awards: [], loaded: false, busy: false, extra: null, claimFor: null, msg: "", gmMember: "", gmEdit: null, gmQ: "" };

// ---------- Data ----------
async function load(force) {
  const B = app().backend && app().backend(); const uid = app().uid && app().uid();
  if (!B || !B.loadAchievements || !uid || st.busy || (st.loaded && !force)) return;
  st.busy = true;
  try {
    const d = await B.loadAchievements();
    st.list = d.list; st.awards = d.awards;
    // Guides and prices are only fetched when an unearned achievement needs them.
    const want = (t) => st.list.some((a) => a.kind === "auto" && !a.retired && (a.rule || {}).t === t && !awardOf(a.id, uid));
    if (!st.extra) {
      const [guides, prices] = await Promise.all([want("guide") ? B.loadGuides().catch(() => []) : [], want("prices") ? B.loadPrices().catch(() => []) : []]);
      st.extra = { guides, prices };
    }
    st.loaded = true;
    st.lastEarn = st.loadedAt = Date.now();
    await earnNew();
  } catch (e) { st.msg = "Achievements didn't load: " + (e.message || "try again") + ". The guild master may need to run supabase-achievements.sql."; }
  st.busy = false;
  if (!root.hidden) render();
  paintBadges();
}
const byId = (id) => st.list.find((a) => a.id === id);
const awardOf = (ach, user) => st.awards.find((w) => w.ach === ach && w.user === user);
const granted = (user) => st.awards.filter((w) => w.user === user && w.status === "granted" && byId(w.ach));
const points = (user) => granted(user).reduce((s, w) => s + (byId(w.ach).points || 0), 0);

// Progress on a site achievement for the signed-in member: { have, need }.
function progress(a) {
  const uid = app().uid(), x = A(), p = (x.profiles ? x.profiles() : {})[uid] || {}, r = a.rule || {};
  const doc = (x.crafter && x.crafter(uid)) || {}, profs = Object.values(doc.chars || {}).flatMap((c) => Object.values(c.profs || {}));
  const n = r.n || 1;
  switch (r.t) {
    case "account": return { have: 1, need: 1 };
    case "profile": return { have: [p.mainChar, p.mainClass, p.mainLevel].filter(Boolean).length, need: 3 };
    case "avatar": return { have: p.avatar ? 1 : 0, need: 1 };
    case "level": return { have: Math.min(p.mainLevel || 0, n), need: n };
    case "profession": return { have: Math.min(profs.length, 1), need: 1 };
    case "recipes": return { have: Math.min(profs.reduce((s, q) => s + (q.known || []).length, 0), n), need: n };
    case "skill": return { have: Math.min(Math.max(0, ...profs.map((q) => q.skill || 0)), n), need: n };
    case "craft_done": return { have: Math.min((x.requests ? x.requests() : []).filter((q) => q.to === uid && q.status === "done").length, n), need: n };
    case "listing": return { have: (x.listings ? x.listings() : []).some((l) => l.seller === uid) ? 1 : 0, need: 1 };
    case "board_post": return { have: (x.board ? x.board() : []).some((b) => b.author === uid) ? 1 : 0, need: 1 };
    case "board_done": return { have: Math.min((x.board ? x.board() : []).filter((b) => b.claimer === uid && b.status === "done").length, n), need: n };
    case "prices": return { have: Math.min(((st.extra && st.extra.prices) || []).filter((q) => q.by === uid).length, n), need: n };
    case "event": return { have: Math.min((x.events ? x.events() : []).filter((e) => (e.signups || []).some((s) => s.user === uid && s.status === "yes")).length, n), need: n };
    case "event_host": return { have: (x.events ? x.events() : []).some((e) => e.createdBy === uid) ? 1 : 0, need: 1 };
    case "guide": return { have: ((st.extra && st.extra.guides) || []).some((g) => g.author === uid) ? 1 : 0, need: 1 };
    default: return { have: 0, need: 1 };
  }
}
// Record site achievements the member has just earned (never re-adds one the guild master revoked).
async function earnNew() {
  const uid = app().uid(); if (!uid) return;
  const fresh = st.list.filter((a) => a.kind === "auto" && !a.retired && !awardOf(a.id, uid) && (() => { const q = progress(a); return q.have >= q.need; })()).map((a) => a.id);
  if (!fresh.length) return;
  try {
    await app().backend().earnAchievements(fresh); const d = await app().backend().loadAchievements(); st.awards = d.awards;
    const got = fresh.filter((id) => (awardOf(id, uid) || {}).status === "granted").map(byId);
    if (!got.length) return;
    st.msg = `🏆 New achievement${got.length === 1 ? "" : "s"}: ${got.map((a) => a.name).join(", ")}!`;
    toast(got); paintBadges();
  } catch {}
}
// A small notice in the corner, shown on whatever page the member is on.
function toast(got) {
  let box = document.getElementById("ach-toasts");
  if (!box) { box = document.createElement("div"); box.id = "ach-toasts"; box.setAttribute("role", "status"); document.body.appendChild(box); }
  got.slice(0, 3).forEach((a, i) => {
    const t = document.createElement("a"); t.className = "ach-toast"; t.href = "#achievements";
    t.innerHTML = `${img(a.icon, "ach-ic sm")}<span><small>Achievement earned</small><strong>${esc(a.name)}</strong></span><b class="ach-pts sm">${a.points || 0}</b>`;
    setTimeout(() => { box.appendChild(t); setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, 6000); }, i * 700);
  });
}
// Background check from any page: new site achievements are recorded as soon as they're earned.
function check() {
  const uid = app().uid && app().uid(); if (!uid || st.busy) return;
  if (st.uid !== uid) { st.uid = uid; st.loaded = false; st.extra = null; st.awards = []; st.msg = ""; }
  if (!st.loaded) { if (!st.waiting) { st.waiting = true; setTimeout(() => { st.waiting = false; load(); }, 3000); } return; }
  if (Date.now() - (st.loadedAt || 0) > 300000) { st.extra = null; load(true); return; } // fresh copy every 5 minutes
  const wait = 15000 - (Date.now() - (st.lastEarn || 0));
  if (wait > 0) { if (!st.again) st.again = setTimeout(() => { st.again = 0; check(); }, wait + 50); return; } // check again once the pause ends
  st.lastEarn = Date.now(); st.busy = true;
  earnNew().finally(() => { st.busy = false; if (!root.hidden && st.msg) render(); });
}

// ---------- Views ----------
const isGM = () => !!(A().isGM && A().isGM());
function stateOf(a, uid) {
  const w = awardOf(a.id, uid);
  if (w) return w.status; // granted, pending, denied, revoked
  return "locked";
}
function card(a, uid) {
  const s = stateOf(a, uid), w = awardOf(a.id, uid), me = uid === app().uid();
  const pr = a.kind === "auto" && s === "locked" && me ? progress(a) : null;
  let foot = "";
  if (s === "granted") foot = `<span class="ach-when">Earned ${day(w.decided || w.t)}</span>${w.gmNote ? `<span class="ach-gm">“${esc(w.gmNote)}” · the guild master</span>` : ""}`;
  else if (s === "pending") foot = `<span class="ach-pend">⏳ Waiting for the guild master</span>${me ? ` <button class="linkish" data-ac="withdraw" data-id="${esc(w.id)}">Withdraw</button>` : ""}`;
  else if (s === "denied") foot = `<span class="ach-deny">Not approved${w.gmNote ? `: “${esc(w.gmNote)}”` : ""}</span>${me ? ` <button class="linkish" data-ac="withdraw" data-id="${esc(w.id)}">Clear and claim again later</button>` : ""}`;
  else if (s === "revoked") foot = `<span class="ach-deny">Revoked by the guild master${w.gmNote ? `: “${esc(w.gmNote)}”` : ""}</span>`;
  else if (pr) foot = `<div class="ach-prog" title="${pr.have} of ${pr.need}"><i style="width:${Math.round(pr.have / pr.need * 100)}%"></i></div><span class="muted small">${pr.have} / ${pr.need}</span>`;
  else if (a.kind === "claim" && me && !a.retired) foot = st.claimFor === a.id
    ? `<form class="ach-claim" data-ach="${esc(a.id)}"><input id="ach-note" maxlength="200" placeholder="Who was there, when, a screenshot link…" aria-label="Claim note"><button class="btn small primary" type="submit">Send claim</button><button class="btn small" type="button" data-ac="claim-cancel">Cancel</button></form>`
    : `<button class="btn small" data-ac="claim" data-id="${esc(a.id)}">Claim</button>`;
  else if (a.kind === "award") foot = `<span class="muted small">Given by the guild master</span>`;
  return `<article class="ach s-${s} ${a.retired ? "retired" : ""}" title="${esc(KIND[a.kind])}">
    ${img(a.icon)}<div class="ach-main"><h4>${esc(a.name)}</h4><p>${esc(a.description)}</p><div class="ach-foot">${foot}</div></div>
    <span class="ach-pts" aria-label="${a.points} points">${a.points}</span></article>`;
}

function mineHtml() {
  const uid = app().uid(), cats = [...new Set(st.list.filter((a) => !a.retired).map((a) => a.category))];
  const list = st.list.filter((a) => !a.retired && (!st.cat || a.category === st.cat));
  const mine = granted(uid), total = st.list.filter((a) => !a.retired).length;
  const pend = st.awards.filter((w) => w.user === uid && w.status === "pending").length;
  return `<div class="ach-summary">
      <div class="ach-big"><b>${points(uid)}</b><span>achievement points</span></div>
      <div class="ach-big"><b>${mine.length}<small>/${total}</small></b><span>earned</span></div>
      <div class="ach-big"><b>${pend}</b><span>waiting for the guild master</span></div>
      <div class="ach-big"><b>#${rankOf(uid) || "–"}</b><span>in the guild</span></div>
    </div>
    <div class="chips ach-cats"><button class="chip" data-ac="cat" data-v="" aria-pressed="${!st.cat}">All</button>${cats.map((c) => {
      const inCat = st.list.filter((a) => !a.retired && a.category === c), got = inCat.filter((a) => stateOf(a, uid) === "granted").length;
      return `<button class="chip" data-ac="cat" data-v="${esc(c)}" aria-pressed="${st.cat === c}">${esc(c)} <span class="n">${got}/${inCat.length}</span></button>`;
    }).join("")}</div>
    ${(st.cat ? [st.cat] : cats).map((c) => `<h3 class="sec ach-cat">${esc(c)}</h3><div class="ach-grid">${list.filter((a) => a.category === c).map((a) => card(a, uid)).join("")}</div>`).join("")}`;
}

function leaderboard() {
  const ids = Object.keys((A().profiles && A().profiles()) || {});
  return ids.map((id) => ({ id, pts: points(id), n: granted(id).length })).filter((x) => x.n).sort((a, b) => b.pts - a.pts || b.n - a.n);
}
function rankOf(uid) { const i = leaderboard().findIndex((x) => x.id === uid); return i < 0 ? 0 : i + 1; }
function fameHtml() {
  const lb = leaderboard(), name = (id) => (app().name ? app().name(id) : "Member");
  const feed = st.awards.filter((w) => w.status === "granted" && byId(w.ach)).sort((a, b) => (b.decided || b.t) - (a.decided || a.t)).slice(0, 25);
  return `<div class="ach-fame">
    <section class="card"><h3 class="sec">🏆 Hall of fame</h3>
      ${lb.length ? `<ol class="ach-lb">${lb.slice(0, 25).map((x, i) => `<li class="${i < 3 ? "top" + (i + 1) : ""}"><span class="ach-place">${i + 1}</span>${A().avatar ? A().avatar(x.id, 32) : ""}<a href="#member-${esc(x.id)}">${esc(name(x.id))}</a><span class="muted small">${x.n} earned</span><b>${x.pts}</b></li>`).join("")}</ol>`
        : `<p class="muted">No achievements earned yet. Be the first!</p>`}
    </section>
    <section class="card"><h3 class="sec">📜 Recently earned</h3>
      ${feed.length ? `<ul class="ach-feed">${feed.map((w) => { const a = byId(w.ach); return `<li>${img(a.icon, "ach-ic sm")}<span><a href="#member-${esc(w.user)}">${esc(name(w.user))}</a> earned <strong>${esc(a.name)}</strong>${a.kind !== "auto" ? ` <span class="muted">(${a.kind === "award" ? "awarded" : "approved"} by the guild master)</span>` : ""}<br><span class="muted small">${ago(w.decided || w.t)}</span></span></li>`; }).join("")}</ul>`
        : `<p class="muted">Nothing yet.</p>`}
    </section></div>`;
}

function allHtml() {
  const cats = [...new Set(st.list.map((a) => a.category))];
  const earners = (id) => st.awards.filter((w) => w.ach === id && w.status === "granted").length;
  const members = Object.keys((A().profiles && A().profiles()) || {}).length || 1;
  return cats.map((c) => `<h3 class="sec ach-cat">${esc(c)}</h3><div class="ach-table">${st.list.filter((a) => a.category === c).map((a) => `
      <div class="ach-row ${a.retired ? "retired" : ""}">${img(a.icon, "ach-ic sm")}<div><strong>${esc(a.name)}</strong>${a.retired ? ' <span class="tag">Retired</span>' : ""}<div class="muted small">${esc(a.description)} · ${esc(KIND[a.kind])}</div></div>
        <span class="ach-pts sm">${a.points}</span><span class="muted small ach-rare">${earners(a.id)} earned · ${Math.round(earners(a.id) / members * 100)}%</span></div>`).join("")}</div>`).join("");
}

function gmHtml() {
  if (!isGM()) return `<div class="card empty"><strong>Guild master only.</strong>The guild master (rank Thane) runs achievements. Admins set ranks on the Admin page.</div>`;
  const name = (id) => (app().name ? app().name(id) : "Member");
  const pending = st.awards.filter((w) => w.status === "pending" && byId(w.ach)).sort((a, b) => a.t - b.t);
  const members = Object.keys((A().profiles && A().profiles()) || {}).sort((a, b) => name(a).localeCompare(name(b)));
  const m = st.gmMember;
  const e = st.gmEdit, cats = [...new Set(st.list.map((a) => a.category))];
  return `<div class="ach-gm-grid">
    <section class="card"><h3 class="sec">⚖️ Claims waiting for you <span class="muted num">${pending.length}</span></h3>
      ${pending.length ? pending.map((w) => { const a = byId(w.ach); return `<div class="ach-claimrow">${img(a.icon, "ach-ic sm")}<div><strong>${esc(name(w.user))}</strong> claims <strong>${esc(a.name)}</strong> <span class="muted small">${ago(w.t)}</span>${w.note ? `<div class="small">“${esc(w.note)}”</div>` : ""}
          <div class="ach-decide"><input data-gm-note="${esc(w.id)}" maxlength="200" placeholder="Message to them (optional)"><button class="btn small primary" data-ac="decide" data-id="${esc(w.id)}" data-st="granted">Approve</button><button class="btn small danger" data-ac="decide" data-id="${esc(w.id)}" data-st="denied">Deny</button></div></div></div>`; }).join("")
        : `<p class="muted">No claims waiting.</p>`}
    </section>
    <section class="card"><h3 class="sec">🎖️ Award or revoke</h3>
      <label class="muted small" for="gm-member">Member</label>
      <select id="gm-member"><option value="">Choose a member…</option>${members.map((id) => `<option value="${esc(id)}" ${m === id ? "selected" : ""}>${esc(name(id))}</option>`).join("")}</select>
      ${m ? `<input id="gm-msg" maxlength="200" placeholder="Message with the award or revoke (optional)" style="margin-top:8px;width:100%">
        <div class="ach-gm-list">${st.list.filter((a) => !a.retired || awardOf(a.id, m)).map((a) => { const s = stateOf(a, m); return `<div class="ach-gm-item s-${s}">${img(a.icon, "ach-ic sm")}<span>${esc(a.name)} <span class="muted small">${s === "locked" ? "" : s}</span></span>
            ${s === "granted" ? `<button class="btn small danger" data-ac="give" data-id="${esc(a.id)}" data-st="revoked">Revoke</button>` : `<button class="btn small" data-ac="give" data-id="${esc(a.id)}" data-st="granted">${s === "pending" ? "Approve" : "Award"}</button>`}</div>`; }).join("")}</div>` : `<p class="muted small">Pick a member to award honours, approve deeds directly, or revoke anything they've earned. Revoked achievements stay revoked, even site ones.</p>`}
    </section>
    <section class="card ach-gm-wide"><h3 class="sec">📖 The achievement book</h3>
      <div class="inline"><button class="btn small primary" data-ac="new">＋ New achievement</button><input id="gm-q" value="${esc(st.gmQ)}" placeholder="Find an achievement" style="flex:1 1 200px"></div>
      ${e ? `<form class="ach-edit" id="ach-edit">
          <div class="ach-edit-prev">${img(e.icon, "ach-ic")}<span class="muted small">Icon preview</span></div>
          <label>Name<input id="ae-name" required minlength="2" maxlength="50" value="${esc(e.name)}"></label>
          <label>Description<input id="ae-desc" maxlength="200" value="${esc(e.description)}"></label>
          <label>Wowhead icon name<input id="ae-icon" maxlength="80" pattern="[a-z0-9_]+" value="${esc(e.icon)}" placeholder="e.g. inv_misc_trophy_01"></label>
          <label>Category<input id="ae-cat" list="ae-cats" required maxlength="30" value="${esc(e.category)}"><datalist id="ae-cats">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
          <label>Points<input id="ae-pts" type="number" min="0" max="100" value="${e.points}"></label>
          <label>How it's earned<select id="ae-kind" ${e.kind === "auto" && !e.isNew ? "disabled" : ""}>${e.kind === "auto" && !e.isNew ? `<option value="auto">Automatically on the site</option>` : ""}<option value="claim" ${e.kind === "claim" ? "selected" : ""}>Members claim it, you approve</option><option value="award" ${e.kind === "award" ? "selected" : ""}>Only you award it</option></select></label>
          <label>Order<input id="ae-sort" type="number" min="0" max="9999" value="${e.sort}"></label>
          <label class="chk"><input type="checkbox" id="ae-retired" ${e.retired ? "checked" : ""}> Retired (hidden from members; earned ones still count)</label>
          <div class="ach-edit-act"><button class="btn primary" type="submit">${e.isNew ? "Create" : "Save"}</button><button class="btn" type="button" data-ac="edit-cancel">Cancel</button></div>
        </form>` : ""}
      <div class="ach-table">${st.list.filter((a) => !st.gmQ || (a.name + " " + a.category).toLowerCase().includes(st.gmQ.toLowerCase())).map((a) => `<div class="ach-row ${a.retired ? "retired" : ""}">${img(a.icon, "ach-ic sm")}<div><strong>${esc(a.name)}</strong>${a.retired ? ' <span class="tag">Retired</span>' : ""}<div class="muted small">${esc(a.category)} · ${esc(KIND[a.kind])}</div></div><span class="ach-pts sm">${a.points}</span><button class="btn small" data-ac="edit" data-id="${esc(a.id)}">Edit</button></div>`).join("")}</div>
    </section></div>`;
}

function render() {
  if (root.hidden && root.dataset.built) return;
  root.dataset.built = "1";
  const uid = app().uid && app().uid();
  if (!uid) { root.innerHTML = `<div class="card empty"><strong>Sign in to see achievements.</strong>Earn them around the site and in game, and climb the guild's hall of fame.<div style="margin-top:12px"><button class="btn primary" data-ac="signin">Sign in</button></div></div>`; return; }
  if (st.uid !== uid) { st.uid = uid; st.loaded = false; st.extra = null; st.awards = []; st.msg = ""; }
  if (!st.loaded) load();
  else if (Date.now() - (st.lastEarn || 0) > 20000) { st.lastEarn = Date.now(); earnNew().then(() => { if (st.msg) render(); }); }
  const focusId = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : "";
  const tabs = [["mine", "🏅 My achievements"], ["fame", "🏆 Hall of fame"], ["all", "📖 All achievements"]].concat(isGM() ? [["gm", `⚖️ Guild master${st.awards.some((w) => w.status === "pending") ? ` (${st.awards.filter((w) => w.status === "pending").length})` : ""}`]] : []);
  root.innerHTML = `
    <div class="shop-head ach-head">
      <div><p class="eyebrow">Bark and Stone · Guild</p><h2 class="hero-title">Achievements</h2>
        <p class="muted map-intro">Earn achievements around the site, claim your deeds in game, and climb the hall of fame. <strong>The guild master has the final say</strong> on every achievement.</p>
        <div class="chips">${tabs.map(([k, l]) => `<button class="chip" data-ac="tab" data-v="${k}" aria-pressed="${st.tab === k}">${l}</button>`).join("")}</div></div>
      <div class="shop-keeper">${window.GC_MERCHANTS ? window.GC_MERCHANTS.portrait("thorek", "empty-merchant") : ""}<p class="shop-bubble">Every deed counts, friend. Claim yours and the guild master will judge it!</p></div>
    </div>
    ${st.msg ? `<p class="ach-msg" role="status">${esc(st.msg)}</p>` : ""}
    ${!st.loaded ? `<p class="muted">Opening the book of deeds…</p>` : st.tab === "mine" ? mineHtml() : st.tab === "fame" ? fameHtml() : st.tab === "all" ? allHtml() : gmHtml()}`;
  if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); if (el.setSelectionRange && typeof el.value === "string") el.setSelectionRange(el.value.length, el.value.length); } }
}

// ---------- Actions ----------
async function act(fn, okMsg) {
  try { await fn(); st.msg = okMsg || ""; } catch (x) { st.msg = "That didn't work: " + (x.message || "try again"); }
  await load(true);
}
root.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-ac]"); if (!b) return;
  const a = b.dataset.ac, B = app().backend && app().backend();
  if (a === "tab") { st.tab = b.dataset.v; st.msg = ""; render(); }
  else if (a === "cat") { st.cat = b.dataset.v; render(); }
  else if (a === "signin") { if (app().signIn) app().signIn(); }
  else if (a === "claim") { st.claimFor = b.dataset.id; render(); const n = $("#ach-note"); if (n) n.focus(); }
  else if (a === "claim-cancel") { st.claimFor = null; render(); }
  else if (a === "withdraw") { b.disabled = true; await act(() => B.withdrawClaim(b.dataset.id), "Claim withdrawn."); }
  else if (a === "decide") { b.disabled = true; const note = (root.querySelector(`[data-gm-note="${b.dataset.id}"]`) || {}).value || ""; await act(() => B.decideAward(b.dataset.id, b.dataset.st, note.trim()), b.dataset.st === "granted" ? "Approved." : "Denied."); }
  else if (a === "give") {
    const s = b.dataset.st, ach = byId(b.dataset.id), msg = ($("#gm-msg") || {}).value || "";
    if (s === "revoked" && !confirm(`Revoke “${ach.name}” from ${app().name(st.gmMember)}?`)) return;
    b.disabled = true; await act(() => B.giveAward(b.dataset.id, st.gmMember, s, msg.trim()), s === "revoked" ? "Revoked." : "Awarded.");
  }
  else if (a === "new") { st.gmEdit = { isNew: true, id: "", name: "", description: "", icon: "inv_misc_trophy_01", category: "Guild", points: 10, kind: "claim", sort: 100, retired: false }; render(); }
  else if (a === "edit") { st.gmEdit = { ...byId(b.dataset.id) }; render(); $("#ae-name") && $("#ae-name").focus(); }
  else if (a === "edit-cancel") { st.gmEdit = null; render(); }
});
root.addEventListener("submit", async (e) => {
  const f = e.target; e.preventDefault(); e.stopPropagation();
  const B = app().backend && app().backend();
  if (f.matches(".ach-claim")) { const note = ($("#ach-note") || {}).value || ""; const id = f.dataset.ach; st.claimFor = null; await act(() => B.claimAchievement(id, note.trim()), "Claim sent. The guild master will take a look."); }
  else if (f.id === "ach-edit") {
    const e0 = st.gmEdit, v = (id) => ($("#" + id) || {}).value;
    const name = v("ae-name").trim();
    const a = { id: e0.isNew ? (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "deed") + (byId(name.toLowerCase().replace(/[^a-z0-9]+/g, "-")) ? "-" + Date.now().toString(36).slice(-3) : "") : e0.id,
      name, description: v("ae-desc").trim(), icon: (v("ae-icon").trim() || "inv_misc_questionmark").toLowerCase(), category: v("ae-cat").trim() || "Guild",
      points: Math.max(0, Math.min(100, Number(v("ae-pts")) || 0)), kind: e0.kind === "auto" && !e0.isNew ? "auto" : v("ae-kind"), sort: Number(v("ae-sort")) || 100, retired: $("#ae-retired").checked, rule: e0.rule || null };
    st.gmEdit = null; await act(() => B.saveAchievement(a, e0.isNew), e0.isNew ? `Created “${a.name}”.` : `Saved “${a.name}”.`);
  }
});
root.addEventListener("change", (e) => { if (e.target.id === "gm-member") { st.gmMember = e.target.value; render(); } });
root.addEventListener("input", (e) => {
  if (e.target.id === "gm-q") { st.gmQ = e.target.value; render(); }
  else if (e.target.id === "ae-icon") { const p = root.querySelector(".ach-edit-prev img"); if (p) p.src = ICON(e.target.value.trim().toLowerCase()); }
});

// ---------- Badges on member profiles ----------
function badgesHtml(uid) {
  if (!st.loaded) { load(); return `<p class="muted small">Loading achievements…</p>`; }
  const g = granted(uid).sort((a, b) => (b.decided || b.t) - (a.decided || a.t));
  if (!g.length) return `<p class="muted small" style="margin:0">No achievements yet.</p>`;
  return `<div class="ach-badges">${g.slice(0, 12).map((w) => { const a = byId(w.ach); return `<span class="ach-badge" title="${esc(a.name)}: ${esc(a.description)}">${img(a.icon, "ach-ic sm")}</span>`; }).join("")}${g.length > 12 ? `<span class="muted small">+${g.length - 12} more</span>` : ""}</div>
    <p class="small" style="margin:6px 0 0"><strong>${points(uid)}</strong> points · ${g.length} earned · <a href="#achievements">See all achievements</a></p>`;
}
function paintBadges() { document.querySelectorAll("[data-ach-badges]").forEach((el) => { el.innerHTML = badgesHtml(el.dataset.achBadges); }); }

window.GC_ACH = { render, check, reload: () => load(true), badges: (uid) => `<div data-ach-badges="${esc(uid)}">${badgesHtml(uid)}</div>`, reset: () => { st.loaded = false; st.extra = null; st.awards = []; } };
})();
