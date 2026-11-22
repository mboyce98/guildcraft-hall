// Guild events in Discord: the event post (with sign-up buttons) and reading times like "Sat 8pm".
const KIND_COLOR = { Dungeon: 0x4f92dc, Raid: 0xa335ee, Farming: 0x5fd47e, Leveling: 0xe3b55b, PvP: 0xd9534f, Social: 0xf0a04b, Other: 0x9aa0a6 };
const KIND_ICON = { Dungeon: "🗝️", Raid: "🐉", Farming: "⛏️", Leveling: "📜", PvP: "⚔️", Social: "🍺", Other: "📅" };
const ROLE_ICON = { Tank: "🛡️", Healer: "💚", Damage: "🗡️" };
const clip = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

// Who's in: "coming" in sign-up order fills the spots; anyone past the size waits on standby.
function roster(ev) {
  const yes = ev.signups.filter((s) => s.status === "yes");
  return { inn: yes.slice(0, ev.size), standby: yes.slice(ev.size), maybe: ev.signups.filter((s) => s.status === "maybe"), no: ev.signups.filter((s) => s.status === "no") };
}

function eventMessage(ev, site) {
  const t = Math.floor(Date.parse(ev.starts_at) / 1000), end = t + ev.duration_min * 60;
  const over = end * 1000 < Date.now(), closed = ev.cancelled || over;
  const r = roster(ev);
  const names = (list) => clip(list.map((s) => s.name).join(", "), 1000);
  const byRole = (role) => r.inn.filter((s) => s.role === role);
  const hrs = ev.duration_min >= 60 ? `${+(ev.duration_min / 60).toFixed(1)} h` : `${ev.duration_min} min`;
  const fields = ["Tank", "Healer", "Damage"].map((role) => ({ name: `${ROLE_ICON[role]} ${role === "Damage" ? "Damage" : role + "s"} (${byRole(role).length})`, value: names(byRole(role)) || "—", inline: true }));
  if (r.standby.length) fields.push({ name: `Standby (${r.standby.length})`, value: names(r.standby) });
  if (r.maybe.length) fields.push({ name: `Maybe (${r.maybe.length})`, value: names(r.maybe) });
  if (r.no.length) fields.push({ name: `Can't make it (${r.no.length})`, value: names(r.no) });
  const embed = {
    title: clip(`${ev.cancelled ? "CANCELLED: " : ""}${KIND_ICON[ev.kind] || "📅"} ${ev.title}`, 250),
    url: `${site}/#event-${ev.id}`,
    color: ev.cancelled ? 0x6b6b6b : KIND_COLOR[ev.kind] || 0xe3b55b,
    description: [
      `**<t:${t}:F>** (<t:${t}:R>) · ${hrs}`,
      [ev.kind, ev.location].filter(Boolean).join(" · "),
      ev.note ? "\n" + clip(ev.note, 900) : "",
    ].filter(Boolean).join("\n"),
    fields,
    footer: { text: `${r.inn.length}/${ev.size} going${ev.host_name ? " · hosted by " + ev.host_name : ""}${closed ? "" : " · sign up below or on the website"}` },
  };
  const components = [];
  if (!closed) components.push({ type: 1, components: [
    { type: 2, style: 1, custom_id: `ev:${ev.id}:yes:Tank`, label: "Tank", emoji: { name: "🛡️" } },
    { type: 2, style: 1, custom_id: `ev:${ev.id}:yes:Healer`, label: "Healer", emoji: { name: "💚" } },
    { type: 2, style: 1, custom_id: `ev:${ev.id}:yes:Damage`, label: "Damage", emoji: { name: "🗡️" } },
    { type: 2, style: 2, custom_id: `ev:${ev.id}:maybe`, label: "Maybe" },
    { type: 2, style: 4, custom_id: `ev:${ev.id}:no`, label: "Can't make it" },
  ] });
  components.push({ type: 1, components: [{ type: 2, style: 5, label: "Open on the website", url: `${site}/#event-${ev.id}` }] });
  return { embeds: [embed], components, allowed_mentions: { parse: [] } };
}

