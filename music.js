/* Bark and Stone — tavern music.
   Plays "Stormwind - Music & Ambience - World of Warcraft" (uploaded by Everness on YouTube) through the
   YouTube player, with each chapter of the video as a track. The small video stays visible in the dock
   while music is on, as YouTube's terms ask. Nothing loads from YouTube until someone opens the player. */
(() => {
"use strict";
const VIDEO = "roMWEeV2P4U";
const LENGTH = 3600;
const RAW = `0|[OST] Stormwind
147|[Cataclysm] Stormwind 3
257|Stormwind 3
328|Stormwind High Seas
461|Alliance Battle March 1
583|For the Alliance 1
713|Stormwind 8
785|[OST] Slaughtered Lamb
941|Stormwind 5
1004|Stormwind 7
1093|Anduin 1A1
1172|Canticle of Sacrifice A
1422|[Cataclysm] Stormwind 1
1500|For the Alliance 2
1605|Stormwind 6
1661|Alliance Battle March 1
1783|[OST] Pig and Whistle
1940|Stormwind Intro
2011|Stormwind 4
2074|Stormwind 1
2130|[Cataclysm] Stormwind 3
2250|Anduin 1D
2344|For the Alliance 3
2414|Stormwind 2
2451|Alliance Battle March 2
2572|Stormwind 3
2644|Stormwind High Seas
2777|[Cataclysm] Stormwind 4
2845|For the Alliance 1
2976|Stormwind 8
3045|[OST] Lion's Pride
3185|Stormwind 5
3248|Stormwind 7
3334|Anduin 1H2
3452|Canticle of Sacrifice D`;
const TRACKS = RAW.split("\n").map((l, i, a) => {
  const [s, name] = l.split("|"); const next = a[i + 1] ? Number(a[i + 1].split("|")[0]) : LENGTH;
  return { start: Number(s), end: next, name };
});

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mmss = (t) => { t = Math.max(0, Math.floor(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
const trackAt = (t) => { let k = 0; TRACKS.forEach((x, i) => { if (t >= x.start) k = i; }); return k; };

// Remembered between visits: volume, where you were, shuffle.
const KEY = "gc.music";
let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
const st = { vol: saved.vol ?? 40, muted: !!saved.muted, t: saved.t || 0, shuffle: !!saved.shuffle, open: false, ready: false, playing: false, cur: trackAt(saved.t || 0), dragging: false };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ vol: st.vol, muted: st.muted, t: Math.floor(st.t), shuffle: st.shuffle })); } catch {} };

// Header button.
const bar = document.querySelector(".bell-wrap"); if (!bar) return;
const wrap = document.createElement("div"); wrap.className = "bell-wrap";
wrap.innerHTML = `<button class="bell music-btn" id="music-btn" type="button" aria-label="Tavern music" title="Tavern music" aria-expanded="false">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 18.5a3 3 0 1 1-2-2.83V5.5l12-2.5v12a3 3 0 1 1-2-2.83V7.4l-8 1.67z" fill="currentColor"/></svg>
  <span class="music-eq" aria-hidden="true"><i></i><i></i><i></i></span></button>`;
bar.parentNode.insertBefore(wrap, bar);
const btn = wrap.querySelector("#music-btn");

