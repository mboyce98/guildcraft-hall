/* Bark and Stone guild helper, played by a Stormwind City guard. Floats on every page (bottom right).
   Quick questions are answered right here from the site's own data, for everyone.
   Anything typed goes to /.netlify/functions/ai-chat for signed-in members. */
(() => {
"use strict";
const KEY = "gc.ai.history";
const GUARD = "Guard Bram";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.slice(-30) : []; } catch { return []; } };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-30))); } catch {} };
let msgs = load(), busy = false, left = null;

// Quick questions anyone can ask; answered from the site's data without the AI.
const QUICK = [
  ["next", "What's on next?"],
  ["news", "Any guild news?"],
  ["level", "Where should I level?"],
  ["tip", "Got a tip for me?"],
  ["join", "How do I join?"],
  ["around", "Show me around"],
];
const ZONES = [ // Alliance leveling zones by level
  [1, 10, "your race's starting zone, then Elwynn Forest, Dun Morogh or Teldrassil"],
  [10, 20, "Westfall, Loch Modan or Darkshore"],
  [18, 25, "Redridge Mountains, Wetlands or Ashenvale"],
  [24, 31, "Duskwood, Wetlands, Ashenvale or Stonetalon Mountains"],
  [30, 40, "Stranglethorn Vale, Arathi Highlands, Hillsbrad Foothills, Desolace or Dustwallow Marsh"],
  [40, 50, "Tanaris, Feralas, the Hinterlands, Badlands or Swamp of Sorrows"],
  [48, 55, "Searing Gorge, Azshara, Felwood or Un'Goro Crater"],
  [53, 60, "Burning Steppes, Winterspring, the Western and Eastern Plaguelands, or Silithus"],
];
const QUIPS = [
  "Evening, citizen. Need directions?",
  "Halt! Oh, it's a friend of Bark and Stone. Carry on. Or ask me something!",
  "The Watch hears all the guild's news. Ask me what's happening.",
  "Not sure where to level next? I know these roads.",
  "Stay out of trouble now. Or at least tell me where it is.",
];

function localAnswer(k) {
  const g = (window.GC_AI && window.GC_AI.guard && window.GC_AI.guard()) || { events: [], news: [], tips: [], invite: "", level: 0 };
  const site = location.origin;
  if (k === "next") {
    if (!g.events.length) return "The calendar's empty, citizen. Why not plan a dungeon run? Go to #events and press **Plan an event**, and the guild can sign up here or in Discord.";
    return "Here's what the guild has planned:\n" + g.events.map((e) => `- **${e.title}**: ${e.when} (${e.until}), ${e.going}/${e.size} going. ${site}/#event-${e.id}`).join("\n") + "\nSign up on the event page or with the buttons in Discord.";
  }
  if (k === "news") {
    if (!g.news.length) return "Quiet on the walls today. No guild news yet. Check #home for world news from Wowhead.";
    return "The latest from the officers:\n" + g.news.map((n) => `- **${n.title}** (${n.tag})${n.body ? ": " + n.body.slice(0, 140) + (n.body.length > 140 ? "…" : "") : ""}`).join("\n");
  }
  if (k === "level") {
    const lv = g.level;
    if (!lv) return "Tell me your level and I'll point the way. Set your main character's level on #profile, or import it with the addon. Roughly:\n" + ZONES.map(([a, b, z]) => `- **${a}-${b}:** ${z}`).join("\n");
    const fit = ZONES.filter(([a, b]) => lv >= a && lv <= b).map(([, , z]) => z);
    return `At level **${lv}**, head for ${fit.join(", or ")}. For dungeons at your level, the addon's Dungeons tab (/bas) shows which ones fit you and which guildmates can come. There are route guides on #guides too.`;
  }
  if (k === "tip") return "A word of advice from the Watch: " + (g.tips[Math.floor(Math.random() * g.tips.length)] || "keep your armour repaired and your bags empty.");
  if (k === "join") return "Glad to hear it!\n- Read the guild rules on #rules. Rule 1: respect your fellow guildies.\n- Make an account here (the **Sign in** button at the top) and fill in your profile.\n"
    + (g.invite ? `- Join our Discord: ${g.invite}\n` : "") + "- Ask any officer in game for an invite to Bark and Stone.";
  if (k === "around") return "Here's the city map, so to speak:\n- #events: dungeon runs and farming nights to sign up for\n- #guides: leveling routes, gathering paths and market prices\n- #recipes: who in the guild can craft what\n- #market and #board: trade with guildmates and post jobs\n- #map and #cities: herbs, ore, trainers and vendors\n- #loot: dungeon drops";
  return "";
}

