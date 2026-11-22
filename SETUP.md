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

## 6. Make yourself an admin
1. Create your account on the live site.
2. Run in the SQL Editor: `update public.profiles set is_admin = true where username = 'YourUsername';`
3. You can now remove anyone's market listings.

## Limits to know
- Anyone with the link can create an account. Only signed-in members see crafters, requests and listings.
- Supabase's built-in email sender allows only a few emails per hour. For a big guild, connect a free SMTP service such as Resend under **Authentication → Emails → SMTP Settings**.