// The dock: built on first open.
let dock = null, player = null, tick = null;
function build() {
  dock = document.createElement("section");
  dock.className = "music-dock"; dock.id = "music-dock"; dock.setAttribute("aria-label", "Tavern music");
  dock.innerHTML = `
    <div class="md-top">
      <div class="md-video"><div id="md-yt"></div></div>
      <div class="md-now">
        <p class="eyebrow">Tavern music</p>
        <strong id="md-title">${esc(TRACKS[st.cur].name)}</strong>
        <span class="muted" id="md-sub">Track ${st.cur + 1} of ${TRACKS.length}</span>
      </div>
      <button class="md-x" type="button" data-md="min" aria-label="Shrink the player" title="Shrink">▾</button>
    </div>
    <div class="md-seek">
      <span class="num" id="md-pos">0:00</span>
      <input type="range" id="md-seek" min="0" max="100" step="1" value="0" aria-label="Position in this track">
      <span class="num" id="md-len">0:00</span>
    </div>
    <div class="md-ctrls">
      <button type="button" class="md-b" data-md="shuffle" aria-pressed="${st.shuffle}" title="Shuffle" aria-label="Shuffle">⤮</button>
      <button type="button" class="md-b" data-md="prev" title="Previous track" aria-label="Previous track">⏮</button>
      <button type="button" class="md-b md-play" data-md="play" title="Play" aria-label="Play">▶</button>
      <button type="button" class="md-b" data-md="next" title="Next track" aria-label="Next track">⏭</button>
      <div class="md-vol">
        <button type="button" class="md-b" data-md="mute" title="Mute" aria-label="Mute">🔊</button>
        <input type="range" id="md-vol" min="0" max="100" step="1" value="${st.vol}" aria-label="Volume">
      </div>
    </div>
    <details class="md-list"><summary>All tracks <span class="muted num">${TRACKS.length}</span> <span class="muted num" id="md-all">0:00 / 60:00</span></summary>
      <ol>${TRACKS.map((x, i) => `<li><button type="button" data-track="${i}"><span class="num muted">${i + 1}</span><span>${esc(x.name)}</span><span class="num muted">${mmss(x.end - x.start)}</span></button></li>`).join("")}</ol>
    </details>
    <p class="md-credit muted">Music: <a href="https://www.youtube.com/watch?v=${VIDEO}" target="_blank" rel="noopener">Stormwind – Music &amp; Ambience</a> by <a href="https://www.youtube.com/@Everness1" target="_blank" rel="noopener">Everness</a> on YouTube. World of Warcraft music © Blizzard Entertainment.</p>`;
  document.body.appendChild(dock);

  dock.addEventListener("click", (e) => {
    const b = e.target.closest("[data-md]"); const tr = e.target.closest("[data-track]");
    if (tr) { goTrack(Number(tr.dataset.track), true); return; }
    if (!b) return;
    const a = b.dataset.md;
    if (a === "min") setOpen(false);
    else if (a === "play") toggle();
    else if (a === "prev") { const into = st.t - TRACKS[st.cur].start; goTrack(into > 4 ? st.cur : st.cur - 1, true); }
    else if (a === "next") goTrack(st.shuffle ? randomTrack() : st.cur + 1, true);
    else if (a === "shuffle") { st.shuffle = !st.shuffle; b.setAttribute("aria-pressed", String(st.shuffle)); save(); }
    else if (a === "mute") { st.muted = !st.muted; applyVol(); save(); }
  });
  const seek = dock.querySelector("#md-seek");
  seek.addEventListener("input", () => { st.dragging = true; dock.querySelector("#md-pos").textContent = mmss(Number(seek.value)); });
  seek.addEventListener("change", () => { st.dragging = false; seekTo(TRACKS[st.cur].start + Number(seek.value)); });
  const vol = dock.querySelector("#md-vol");
  vol.addEventListener("input", () => { st.vol = Number(vol.value); if (st.vol > 0) st.muted = false; applyVol(); });
  vol.addEventListener("change", save);
  dock.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });

  loadApi();
  paint();
}

function loadApi() {
  const make = () => {
    player = new YT.Player("md-yt", {
      width: 160, height: 90, videoId: VIDEO,
      playerVars: { start: Math.floor(st.t), rel: 0, modestbranding: 1, playsinline: 1, controls: 0, disablekb: 1, iv_load_policy: 3 },
      events: {
        onReady: () => { st.ready = true; applyVol(); paint(); },
        onStateChange: (e) => {
          st.playing = e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.BUFFERING;
          if (e.data === YT.PlayerState.ENDED) { goTrack(st.shuffle ? randomTrack() : 0, true); return; }
          paint();
        },
        onError: () => { const s = dock.querySelector("#md-sub"); if (s) s.textContent = "YouTube couldn't play this here. Try the link below."; },
      },
    });
  };
  if (window.YT && window.YT.Player) return make();
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => { if (prev) try { prev(); } catch {} make(); };
  const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.async = true; document.head.appendChild(s);
}

