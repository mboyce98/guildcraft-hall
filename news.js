/* Bark and Stone — World news on the home page.
   Headlines come from Wowhead's news feed through the site's world-news function (cached for an hour),
   and the page checks again every hour while it's open, so there's something new every few hours. */
(() => {
"use strict";
const box = document.getElementById("world-news"); // optional: the headlines also feed the home page ticker
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ago = (t) => { if (!t) return ""; const s = (Date.now() - t) / 1000; if (s < 3600) return Math.max(1, Math.floor(s / 60)) + "m ago"; if (s < 86400) return Math.floor(s / 3600) + "h ago"; return Math.floor(s / 86400) + "d ago"; };
const KEY = "gc.worldnews";
let pref = "forever"; try { pref = localStorage.getItem(KEY) || "forever"; } catch {}
let items = [], fetched = 0, more = false, failed = false;
const isForever = (n) => /forever/i.test(n.category) || /wow:? forever/i.test(n.title);

function draw() {
  if (!box) return;
  const chips = document.getElementById("wn-filter");
  if (chips) chips.innerHTML = [["forever", "WoW Forever"], ["all", "All of WoW"]].map(([k, l]) => `<button class="chip" data-wn="${k}" aria-pressed="${pref === k}">${l}</button>`).join("");
  const when = document.getElementById("wn-when");
  if (when) when.textContent = fetched ? `From Wowhead · updated ${ago(fetched)}` : "";
  if (failed && !items.length) { box.innerHTML = `<p class="muted">World news didn't load just now. It'll try again shortly.</p>`; return; }
  if (!items.length) { box.innerHTML = `<p class="muted">Gathering the latest news…</p>`; return; }
  const list = pref === "forever" ? items.filter(isForever) : items;
  const shown = list.slice(0, more ? 18 : 6);
  box.innerHTML = shown.map((n) => `<a class="wnews" href="${esc(n.link)}" target="_blank" rel="noopener">
      ${n.image ? `<span class="wn-img"><img src="${esc(n.image)}" alt="" loading="lazy" width="320" height="178"></span>` : ""}
      <span class="wn-body"><span class="wn-meta">${n.category ? `<span class="ntag">${esc(n.category)}</span>` : ""}<span class="muted">${ago(n.date)}</span></span>
        <strong>${esc(n.title)}</strong><span class="wn-teaser">${esc(n.teaser)}</span></span></a>`).join("")
    + (list.length > 6 ? `<button class="btn small wn-more" data-wn-more>${more ? "Show fewer" : `More headlines (${Math.min(list.length, 18) - 6})`}</button>` : "");
}

async function load() {
  try {
    const r = await fetch("/.netlify/functions/world-news");
    const d = await r.json();
    if (!r.ok || !Array.isArray(d.items)) throw new Error(d.error || "no news");
    items = d.items; fetched = d.fetched || Date.now(); failed = false;
    window.GC_WORLD = items; window.dispatchEvent(new Event("gc-world"));
  } catch { failed = true; }
  draw();
}

document.addEventListener("click", (e) => {
  const c = e.target.closest("[data-wn]");
  if (c) { pref = c.dataset.wn; try { localStorage.setItem(KEY, pref); } catch {} more = false; draw(); return; }
  if (e.target.closest("[data-wn-more]")) { more = !more; draw(); }
});

draw(); load();
setInterval(() => { if (document.visibilityState === "visible") load(); else draw(); }, 60 * 60 * 1000);
setInterval(draw, 5 * 60 * 1000); // keep "updated 2h ago" honest
})();
