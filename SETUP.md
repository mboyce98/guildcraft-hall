# GuildCraft Hall: going live

The site runs in **demo mode** until it's connected to Supabase. In demo mode, accounts and data are saved only in your own browser.

**How it fits together:**
- **GitHub** holds the site's code.
- **Netlify** hosts it for free and redeploys on every push to `main`.
- **Supabase** (free tier) holds accounts, crafter profiles, requests and market listings.

## 1. Create the Supabase project
1. On https://supabase.com click **New project**.
2. Name it `guildcraft-hall`. Click **Generate a password** and save it in your password manager.
3. Pick the region closest to your guild, then click **Create**.

## 2. Create the database
1. Open **SQL Editor**, then **New query**.
2. Paste in all of `supabase-setup.sql` and click **Run**. Only run it once.
3. To check it worked: **Table Editor** should show `profiles`, `crafters`, `requests` and `listings`.

## 3. Connect the site
1. Go to **Project Settings → API Keys** and copy the **Project URL** and the **publishable** (or "anon public") key.
2. Paste both into `BACKEND` at the top of `backend.js`, then commit and push.
3. Never put the **secret** or **service_role** key in the site.

## 4. Put the site online (Netlify)
1. On https://app.netlify.com: **Add new project → Import from GitHub**, pick `guildcraft-hall`, leave build settings empty, click **Deploy**.
2. Your site is at `https://YOUR-PROJECT.netlify.app/`. Every push to `main` redeploys it.

## 5. Tell Supabase where the site lives
1. In Supabase, go to **Authentication → URL Configuration**.
2. Set **Site URL** to the Netlify address and add it under **Redirect URLs**. Sign-up and password-reset emails link back here.

## 6. Link Battle.net accounts (optional)
Members can link their Battle.net account on **My crafter**. It shows a verified BattleTag next to their name and lists their WoW characters to add with one click. The Blizzard secret stays on Netlify, never in the site. The BattleTag and character list come from Blizzard, then each member's page saves them under their own sign-in.

1. Sign in at https://develop.battle.net/access/clients and click **Create client**.
   - **Client name:** GuildCraft Hall
   - **Redirect URL:** `https://guildcraft-hall.netlify.app/.netlify/functions/bnet-callback`
   - **Service URL:** `https://guildcraft-hall.netlify.app`
2. Copy the **Client ID** and **Client Secret**.
3. In Netlify, open the project, then **Project configuration → Environment variables → Add a variable**, and add:
   - `BNET_CLIENT_ID`: the Client ID
   - `BNET_CLIENT_SECRET`: the Client Secret
   - `BNET_REGION` (optional): `us` (default), `eu`, `kr` or `tw`
4. In Netlify, go to **Deploys → Trigger deploy → Deploy project** so the new variables take effect.

Blizzard's API lists WoW Forever characters (namespace `profile-forever-us`, confirmed November 2026). Retail and Classic characters on the same account show up too, labelled by game. If a list comes back empty, members can still add characters by hand.

To check the settings at any time, open `/.netlify/functions/bnet-start?check=1`. It shows the public Client ID and whether the Blizzard secret works, never the secret itself.

## 6b. Request Board, profiles and notifications
Run `supabase-board-profiles.sql` once in the SQL Editor (after `supabase-setup.sql`). It adds profile fields (main character, class, Discord, play times, bio), the public `board_posts` table and the "last read" time for notifications. Only the poster can edit a board post; anyone else can only take an open job for themselves, give it back, or mark their job done.