// ---- Times: "Sat 8pm", "tomorrow 19:30", "11/28 8:30pm", "2026-11-28 20:00", in the guild's time zone ----
function tzOffset(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(ms)).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - ms;
}
function zoned(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo, d, h, mi);
  let t = guess - tzOffset(guess, tz);
  t = guess - tzOffset(t, tz); // settle across daylight-saving changes
  return t;
}
function todayIn(tz, now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", weekday: "short" })
    .formatToParts(new Date(now)).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month) - 1, d: Number(p.day), wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function parseWhen(text, tz, now = Date.now()) {
  let s = String(text || "").toLowerCase().trim();
  const stamp = s.match(/<t:(\d{9,11})(?::\w)?>/); if (stamp) return Number(stamp[1]) * 1000;
  const today = todayIn(tz, now);
  let y = today.y, m = today.m, d = today.d, dateGiven = false, k;
  if ((k = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +k[1]; m = +k[2] - 1; d = +k[3]; dateGiven = true; s = s.replace(k[0], " "); }
  else if ((k = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    m = +k[1] - 1; d = +k[2]; y = k[3] ? (k[3].length === 2 ? 2000 + +k[3] : +k[3]) : today.y; dateGiven = true; s = s.replace(k[0], " ");
    if (!k[3] && zoned(y, m, d, 23, 59, tz) < now) y++;
  } else if (/\btomorrow\b/.test(s)) { const t = new Date(Date.UTC(y, m, d + 1)); y = t.getUTCFullYear(); m = t.getUTCMonth(); d = t.getUTCDate(); dateGiven = true; s = s.replace("tomorrow", " "); }
  else if (/\b(today|tonight)\b/.test(s)) { dateGiven = true; s = s.replace(/\b(today|tonight)\b/, " "); }
  else {
    const w = DAYS.findIndex((x) => new RegExp("\\b" + x + "[a-z]*\\b").test(s));
    if (w >= 0) {
      let add = (w - today.wd + 7) % 7;
      const t = new Date(Date.UTC(y, m, d + add)); y = t.getUTCFullYear(); m = t.getUTCMonth(); d = t.getUTCDate(); dateGiven = true;
      s = s.replace(new RegExp("\\b" + DAYS[w] + "[a-z]*\\b"), " ");
      if (/\bnext\b/.test(s) && add === 0) { const t2 = new Date(Date.UTC(y, m, d + 7)); y = t2.getUTCFullYear(); m = t2.getUTCMonth(); d = t2.getUTCDate(); }
    }
  }
  const tm = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\b/) || (/\bnoon\b/.test(s) ? [0, "12", "00", "pm"] : null);
  if (!tm) return null;
  let h = +tm[1]; const mi = +(tm[2] || 0), ap = tm[3] ? tm[3][0] : "";
  if (h > 23 || mi > 59 || (ap && (h < 1 || h > 12))) return null;
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  if (!ap && h >= 1 && h <= 11) h += 12; // "Sat 8" or "Sat 8:30" means the evening (use "am" for mornings)
  let t = zoned(y, m, d, h, mi, tz);
  if (!dateGiven && t < now) t = zoned(y, m, d + 1, h, mi, tz); // "9pm" after 9pm means tomorrow
  if (dateGiven && t < now && !/\d{4}-/.test(String(text))) {
    // A weekday that's already passed today ("Sat 8pm" on Saturday night) means next week.
    if (DAYS.some((x) => new RegExp("\\b" + x).test(String(text).toLowerCase()))) t = zoned(y, m, d + 7, h, mi, tz);
  }
  return t;
}

const TIMEZONES = [
  { name: "Eastern (New York)", value: "America/New_York" }, { name: "Central (Chicago)", value: "America/Chicago" },
  { name: "Mountain (Denver)", value: "America/Denver" }, { name: "Arizona (Phoenix)", value: "America/Phoenix" },
  { name: "Pacific (Los Angeles)", value: "America/Los_Angeles" }, { name: "UK (London)", value: "Europe/London" },
  { name: "Central Europe (Berlin)", value: "Europe/Berlin" }, { name: "Australia East (Sydney)", value: "Australia/Sydney" },
];

module.exports = { eventMessage, parseWhen, roster, TIMEZONES, KIND_ICON };