function applyVol() {
  if (dock) {
    const m = dock.querySelector('[data-md="mute"]');
    m.textContent = st.muted || st.vol === 0 ? "🔇" : st.vol < 50 ? "🔉" : "🔊";
    m.setAttribute("aria-label", st.muted ? "Unmute" : "Mute");
    dock.querySelector("#md-vol").style.setProperty("--fill", `${st.muted ? 0 : st.vol}%`);
  }
  if (!st.ready) return;
  player.setVolume(st.vol);
  st.muted ? player.mute() : player.unMute();
}

function randomTrack() { if (TRACKS.length < 2) return 0; let k; do { k = Math.floor(Math.random() * TRACKS.length); } while (k === st.cur); return k; }
function seekTo(t) { st.t = t; st.cur = trackAt(t); if (st.ready) { player.seekTo(t, true); } save(); paint(); }
function goTrack(i, play) {
  i = (i + TRACKS.length) % TRACKS.length;
  seekTo(TRACKS[i].start);
  if (play && st.ready) player.playVideo();
}
function toggle() {
  if (!st.ready) return;
  st.playing ? player.pauseVideo() : player.playVideo();
}

// Keep the sliders and title in step with the player.
function poll() {
  if (!st.ready || !st.playing) return;
  const t = player.getCurrentTime ? player.getCurrentTime() : st.t;
  const k = trackAt(t);
  if (k !== st.cur && st.shuffle && k === st.cur + 1) { st.cur = k; goTrack(randomTrack(), true); return; }
  st.t = t; st.cur = k;
  paint();
  if (Math.floor(t) % 5 === 0) save();
}

function paint() {
  btn.classList.toggle("on", st.playing);
  if (!dock) return;
  dock.classList.toggle("gone", !st.open && !st.playing);
  const tr = TRACKS[st.cur];
  dock.querySelector("#md-title").textContent = tr.name;
  dock.querySelector("#md-sub").textContent = st.ready ? `Track ${st.cur + 1} of ${TRACKS.length}` : "Tuning the lutes…";
  const p = dock.querySelector('[data-md="play"]');
  p.textContent = st.playing ? "❚❚" : "▶"; p.setAttribute("aria-label", st.playing ? "Pause" : "Play"); p.title = st.playing ? "Pause" : "Play";
  p.disabled = !st.ready;
  const seek = dock.querySelector("#md-seek"); const len = tr.end - tr.start; const into = Math.min(len, Math.max(0, st.t - tr.start));
  seek.max = String(len);
  if (!st.dragging) { seek.value = String(Math.floor(into)); dock.querySelector("#md-pos").textContent = mmss(into); }
  seek.style.setProperty("--fill", `${(into / len) * 100}%`);
  dock.querySelector("#md-len").textContent = mmss(len);
  dock.querySelector("#md-all").textContent = `${mmss(st.t)} / ${mmss(LENGTH)}`;
  dock.querySelectorAll("[data-track]").forEach((b) => b.classList.toggle("cur", Number(b.dataset.track) === st.cur));
}

function setOpen(open) {
  st.open = open;
  if (open && !dock) build();
  if (dock) dock.classList.toggle("mini", !open);
  paint();
  btn.setAttribute("aria-expanded", String(open));
  if (open && !tick) tick = setInterval(poll, 500);
}
btn.addEventListener("click", () => setOpen(!st.open || (dock && dock.classList.contains("mini"))));
// The shrunk dock still shows the video, the title and play/pause; clicking its title opens it again.
document.addEventListener("click", (e) => { if (dock && dock.classList.contains("mini") && e.target.closest("#md-title, .md-now .eyebrow")) setOpen(true); });
window.addEventListener("pagehide", save);

window.GC_MUSIC = { open: () => setOpen(true), tracks: TRACKS };
})();