## 6c. Chat and profile pictures
Run `supabase-chat-avatars.sql` once. It adds chat threads on requests and board posts (a private request's chat is visible only to its two people) and an `avatars` storage bucket where each member can only change their own picture.

## 6d. Discord (optional)
**Join button:** paste your guild's invite link into `GUILD.discordInvite` at the top of `app.js` (e.g. `https://discord.gg/abc123`) and push. A "Join our Discord" button appears on the front page.

**"Continue with Discord" sign-in:**
1. At https://discord.com/developers/applications click **New Application**, name it "Bark and Stone".
2. Under **OAuth2**, add the redirect `https://aclhzgtyucqxekzuahyx.supabase.co/auth/v1/callback` and copy the **Client ID** and **Client Secret**.
3. In Supabase, **Authentication → Sign In / Providers → Discord**: switch it on and paste both values.
The button appears in the sign-in box automatically once it's on.

## 7. Make yourself an admin
1. Create your account on the live site.
2. Run in the SQL Editor: `update public.profiles set is_admin = true where username = 'YourUsername';`
3. You can now remove anyone's market listings.

## Limits to know
- Anyone with the link can create an account. Only signed-in members see crafters, requests and listings.
- **Email confirmation is off** (Authentication → Sign In / Providers → Confirm email), because Supabase's built-in sender only allows about 2 emails an hour. Members can sign in right after creating an account. Password-reset emails still use that small allowance; to raise it, connect a free SMTP service such as Resend under **Authentication → Emails → SMTP Settings**.

## Guild helper (AI chat)

The Ask button on every page uses Claude through `netlify/functions/ai-chat.mjs`.

1. Create an API key at https://platform.claude.com (Settings, API keys) and add billing credit.
2. In Netlify: Site configuration, Environment variables, add `ANTHROPIC_API_KEY` with that key. Then redeploy.
3. Run `supabase-guides.sql` in Supabase once (guides, price reports and the 30-questions-a-day limit).

Only signed-in members can ask. Each member gets 30 questions a day.

## Guild events (website and Discord)

1. Run `supabase-events.sql` in the Supabase SQL Editor (already done for the live site).
2. On the site's Admin page → Discord bot, press **Set up slash commands** again so Discord gets the new `/event`, `/events` and `/eventchannel` commands.
3. In Discord, go to the channel where events should appear and type `/eventchannel` (needs Manage Server). Pick the guild's time zone there too; it's used to read times typed in Discord like `Sat 8pm`.

Then:
- `/event title:Deadmines when:Sat 8pm` plans an event from Discord. The bot posts it with **Tank / Healer / Damage / Maybe / Can't make it** buttons.
- Events planned on the website (Events page → Plan an event) are posted to the events channel the same way.
- Sign-ups from the buttons and from the website land in the same list, and the Discord post updates when people sign up on the site.

## Sign in with Discord, and linking Discord to an account

So Discord sign-ups count as the right guild member, members link Discord on their profile page. To switch this on:
1. Discord Developer Portal → your bot's application → **OAuth2**: add the redirect `https://aclhzgtyucqxekzuahyx.supabase.co/auth/v1/callback`, and copy the **Client ID** and **Client Secret**.
2. Supabase → Authentication → Sign In / Providers → **Discord**: turn it on and paste the Client ID and Secret.
3. Supabase → Authentication → Sign In / Providers → turn on **Allow manual linking** (lets existing members link Discord from their profile).
The "Sign in with Discord" button appears on the site's sign-in box by itself once Discord is turned on.

## Discord feed channel

Run `supabase-feed.sql` and `supabase-feed-bot.sql` once (already done for the live site). **No Discord admin needed:** a website admin can pick the feed and events channels on the Admin page → Discord bot → Channels, and the bot posts there itself. Discord admins can also type `/feedchannel` in the channel that should get new market listings, Request Board jobs, guild news, guides, events and new members. The bot needs the **Manage Webhooks** permission for that (re-invite it from the Admin page, or give its role the permission). Choose what gets posted on the Admin page → Discord bot.

## Merchant Row (adverts)

Run `supabase-adverts.sql` once in the Supabase SQL Editor. Merchant Row shows on the Market, Recipes, Request Board and Crafting requests pages.

- Members press **Advertise here**, pick one of five merchant characters (images/merchants/), and post an advert that runs for 1 or 2 weeks. Each member can have 2 running at a time, and admins can remove any advert.
- When fewer than four adverts are running, house merchants fill the row by calling out the latest guild market listings.

## Achievements

Run `supabase-achievements.sql` once in the Supabase SQL Editor. It creates the tables, the guild master rules and 59 starter achievements (`achievements-default.json`, also used by the demo).

- **The guild master is the ruling authority.** That is whoever has the **Thane** rank (set by admins on the Admin page). Only they can create, edit or retire achievements, approve or deny claims, award honours, and revoke anything. The database enforces this.
- **Site achievements** (Getting started, Leveling, Crafting, Trade, Guild life) are earned automatically as members use the site, on any page. A revoked one stays revoked.
- **Guild deeds** (Dungeons, Raids, Adventure): members press **I did this** and get them straight away. Only Recruiter, Ahn'Qiraj and Naxxramas are claimed with a note and wait for the guild master on the Guild master tab. The guild master can change any achievement's type in the achievement book, and can revoke any achievement.
- **Honours** (Guild master's honours) can only be given by the guild master.
- Members see their points, progress bars and rank. The Hall of fame shows the leaderboard and recently earned achievements, and badges appear on member profiles.
