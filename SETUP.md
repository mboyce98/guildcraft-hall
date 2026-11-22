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

## 7. Make yourself an admin
1. Create your account on the live site.
2. Run in the SQL Editor: `update public.profiles set is_admin = true where username = 'YourUsername';`
3. You can now remove anyone's market listings.

## Limits to know
- Anyone with the link can create an account. Only signed-in members see crafters, requests and listings.
- **Email confirmation is off** (Authentication → Sign In / Providers → Confirm email), because Supabase's built-in sender only allows about 2 emails an hour. Members can sign in right after creating an account. Password-reset emails still use that small allowance; to raise it, connect a free SMTP service such as Resend under **Authentication → Emails → SMTP Settings**.
