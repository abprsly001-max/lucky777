# Putting Lucky777 on the internet

Three paths, easiest first. All of them end with your site at a real URL where
you log in as the master agent and your players log in with the accounts you
cut them.

Whichever path you take, the environment variables are the same:

| Variable | What it does |
|---|---|
| `LUCKY777_JWT_SECRET` | Signs every login token. Set a long random string. **Never ship the default.** |
| `LUCKY777_ADMIN_USERNAME` / `LUCKY777_ADMIN_PASSWORD` | Creates your master agent on first boot (hosts without a shell). Idempotent — safe to leave set. |
| `LUCKY777_DATABASE_URL` | Defaults to SQLite in `/srv/data`. Point at Postgres to scale: `postgresql+asyncpg://user:pass@host/db` — no code changes. |
| `LUCKY777_ODDS_PROVIDER` + `LUCKY777_ODDS_API_KEY` | `the_odds_api` + a key from the-odds-api.com puts **real games at real prices** on the board, with live scores and automatic grading. Without it you get the built-in fixture feed. |
| `LUCKY777_LIVE_SCORES_POLL_SECONDS` | Real-feed live score cadence, default 60. |
| `LUCKY777_BOARD_SYNC_MINUTES` | Auto-refresh of the pregame board, default 30 (0 = manual only). |
| `LUCKY777_AUTOLOAD_FEED` | `1` (default) stocks an empty board on boot. This is the game board only — never fake customers or action. |
| `LUCKY777_LIVE_TICK_SECONDS` | Live-engine clock speed, default 20. |

Generate a good secret with: `openssl rand -hex 32`

---

## Path 1 — a $6/mo VPS with Docker (recommended)

This is the setup where your data actually belongs to you and nothing expires.
`setup-server.sh` in this folder does everything on the server side — Docker,
secrets, firewall, HTTPS — you just answer two prompts.

**On the provider's site** (DigitalOcean shown; Hetzner/Vultr/Linode all work):
Create account → **Droplets → Create Droplet** → region near you →
**Ubuntu 24.04** → Basic → Regular **$6/mo** → authentication: **Password**
(set a strong root password) → Create. Copy the droplet's IP address.

**From your computer** (Terminal on Mac, PowerShell on Windows), with
`lucky777.zip` in your current folder:

```bash
ssh root@YOUR_IP "apt-get update -qq && apt-get install -y -qq unzip"
scp lucky777.zip root@YOUR_IP:~
ssh root@YOUR_IP "unzip -oq lucky777.zip && cd lucky777 && bash setup-server.sh"
```

The script asks for your master-agent username and password (and an odds API
key if you have one), then prints your URL: `http://YOUR_IP:8000`. Log in —
the board is already stocked.

**Domain + HTTPS.** Buy a domain anywhere (Namecheap, Porkbun, ~$10/yr) and
add an `A` record pointing at the droplet's IP. Then one command:

```bash
ssh root@YOUR_IP "cd lucky777 && bash setup-server.sh yourdomain.com"
```

Caddy fetches and renews the certificate itself; a minute later
`https://yourdomain.com` is live.

**Updates.** Copy a new zip up and re-run the same three commands — the
script keeps your `.env` and the ledger volume, so nothing is lost.

**Backups.** The whole book is one file; the script prints a one-line cron
that keeps seven rotating daily copies in /root.

---

## Path 2 — Render (no server to manage)

1. Push the `lucky777` folder to a **private** GitHub repo.
2. On render.com: **New → Blueprint**, pick the repo. `render.yaml` does the rest.
3. It prompts once for the admin password; the JWT secret is auto-generated.

The Starter plan (~$7/mo) includes the persistent disk the ledger needs.
The free tier works as a throwaway demo but **wipes the database on every
restart** — don't run a real sheet on it. Railway and Fly.io work the same
way with their volume features if you prefer them.

You get a `something.onrender.com` URL immediately; add your own domain in
Render's settings and follow its DNS instructions for HTTPS.

---

## Path 3 — plain Python on a box you already have

```bash
cd lucky777/frontend && npm install && npm run build
cd ../backend && pip install -r requirements.txt
export LUCKY777_JWT_SECRET=$(openssl rand -hex 32)
python -m app.cli create-admin brock        # prompts for a password
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Put nginx/Caddy in front for HTTPS and keep it alive with systemd.

---

## After it's up — first five minutes

1. Log in as the master agent. Betting Limits → set your book's numbers.
2. Add Customer → cut accounts (bulk makes `LKY1001…` style batches with
   one-time passwords). Hand each player their login and the URL.
3. Game Admin → the board is stocked; Go Live when you want in-play action.
4. Real odds are already configured if you accepted the built-in key at
   setup. The board refreshes itself every 30 minutes; live games pick up real
   scores every 60 seconds; finished games grade and settle themselves.

## Honest notes

- With the real feed on, everything is automatic: lines, live scores, game
  grading, and player-prop grading (props settle off public box scores, and
  auto-refund after 24h if a stat can't be confirmed).
- **Netlify/Vercel/GitHub Pages can't host this** — they serve static files.
  This is a full application server that needs an always-on machine with a
  disk: a VPS (Path 1) or Render (Path 2).
- This is a play-money platform. Credits have no cash value and the site says
  so in the footer. Taking real money on it is a different project — legally,
  not technically.
- Keep the repo private: it's your book.
