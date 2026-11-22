/* Bark and Stone guild helper: an AI chat that floats on every page (bottom right). Talks to /.netlify/functions/ai-chat. */
(() => {
"use strict";
const KEY = "gc.ai.history";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.slice(-30) : []; } catch { return []; } };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-30))); } catch {} };
let msgs = load(), busy = false, left = null;

const SUGGEST = [
  "Where should I quest from level 30 to 40?",
  "What's a good gold route for a miner?",
  "What are Arcanite Bars selling for?",
  "How do I sell something on the guild market?",
];

// Light formatting for answers: **bold**, "- " bullets, line breaks, and clickable links.
function format(text) {
  const link = (s) => s
    .replace(/(https?:\/\/[^\s<)]+[^\s<).,!?;:'"])/g, (u) => `<a href="${u}" ${u.startsWith(location.origin) || /guildcraft-hall\.netlify\.app/.test(u) ? "" : 'target="_blank" rel="noopener"'}>${u.replace(/^https?:\/\/(www\.)?/, "").replace(/^guildcraft-hall\.netlify\.app\/?/, "")}</a>`)
    .replace(/(^|[\s(])(#(?:home|rules|chronicle|classes|members|messages|guides|prices|guide-\d+|map|cities|loot|recipes|mine|requests|board|market|profile))\b/g, '$1<a href="$2">$2</a>');
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
  <button class="ai-fab" type="button" aria-expanded="false" aria-controls="ai-panel" title="Ask the guild helper">
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-4.5 3.6A.6.6 0 0 1 3.5 21V18H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm4 6.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm4 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm4 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z"/></svg>
    <span>Ask</span></button>
  <section class="ai-panel" id="ai-panel" role="dialog" aria-label="Guild helper" hidden>
    <header class="ai-head">
      <div><strong>Guild helper</strong><span class="ai-sub">Game advice and help with the site</span></div>
      <button type="button" class="ai-icon" data-ai="clear" title="Start a new conversation" aria-label="Start a new conversation">↺</button>
      <button type="button" class="ai-icon" data-ai="close" title="Close" aria-label="Close">✕</button>
    </header>
    <div class="ai-log" aria-live="polite"></div>
    <form class="ai-form">
      <textarea rows="1" maxlength="1500" placeholder="Ask about quests, gold, professions or the site…" aria-label="Your question"></textarea>
      <button class="btn primary small" type="submit">Send</button>
    </form>
    <p class="ai-foot"></p>
  </section>`;
document.body.appendChild(root);
const fab = root.querySelector(".ai-fab"), panel = root.querySelector(".ai-panel"), log = root.querySelector(".ai-log"),
  form = root.querySelector(".ai-form"), box = form.querySelector("textarea"), foot = root.querySelector(".ai-foot");

function draw() {
  const ai = window.GC_AI;
  const signedIn = ai && ai.signedIn();
  if (!msgs.length) {
    log.innerHTML = `<div class="ai-hello"><p>Hi! I'm the Bark and Stone helper. Ask me about questing, gathering, professions, gold making, or how to use this site. I can see the guild's guides, market and reported prices.</p>
      ${signedIn ? `<div class="ai-sugg">${SUGGEST.map((s) => `<button type="button" class="chip" data-ai="ask">${esc(s)}</button>`).join("")}</div>`
        : `<p><button type="button" class="btn small primary" data-ai="signin">Sign in</button> to ask questions. The helper is for guild members.</p>`}</div>`;
  } else {
    log.innerHTML = msgs.map((m) => `<div class="ai-msg ${m.role}">${m.role === "user" ? `<p>${esc(m.content)}</p>` : format(m.content) || '<p class="ai-dots"><span></span><span></span><span></span></p>'}</div>`).join("");
  }
  foot.textContent = left != null ? `${left} question${left === 1 ? "" : "s"} left today · Answers can be wrong, so check anything important.` : "Answers can be wrong, so check anything important.";
  log.scrollTop = log.scrollHeight;
}

function openPanel(prefill) {
  panel.hidden = false; fab.setAttribute("aria-expanded", "true"); root.classList.add("open"); draw();
  if (prefill) { box.value = prefill; }
  setTimeout(() => { box.focus(); box.setSelectionRange(box.value.length, box.value.length); grow(); }, 0);
}
function closePanel() { panel.hidden = true; fab.setAttribute("aria-expanded", "false"); root.classList.remove("open"); setTimeout(() => fab.focus(), 0); }
function grow() { box.style.height = "auto"; box.style.height = Math.min(140, box.scrollHeight) + "px"; }

async function ask(text) {
  const ai = window.GC_AI;
  text = String(text || "").trim(); if (!text || busy) return;
  if (!ai || !ai.signedIn()) { if (ai) ai.signIn(); return; }
  msgs.push({ role: "user", content: text }); box.value = ""; grow();
  const reply = { role: "assistant", content: "" }; msgs.push(reply);
  busy = true; form.querySelector("button").disabled = true; draw();
  try {
    if (ai.demo()) { reply.content = "The guild helper works on the live site (guildcraft-hall.netlify.app), not on this demo copy."; return; }
    const token = await ai.token();
    if (!token) { reply.content = "Please sign in again to ask the helper."; return; }
    const r = await fetch("/.netlify/functions/ai-chat", {
      method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ messages: msgs.slice(0, -1).slice(-16).filter((m) => m.content), page: ai.page() }),
    });
    if (!r.ok) { let b = {}; try { b = await r.json(); } catch {} reply.content = b.error || "The helper didn't answer. Try again in a moment."; return; }
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
  else if (a === "ask") ask(b.textContent);
  else if (a === "signin" && window.GC_AI) window.GC_AI.signIn();
});
// Redraw the welcome when someone signs in or out.
window.addEventListener("hashchange", () => { if (!panel.hidden && !msgs.length) draw(); });
window.GC_CHAT = { open: openPanel, ask: (q) => { openPanel(); ask(q); } };
})();
