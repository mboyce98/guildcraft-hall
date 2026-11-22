// World news for the home page: Wowhead's public news RSS, trimmed to headline, teaser, picture and link.
// Netlify's CDN keeps a copy for an hour, so Wowhead sees at most one request an hour from the site.
const FEED = "https://www.wowhead.com/news/rss/all";

const decode = (s) => String(s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
  .replace(/&amp;/g, "&");
const text = (html) => decode(html).replace(/<[^>]+>/g, " ").replace(/Continue reading\s*»/gi, "").replace(/\s+/g, " ").trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? m[1] : ""; };

exports.handler = async () => {
  try {
    const r = await fetch(FEED, { headers: { "user-agent": "BarkAndStoneGuildSite/1.0 (news reader)" } });
    if (!r.ok) throw new Error("feed " + r.status);
    const xml = await r.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 30).map(([, it]) => {
      const link = decode(tag(it, "link")).trim();
      const img = (it.match(/<media:content[^>]*url="([^"]+)"/) || [])[1] || "";
      let teaser = text(tag(it, "description"));
      if (teaser.length > 220) teaser = teaser.slice(0, 217).replace(/\s+\S*$/, "") + "…";
      return {
        title: text(tag(it, "title")), link: /^https:\/\/www\.wowhead\.com\//.test(link) ? link : "",
        teaser, category: text(tag(it, "category")), image: /^https:\/\/wow\.zamimg\.com\//.test(img) ? img : "",
        date: Date.parse(text(tag(it, "pubDate"))) || null,
      };
    }).filter((x) => x.title && x.link);
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json", "cache-control": "public, max-age=900",
        "netlify-cdn-cache-control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
      body: JSON.stringify({ source: "Wowhead", fetched: Date.now(), items }),
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 502, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify({ error: "World news didn't load. Try again later." }) };
  }
};
