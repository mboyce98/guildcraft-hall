/* Bark and Stone — front-page picture slideshow.
   Slides are the <figure class="gal-slide"> elements in index.html: add a figure to add a picture. */
(() => {
"use strict";
const root = document.getElementById("gallery"); if (!root) return;
const slides = [...root.querySelectorAll(".gal-slide")];
const dots = document.getElementById("gal-dots");
const count = document.getElementById("gal-count");
const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let i = 0, timer = null, paused = false;

dots.innerHTML = slides.map((s, n) => `<button type="button" role="tab" data-gal-dot="${n}" aria-label="Picture ${n + 1}: ${s.querySelector("figcaption").textContent}"></button>`).join("");

function show(n) {
  i = (n + slides.length) % slides.length;
  slides.forEach((s, k) => { s.classList.toggle("on", k === i); s.setAttribute("aria-hidden", String(k !== i)); });
  dots.querySelectorAll("button").forEach((d, k) => d.setAttribute("aria-selected", String(k === i)));
  count.textContent = `${i + 1} / ${slides.length}`;
}
function play() { clearInterval(timer); if (!still && !paused) timer = setInterval(() => { if (!document.hidden && !document.getElementById("view-home").hidden) show(i + 1); }, 6000); }

root.addEventListener("click", (e) => {
  const b = e.target.closest("[data-gal]"); const d = e.target.closest("[data-gal-dot]");
  if (b) { show(i + (b.dataset.gal === "next" ? 1 : -1)); play(); }
  else if (d) { show(Number(d.dataset.galDot)); play(); }
  else if (e.target.closest(".gal-slide img")) openBig(slides[i]);
});
root.addEventListener("mouseenter", () => { paused = true; clearInterval(timer); });
root.addEventListener("mouseleave", () => { paused = false; play(); });
root.addEventListener("focusin", () => { paused = true; clearInterval(timer); });
root.addEventListener("focusout", () => { paused = false; play(); });
root.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { show(i + 1); } else if (e.key === "ArrowLeft") { show(i - 1); } });
// Swipe on phones.
let x0 = null;
root.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
root.addEventListener("touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) { show(i + (dx < 0 ? 1 : -1)); play(); } x0 = null; });

// Full-size view when a picture is clicked.
function openBig(slide) {
  let box = document.getElementById("gal-big");
  if (!box) {
    box = document.createElement("div"); box.id = "gal-big"; box.className = "modal gal-big"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    box.addEventListener("click", (e) => { if (!e.target.closest("img") || e.target.closest("[data-close]")) box.hidden = true; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !box.hidden) box.hidden = true; });
    document.body.appendChild(box);
  }
  const img = slide.querySelector("img");
  box.innerHTML = `<figure><img src="${img.getAttribute("src")}" alt="${img.alt.replace(/"/g, "&quot;")}"><figcaption>${slide.querySelector("figcaption").textContent}</figcaption></figure><button class="btn small" data-close>Close</button>`;
  box.hidden = false;
}

show(0); play();
})();
