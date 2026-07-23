# Deploying Urban Night Lift

Goes from the code in this repo to a live site on your own domain. Recommended host:
**Vercel** (free tier, native Next.js). You only need your GitHub account and, for the
domain, access to your domain registrar.

There is nothing to run on your own computer — the database is set up by a GitHub Action.

---

## 1. Set up the database (one time)

Your Supabase **Auth users** and **Storage buckets** already exist. Only the database
schema + seed data still need to be applied. A GitHub Action does this for you.

1. In this repo on GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**, and add these 7 secrets (values come from your Supabase project):

   | Secret | Where to get it |
   |---|---|
   | `DATABASE_URL` | Supabase → Connect → Transaction pooler URI (port 6543). Append `?pgbouncer=true`. URL-encode `@` in the password as `%40`. |
   | `DIRECT_URL` | Supabase → Connect → Session pooler URI (port 5432). |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API → the `sb_publishable_...` key |
   | `SUPABASE_SECRET_KEY` | Supabase → API → the `sb_secret_...` key |
   | `SEED_ADMIN_PASSWORD` | A password for the owner login |
   | `SEED_RIDER_PASSWORD` | A password for the rider login |

2. Go to the **Actions** tab → **DB setup** → **Run workflow**.
   This creates the tables, zones, merchants, operating settings, and the staff accounts.
   It is safe to re-run.

After it finishes, in Supabase → Table editor you should see rows in `Zone`, `Merchant`,
`OperatingSettings`, and `User`.

---

## 2. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with the GitHub account that owns
   this repo.
2. **Add New… → Project → Import** this repository. Choose the branch to deploy
   (`main` once the pull request is merged, or the feature branch for a preview).
3. In **Environment Variables**, add the same five Supabase values from the table above:
   `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`.
   (The two `SEED_*` values are only needed by the DB-setup Action, not by Vercel.)
4. Click **Deploy**. You get a free `your-project.vercel.app` URL. Open it and check:
   - the home page loads (you'll see the "currently closed" banner and the EN/FR toggle),
   - `/admin/login` works with `admin@urbannightlift.cm` + your `SEED_ADMIN_PASSWORD`,
   - `/rider/login` works with `rider1@urbannightlift.cm` + your `SEED_RIDER_PASSWORD`.

To open for business, log in as the owner and use **Open night operations** on the
dashboard.

---

## 3. Connect your domain

1. Vercel → your project → **Settings → Domains → Add** → enter your domain.
2. Vercel shows the exact DNS records. Typically:
   - **Root domain** (e.g. `example.com`): an `A` record pointing to `76.76.21.21`.
   - **`www` or a subdomain**: a `CNAME` pointing to `cname.vercel-dns.com`.
3. Add those records in your domain registrar's DNS settings.
4. Wait for DNS to propagate (minutes to a few hours). Vercel issues HTTPS automatically.
   Your site is then live on your domain.

---

## Notes

- Every push to the deployed branch triggers an automatic redeploy on Vercel.
- Never commit real credentials. `.env*` is git-ignored; secrets live in GitHub Actions
  secrets and Vercel environment variables only.
- The app never asks for or stores payment PINs, secret codes, OTPs, or bank passwords.
