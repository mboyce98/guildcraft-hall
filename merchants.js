/* Bark and Stone — Merchant Row: character merchants on the Market, Recipes, Request Board and Requests pages.
   Members can advertise their shop, crafting or services with one of the merchant characters (Supabase "adverts").
   When there aren't enough adverts, the house merchants call out real guild market listings.
   Also: GC_ICONS, big Wowhead item icons for any item ID (used on market cards). */
(() => {
"use strict";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = () => window.GC_APP || {};

const MODELS = {
  rowan:   { name: "Rowan Ashby",       who: "Human trader",       line: "Thumbs up, friend! Best deals this side of the canals." },
  maren:   { name: "Maren Redleaf",     who: "Human shopkeeper",   line: "Fine goods, fair prices, and I'll even wrap them." },
  thorek:  { name: "Thorek Frostbeard", who: "Dwarf blade-seller", line: "Forged in Ironforge, tested in the snow of Dun Morogh." },
  brannoc: { name: "Brannoc Stonefist", who: "Dwarf haggler",      line: "Hold it right there! You'll want to see this first." },
  zulana:  { name: "Zul'ana",           who: "Troll wanderer",     line: "Mon, I travel far for the good stuff. Have a look." },
};
const KEYS = Object.keys(MODELS);
const KIND = { shop: "Shop", craft: "Crafting", service: "Services", wanted: "Wanted" };
const LINK = { market: ["#market", "Visit the market"], recipes: ["#recipes", "See the recipes"], board: ["#board", "Open the board"], messages: ["", "Message them"] };
const PAGE_LINES = {
  market: ["Got something to sell? Press Post a listing and I'll shout it from here.", "Looking for a bargain? Everything here comes straight from guildmates."],
  recipes: ["Need something made? Find the recipe and press Request next to a crafter.", "Crafters: list your recipes on My crafter and I'll send customers your way."],
  board: ["Post a job and half of Stormwind will hear about it.", "Need ore, cloth or a helping hand? The board's the place."],
  requests: ["Requests come and go here. Accept one and earn yourself a tip.", "A happy customer is a returning customer. Mark jobs done when they're finished."],
};
const portrait = (key, cls) => `<img class="${cls || "mr-portrait"}" src="images/merchants/${MODELS[key] ? key : "rowan"}.jpg?v=1" alt="${esc((MODELS[key] || MODELS.rowan).name)}" width="360" height="480" loading="lazy">`;

// ---------- Adverts ----------
let ADS = [], adsLoadedFor = null, adsBusy = false;
async function loadAds(force) {
  const uid = app().uid && app().uid(), B = app().backend && app().backend();
  if (!uid || !B || !B.loadAds) { ADS = []; adsLoadedFor = null; return; }
  if (adsBusy || (!force && adsLoadedFor === uid)) return;
  adsBusy = true;
  try { ADS = await B.loadAds(); } catch { ADS = []; }
  adsBusy = false; adsLoadedFor = uid; paint();
}
setInterval(() => { if (!document.hidden && adsLoadedFor) loadAds(true); }, 5 * 60 * 1000);

// ---------- Cards ----------
const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];
function houseCards(page, n) {
  const listings = (app().listings ? app().listings() : []).slice().sort((a, b) => (b.created || 0) - (a.created || 0));
  const sale = listings.filter((l) => l.type === "S"), want = listings.filter((l) => l.type === "B");
  const out = [];
  const gold = (g) => (app().goldText ? app().goldText(g) : g + "g");
  sale.slice(0, 3).forEach((l, i) => out.push({ house: true, model: KEYS[(i + 1) % KEYS.length], kind: "shop", title: l.item,
    body: `Fresh in from ${l.char || "a guildmate"}: ${l.item} ×${l.qty || 1}${l.price ? " for " + gold(l.price) + " each" : ", open to offers"}. Don't miss it!`, href: "#market", btn: "See it on the market" }));
  want.slice(0, 1).forEach((l) => out.push({ house: true, model: "brannoc", kind: "wanted", title: l.item,
    body: `${l.char || "A guildmate"} is after ${l.item} ×${l.qty || 1}${l.price ? " and paying " + gold(l.price) + " each" : ""}. Got some spare?`, href: "#market", btn: "Sell to them" }));
  const lines = PAGE_LINES[page] || PAGE_LINES.market;
  let k = 0;
  while (out.length < n) { const key = KEYS[(out.length + k + page.length) % KEYS.length]; out.push({ house: true, model: key, kind: "shop", title: MODELS[key].who, body: k % 2 ? MODELS[key].line : lines[k % lines.length], href: page === "market" ? "" : "#market", btn: page === "market" ? "" : "Visit the market" }); k++; }
  return out;
}
function adCards() {
  const me = app().uid && app().uid();
  return ADS.map((a) => {
    const [href, btn] = LINK[a.link] || LINK.market;
    return { model: a.model, kind: a.kind, title: a.title, body: a.body, by: a.char || (app().name ? app().name(a.user) : ""), user: a.user, id: a.id, mine: a.user === me,
      href: a.link === "messages" ? (a.user === me ? "" : `#messages-${a.user}`) : href, btn, expires: a.expires };
  });
}
function cardHtml(c) {
  const m = MODELS[c.model] || MODELS.rowan;
  return `<article class="mr-card ${c.house ? "house" : "ad"} k-${esc(c.kind)}">
    <div class="mr-pic">${portrait(c.model)}<span class="mr-plate">${esc(c.house ? m.name : c.by || m.name)}</span></div>
    <div class="mr-body">
      <p class="mr-kind">${c.house ? (c.kind === "wanted" ? "Wanted" : "Merchant Row") : `Advert · ${esc(KIND[c.kind] || "Shop")}`}</p>
      <h4>${esc(c.title)}</h4>
      <p class="mr-bubble">${esc(c.body)}</p>
      <div class="mr-act">
        ${c.href ? `<a class="btn small primary" href="${esc(c.href)}">${esc(c.btn)}</a>` : ""}
        ${!c.house && !c.mine ? `<a class="btn small" href="#messages-${esc(c.user)}">Message</a>` : ""}
        ${c.mine ? `<button class="btn small danger" data-mr="remove" data-id="${esc(c.id)}">Remove</button><span class="muted small">ends ${new Date(c.expires).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>` : ""}
      </div>
    </div></article>`;
}
function rowHtml(page) {
  const ads = adCards(), cards = ads.concat(houseCards(page, Math.max(0, 4 - ads.length)));
  const signedIn = app().uid && app().uid();
  return `<div class="mr-head"><h3>🏪 Merchant Row</h3><span class="muted small">${ads.length ? `${ads.length} guild advert${ads.length === 1 ? "" : "s"} running` : "Guild adverts appear here"}</span>
      <button class="btn small" data-mr="${signedIn ? "advertise" : "signin"}">📣 Advertise here</button></div>
    <div class="mr-track" tabindex="0" aria-label="Merchant adverts">${cards.map(cardHtml).join("")}</div>`;
}
const slots = () => document.querySelectorAll("[data-mrow]");
function paint() {
  if (app().uid && app().uid() && adsLoadedFor !== app().uid()) loadAds();
  slots().forEach((el) => {
    if (el.closest("[hidden]")) return;
    const html = rowHtml(el.dataset.mrow);
    if (el.dataset.html === html) return;
    const track = el.querySelector(".mr-track"), x = track ? track.scrollLeft : 0;
    el.innerHTML = html; el.dataset.html = html;
    const t = el.querySelector(".mr-track"); if (t) t.scrollLeft = x;
  });
}
// Slowly step through the merchants, unless someone is hovering or using them.
setInterval(() => {
  if (document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  slots().forEach((el) => {
    const t = el.querySelector(".mr-track"); if (!t || el.closest("[hidden]") || el.matches(":hover") || el.contains(document.activeElement)) return;
    const card = t.querySelector(".mr-card"); if (!card) return;
    const step = card.getBoundingClientRect().width + 14;
    t.scrollTo({ left: t.scrollLeft + step >= t.scrollWidth - t.clientWidth + 4 ? 0 : t.scrollLeft + step, behavior: "smooth" });
  });
}, 7000);

// ---------- Advertise form ----------
let dlg = null, chosen = "rowan";
function openForm() {
  if (!dlg) {
    dlg = document.createElement("dialog"); dlg.className = "mr-dialog"; document.body.appendChild(dlg);
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg || e.target.closest("[data-mr='close']")) dlg.close();
      const m = e.target.closest("[data-model]"); if (m) { chosen = m.dataset.model; dlg.querySelectorAll("[data-model]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.model === chosen)); preview(); }
    });
    dlg.addEventListener("input", preview);
    dlg.addEventListener("submit", submit);
  }
  const mine = ADS.filter((a) => a.user === (app().uid && app().uid()));
  dlg.innerHTML = `<form class="mr-form" method="dialog">
    <div class="mr-form-head"><h3>📣 Advertise on Merchant Row</h3><button type="button" class="ai-icon" data-mr="close" aria-label="Close">✕</button></div>
    <p class="muted small">Your advert shows on the Market, Recipes, Request Board and Requests pages for the whole guild. You can have 2 running at once.${mine.length ? ` You have ${mine.length} running now.` : ""}</p>
    <p class="mr-lab">Pick your merchant</p>
    <div class="mr-models">${KEYS.map((k) => `<button type="button" class="mr-model" data-model="${k}" aria-pressed="${k === chosen}">${portrait(k, "")}<span>${esc(MODELS[k].name)}</span></button>`).join("")}</div>
    <div class="mr-fields">
      <label>Shop or advert name<input id="mr-title" required minlength="2" maxlength="40" placeholder="e.g. Ironpine Smithy"></label>
      <label>What you're offering<textarea id="mr-body" required minlength="2" maxlength="160" rows="3" placeholder="e.g. Copper and bronze weapons made to order. Bring mats and I'll waive the fee."></textarea></label>
      <div class="mr-two">
        <label>Type<select id="mr-kind"><option value="shop">Shop</option><option value="craft">Crafting</option><option value="service">Services</option><option value="wanted">Wanted</option></select></label>
        <label>Button sends people to<select id="mr-link"><option value="messages">Message me</option><option value="market">The market</option><option value="recipes">Recipes</option><option value="board">Request Board</option></select></label>
      </div>
      <div class="mr-two">
        <label>Character name<input id="mr-char" maxlength="24" value="${esc(app().myChar ? app().myChar() : "")}"></label>
        <label>Run it for<select id="mr-days"><option value="7">1 week</option><option value="14" selected>2 weeks</option></select></label>
      </div>
    </div>
    <p class="mr-lab">Preview</p>
    <div class="mr-preview"></div>
    <p class="mr-err" role="alert"></p>
    <div class="mr-form-act"><button class="btn primary" type="submit">Post advert</button><button class="btn" type="button" data-mr="close">Cancel</button></div>
  </form>`;
  preview();
  dlg.showModal();
}
function formVals() {
  const v = (id) => (dlg.querySelector("#" + id) || {}).value || "";
  return { model: chosen, title: v("mr-title").trim(), body: v("mr-body").trim(), kind: v("mr-kind"), link: v("mr-link"), char: v("mr-char").trim(), days: Number(v("mr-days")) || 14 };
}
function preview() {
  const o = formVals(), [href, btn] = LINK[o.link] || LINK.market;
  dlg.querySelector(".mr-preview").innerHTML = cardHtml({ model: o.model, kind: o.kind, title: o.title || "Your shop name", body: o.body || "What you're offering goes here.", by: o.char || "You", href: o.link === "messages" ? "#" : href, btn, user: "" });
}
async function submit(e) {
  e.preventDefault();
  const o = formVals(), err = dlg.querySelector(".mr-err"), btn = dlg.querySelector("[type=submit]");
  if (o.title.length < 2 || o.body.length < 2) { err.textContent = "Add a name and a short message."; return; }
  btn.disabled = true; err.textContent = "";
  try { await app().backend().addAd(o); dlg.close(); await loadAds(true); }
  catch (x) { err.textContent = x.message || "Couldn't post that. Try again."; }
  btn.disabled = false;
}

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-mr]"); if (!b || b.closest("dialog")) return;
  const a = b.dataset.mr;
  if (a === "advertise") openForm();
  else if (a === "signin") { if (app().signIn) app().signIn(); }
  else if (a === "remove") {
    if (!confirm("Remove this advert from Merchant Row?")) return;
    try { await app().backend().deleteAd(b.dataset.id); await loadAds(true); } catch (x) { alert("Couldn't remove it: " + (x.message || "try again")); }
  }
});