// Light formatting for answers: **bold**, "- " bullets, line breaks, and clickable links.
function format(text) {
  const link = (s) => s
    .replace(/(https?:\/\/[^\s<)]+[^\s<).,!?;:'"])/g, (u) => `<a href="${u}" ${u.startsWith(location.origin) || /guildcraft-hall\.netlify\.app/.test(u) ? "" : 'target="_blank" rel="noopener"'}>${u.replace(/^https?:\/\/(www\.)?/, "").replace(/^guildcraft-hall\.netlify\.app\/?/, "").replace(location.host + "/", "")}</a>`)
    .replace(/(^|[\s(])(#(?:home|rules|chronicle|classes|members|messages|guides|prices|guide-\d+|event-\d+|events|map|cities|loot|mounts|recipes|mine|requests|board|market|profile))\b/g, '$1<a href="$2">$2</a>');
  const inline = (s) => link(esc(s)).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  let html = "", inList = false;
  for (const raw of String(text).split("\n")) {
    const line = raw.trimEnd(), m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if (m) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(m[1])}</li>`; continue; }
    if (inList) { html += "</ul>"; inList = false; }
    html += line.trim() ? `<p>${inline(line.replace(/^#+\s*/, ""))}</p>` : "";
  }
  return html + (inList ? "</ul>" : "");
}

const root = document.createElement("div");
root.className = "ai-root";
root.innerHTML = `
  <div class="guard-bubble" hidden><button type="button" class="gb-text" data-ai="bubble"></button><button type="button" class="gb-x" data-ai="bubble-x" aria-label="Dismiss">✕</button></div>
  <button class="ai-fab guard-fab" type="button" aria-expanded="false" aria-controls="ai-panel" title="Talk to ${GUARD}">
    <img src="images/guard-face.jpg?v=1" alt="" width="46" height="46"><span>Ask the guard</span></button>
  <section class="ai-panel" id="ai-panel" role="dialog" aria-label="${GUARD}, the guild helper" hidden>
    <header class="ai-head guard-head">
      <img class="guard-portrait" src="images/guard.jpg?v=1" alt="A Stormwind City guard saluting" width="52" height="52">
      <div><strong>${GUARD}</strong><span class="ai-sub">Stormwind City Watch · guild helper</span></div>
      <button type="button" class="ai-icon" data-ai="clear" title="Start a new conversation" aria-label="Start a new conversation">↺</button>
      <button type="button" class="ai-icon" data-ai="close" title="Close" aria-label="Close">✕</button>
    </header>
    <div class="ai-log" aria-live="polite"></div>
    <div class="ai-quick" role="group" aria-label="Quick questions">${QUICK.map(([k, l]) => `<button type="button" class="chip" data-ai="local" data-k="${k}">${esc(l)}</button>`).join("")}</div>
    <form class="ai-form">
      <textarea rows="1" maxlength="1500" placeholder="Ask about quests, gold, professions or the site…" aria-label="Your question"></textarea>
      <button class="btn primary small" type="submit">Send</button>
    </form>
    <p class="ai-foot"></p>
  </section>`;
document.body.appendChild(root);
const fab = root.querySelector(".ai-fab"), panel = root.querySelector(".ai-panel"), log = root.querySelector(".ai-log"),
  form = root.querySelector(".ai-form"), box = form.querySelector("textarea"), foot = root.querySelector(".ai-foot"),
  bubble = root.querySelector(".guard-bubble");

function draw() {
  const ai = window.GC_AI;
  const signedIn = ai && ai.signedIn();
  if (!msgs.length) {
    log.innerHTML = `<div class="ai-hello"><img src="images/guard.jpg?v=1" alt="" width="120" height="120" class="guard-hello">
      <p><strong>Halt! Ah, a friend of Bark and Stone.</strong> ${GUARD} of the Stormwind City Watch, at your service.</p>
      <p>Tap a question below, or ${signedIn ? "ask me anything about questing, gold, professions or this site. I can see the guild's guides, market and prices." : `<button type="button" class="linkish" data-ai="signin">sign in</button> and ask me anything about the game or the guild.`}</p></div>`;
  } else {
    log.innerHTML = msgs.map((m) => `<div class="ai-msg ${m.role}">${m.role === "user" ? `<p>${esc(m.content)}</p>` : format(m.content) || '<p class="ai-dots"><span></span><span></span><span></span></p>'}</div>`).join("");
  }
  foot.textContent = left != null ? `${left} question${left === 1 ? "" : "s"} left today · The guard can be wrong, so check anything important.` : "The guard can be wrong, so check anything important.";
  log.scrollTop = log.scrollHeight;
}

function openPanel(prefill) {
  hideBubble();
  panel.hidden = false; fab.setAttribute("aria-expanded", "true"); root.classList.add("open"); draw();
  if (prefill) { box.value = prefill; }
  setTimeout(() => { box.focus(); box.setSelectionRange(box.value.length, box.value.length); grow(); }, 0);
}
function closePanel() { panel.hidden = true; fab.setAttribute("aria-expanded", "false"); root.classList.remove("open"); setTimeout(() => fab.focus(), 0); }
function grow() { box.style.height = "auto"; box.style.height = Math.min(140, box.scrollHeight) + "px"; }

function quick(k, label) {
  msgs.push({ role: "user", content: label }, { role: "assistant", content: localAnswer(k) });
  save(); draw();
}

async function ask(text) {
  const ai = window.GC_AI;
  text = String(text || "").trim(); if (!text || busy) return;
  if (!ai || !ai.signedIn()) {
    msgs.push({ role: "user", content: text }, { role: "assistant", content: "I only take questions like that from sworn members, citizen. Sign in with the button at the top of the page and ask again. Until then, the quick questions below are open to all." });
    box.value = ""; grow(); save(); draw(); return;
  }
  msgs.push({ role: "user", content: text }); box.value = ""; grow();
  const reply = { role: "assistant", content: "" }; msgs.push(reply);
  busy = true; form.querySelector("button").disabled = true; draw();
  try {
    if (ai.demo()) { reply.content = "My full answers only work on the live site (guildcraft-hall.netlify.app), not on this demo copy. The quick questions below work everywhere."; return; }
    const token = await ai.token();
    if (!token) { reply.content = "Please sign in again, citizen."; return; }
    const r = await fetch("/.netlify/functions/ai-chat", {
      method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ messages: msgs.slice(0, -1).slice(-16).filter((m) => m.content), page: ai.page() }),
    });
    if (!r.ok) { let b = {}; try { b = await r.json(); } catch {} reply.content = b.error || "No answer came back. Try again in a moment."; return; }
    const n = Number(r.headers.get("x-questions-left")); if (!Number.isNaN(n)) left = n;
    const reader = r.body.getReader(), dec = new TextDecoder();
    let last = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      reply.content += dec.decode(value, { stream: true });
      if (Date.now() - last > 60) { last = Date.now(); const el = log.lastElementChild; if (el) { el.innerHTML = format(reply.content); log.scrollTop = log.scrollHeight; } }
    }
    reply.content += dec.decode();
  } catch (e) {
    reply.content = (reply.content ? reply.content + "\n\n" : "") + "The connection dropped. Try again.";
  } finally {
    if (!reply.content.trim()) reply.content = "Sorry, I didn't come up with an answer. Try asking another way.";
    busy = false; form.querySelector("button").disabled = false; save(); draw();
  }
}

// Now and then the guard calls out from the corner of the home page (once per visit).
function hideBubble() { bubble.hidden = true; }
function maybeBubble() {
  let seen = false; try { seen = sessionStorage.getItem("gc.guard.hi") === "1"; } catch {}
  if (seen || !panel.hidden || !/^#?(home)?$/.test(location.hash.replace(/^#/, ""))) return;
  try { sessionStorage.setItem("gc.guard.hi", "1"); } catch {}
  bubble.querySelector(".gb-text").textContent = QUIPS[Math.floor(Math.random() * QUIPS.length)];
  bubble.hidden = false;
  setTimeout(hideBubble, 12000);
}
setTimeout(maybeBubble, 5000);

fab.addEventListener("click", () => (panel.hidden ? openPanel() : closePanel()));
form.addEventListener("submit", (e) => { e.preventDefault(); e.stopPropagation(); ask(box.value); });
box.addEventListener("input", grow);
box.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(box.value); } });
panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closePanel(); } });
root.addEventListener("click", (e) => {
  const b = e.target.closest("[data-ai]"); if (!b) { if (e.target.closest(".ai-log a[href^='#']") && window.innerWidth < 640) closePanel(); return; }
  const a = b.dataset.ai;
  if (a === "close") closePanel();
  else if (a === "clear") { msgs = []; save(); draw(); box.focus(); }
  else if (a === "local") quick(b.dataset.k, b.textContent);
  else if (a === "signin" && window.GC_AI) window.GC_AI.signIn();
  else if (a === "bubble") openPanel();
  else if (a === "bubble-x") hideBubble();
});
// Redraw the welcome when someone signs in or out.
window.addEventListener("hashchange", () => { if (!panel.hidden && !msgs.length) draw(); });
window.GC_CHAT = { open: openPanel, ask: (q) => { openPanel(); ask(q); } };
})();
