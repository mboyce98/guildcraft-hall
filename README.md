# Bark and Stone: GuildCraft Hall

The site for Bark and Stone, an Australian social-first WoW Forever guild: a front page with guild info and titles, the guild rules, and a crafting hub with every craftable recipe (2,215 across 9 professions), who in the guild can make each one, craft requests, and a guild market.

- Plain HTML/CSS/JS, no build step. Live at https://guildcraft-hall.netlify.app/ (deploys automatically from `main` via Netlify) and https://mboyce98.github.io/guildcraft-hall/.
- Accounts and guild data run on Supabase. See [SETUP.md](SETUP.md).
- `recipes.json` comes from Wowhead's WoW Forever database.
- `map.json` holds herb, ore-vein and treasure-chest locations from the same database (fetched 22 Nov 2026), drawn by `map.js` as markers over the guild's world map image (`images/world-map.webp`, artwork © Blizzard Entertainment).
- `serve.ps1` runs a local preview at http://localhost:8080 on Windows.