// ---------- Big item icons from Wowhead (cached in this browser) ----------
const ICONS = new Map(); let queue = [], active = 0, saveT = null;
try { Object.entries(JSON.parse(localStorage.getItem("gc.icons") || "{}")).forEach(([k, v]) => ICONS.set(Number(k), v)); } catch {}
function pump() {
  while (active < 5 && queue.length) {
    const id = queue.shift(); active++;
    fetch(`https://nether.wowhead.com/forever/tooltip/item/${id}`).then((r) => r.json()).then((d) => ICONS.set(id, d && /^[a-z0-9_]+$/i.test(d.icon || "") ? d.icon : ""))
      .catch(() => ICONS.set(id, "")).finally(() => {
        active--; fill();
        clearTimeout(saveT); saveT = setTimeout(() => { try { const o = {}; [...ICONS].slice(-800).forEach(([k, v]) => { if (v) o[k] = v; }); localStorage.setItem("gc.icons", JSON.stringify(o)); } catch {} }, 800);
        pump();
      });
  }
}
function fill() {
  document.querySelectorAll("img[data-wh-ic]").forEach((img) => {
    const id = Number(img.dataset.whIc), ic = ICONS.get(id);
    if (ic) { img.src = `https://wow.zamimg.com/images/wow/icons/large/${ic}.jpg`; img.removeAttribute("data-wh-ic"); img.classList.remove("pending"); }
    else if (ic === undefined && !queue.includes(id)) { queue.push(id); pump(); }
  });
}
const icon = (id) => {
  const ic = ICONS.get(Number(id));
  return ic ? `<img class="wh-ic" src="https://wow.zamimg.com/images/wow/icons/large/${ic}.jpg" alt="" width="56" height="56">`
    : `<img class="wh-ic pending" data-wh-ic="${Number(id)}" src="https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg" alt="" width="56" height="56">`;
};

window.GC_MERCHANTS = { slot: (page) => `<section class="merchant-row" data-mrow="${page}" aria-label="Merchant Row"></section>`, paint, portrait, MODELS, reload: () => loadAds(true) };
window.GC_ICONS = { img: icon, fill };
})();
