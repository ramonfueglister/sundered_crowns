# Deploying Sundered Crowns online

Three parts, each optional on top of the previous one:

| Part | Where | What it needs |
|---|---|---|
| Browser game (Vite build) | Vercel (static) | nothing – single player works without any backend |
| Accounts, profiles, cloud saves, leaderboards, achievements | Supabase project | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in the Vercel build |
| Persistent world | one long-running Node process per world (Fly.io, Render or Railway) | `SUPABASE_*` secrets on the server, `VITE_WORLD_URL` in the Vercel build |

The browser only ever talks to your Vercel deployment, your Supabase project and your world server. It uses the
**anon key** only; every table has Row Level Security (see `supabase/migrations`, tested in `tests/supabase_rls.test.ts`).
The **service role key** lives only on the world server.

All variables are listed with comments in [`.env.example`](../.env.example).

---

## 0. Run everything locally first

```bash
npm install
cp .env.example .env            # leave the SUPABASE_* values empty for DEV mode
npm run world                   # world server on ws://localhost:8787, 36 s per day, DEV login by display name
npm run world:fast              # same, 0.05 s per day (testing)
npm run dev                     # game on http://localhost:5173 → main menu → "Online world"
npx vitest run                  # RLS tests (PGlite), replay determinism, auth
npm run smoke:online            # two scripted clients against the running world server
```

Without Supabase the online panel says so clearly and offers the local DEV world (display-name login).
DEV mode is for development only: anyone can claim any name. It switches off as soon as `SUPABASE_URL`,
`SUPABASE_JWT_SECRET` or `SUPABASE_JWKS_URL` is set on the server.

World data is stored in `./world-data/<WORLD_ID>/season-<n>/`: `snap-<day>.bin` (gzip-compressed state, the
genesis snapshot plus the three most recent), `log-<day>.ndjson` (command log segments, one per snapshot) and
`snapshot.json`; `meta.json` holds seats, chat and achievements. On start the server loads the latest snapshot and
replays the log after it, so a crash loses nothing that was logged. `SIGTERM` (every deploy) writes a final snapshot.

---

## 1. Supabase

1. **Create a project** at <https://supabase.com/dashboard> → *New project*. Pick a region close to the world server
   (e.g. *Central EU (Frankfurt)* if the server runs in Fly region `fra`). Save the database password.
2. **Run the migrations** (`supabase/migrations/*.sql`, in file-name order). Either
   - **Supabase CLI** (recommended, keeps track of what was applied):
     ```bash
     npx supabase login
     npx supabase link --project-ref <your-project-ref>     # ref = the part before .supabase.co
     npx supabase db push                                    # applies supabase/migrations
     ```
   - or **SQL editor**: Dashboard → *SQL Editor* → paste each file in order
     (`20261108000100_profiles_admin.sql`, `…0200_cloud_saves.sql`, `…0300_worlds.sql`, `…0400_achievements_messages.sql`) → *Run*.
3. **Storage buckets**: the second migration creates two **private** buckets and their policies:
   `saves` (cloud saves, 50 MB per file, users can only touch `<their user id>/…`) and `world-snapshots`
   (no client access; the world server uploads snapshots there with the service role).
   Check them under *Storage*. If your project refused the `insert into storage.buckets`, create them by hand with the
   same names, *Public bucket* off, file size limit 50 MB (`saves`) / 200 MB (`world-snapshots`), MIME type
   `application/octet-stream`, then run only the `create policy … on storage.objects` statements of that migration.
4. **Auth settings** (*Authentication*):
   - *Sign In / Providers → Email*: enabled. The game uses magic links (`signInWithOtp`); no passwords are stored.
   - *URL Configuration*: **Site URL** = `https://<your-app>.vercel.app`; **Redirect URLs** add
     `https://<your-app>.vercel.app/**` and `http://localhost:5173/**` (and any custom domain).
   - *Emails → SMTP Settings*: the built-in mailer is heavily rate limited and meant for testing. For real players set up
     a custom SMTP provider.
   - Optional OAuth: enable e.g. GitHub or Google under *Providers* (callback URL is shown there), then list them in
     `VITE_SUPABASE_OAUTH=github,google` so the panel shows the buttons.
5. **Keys** (*Project Settings → API* / *API Keys*):
   - Project URL → `VITE_SUPABASE_URL` (Vercel) and `SUPABASE_URL` (world server)
   - `anon` / publishable key → `VITE_SUPABASE_ANON_KEY` (Vercel; public by design)
   - `service_role` / secret key → `SUPABASE_SERVICE_ROLE_KEY` (world server only – never in Vercel)
   - Token verification on the world server: if the project still signs tokens with the **legacy JWT secret**
     (*Project Settings → JWT Keys → Legacy JWT secret*), set `SUPABASE_JWT_SECRET`. If it uses the newer
     **asymmetric signing keys**, leave `SUPABASE_JWT_SECRET` empty: the server fetches
     `$SUPABASE_URL/auth/v1/.well-known/jwks.json` (override with `SUPABASE_JWKS_URL`).
6. **Admins**: sign in once in the game, then in the SQL editor
   `insert into public.admin_roles (user_id, role) select id, 'admin' from auth.users where email = 'you@example.org';`
   Admins get the *Admin* tab in a world (pause, speed, broadcast, kick, release seats, snapshot, developer commands).
   The developer actions "reveal" and "observer" are refused online: they would lift the fog of war for every
   player, and admins already see the whole map.
7. The `worlds` row is created and kept up to date by the world server itself (status, day, players, projected end).

---

## 2. Vercel (the browser game)

1. *Add New → Project* → import the repository. Framework preset **Vite**.
2. Build command `npm run build` (runs `tsc --noEmit` and `vite build`; use `npx vite build` if you want to deploy
   while type errors elsewhere are being fixed), output directory `dist`, install command `npm ci`.
3. *Settings → Environment Variables* (Production and Preview):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `VITE_WORLD_URL=wss://<your-world-app>.fly.dev`
   - optional `VITE_SUPABASE_OAUTH`
   Vite inlines these at build time: **redeploy after changing them**.
4. Deploy (or `npx vercel --prod` from the repo). Put the resulting URL into the Supabase redirect URLs (step 1.4)
   and into the world server's `ALLOWED_ORIGINS`.

---

## 3. World server

The world server is a stateful, always-on process with a disk (it cannot run as a serverless function).
One process = one world. Image: `server/Dockerfile` (build context = repository root).

### Fly.io (recommended; `server/fly.toml`)

```bash
# once
curl -L https://fly.io/install.sh | sh
fly auth login
fly apps create sundered-crowns-world                 # or change `app` in server/fly.toml
fly volumes create world_data --size 1 --region fra --app sundered-crowns-world
fly secrets set --app sundered-crowns-world \
  SUPABASE_URL=https://<ref>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service role key> \
  SUPABASE_JWT_SECRET=<legacy jwt secret, or leave out for JWKS> \
  PUBLIC_WORLD_URL=wss://sundered-crowns-world.fly.dev \
  ALLOWED_ORIGINS=https://<your-app>.vercel.app

# every release (from the repository root)
fly deploy . --config server/fly.toml --dockerfile server/Dockerfile
curl https://sundered-crowns-world.fly.dev/health      # {"ok":true,"world":"europa-1","day":…}
fly logs --app sundered-crowns-world
```

- Keep exactly **one machine** per world (`fly scale count 1`); the volume pins it to one region.
- Deploys send `SIGTERM`; the server snapshots and exits, the new version resumes from that snapshot.
- A second world = a second app (or a second process group) with its own volume and `WORLD_ID`.
- Non-secret settings (`SECONDS_PER_DAY`, `MAX_PLAYERS`, `WORLD_ID`, …) are in `[env]` of `server/fly.toml`.

### Alternatives

- **Render**: *New → Web Service → Docker*, Dockerfile path `server/Dockerfile`, context `.`; add a *Persistent Disk*
  mounted at `/data`; choose a paid instance (free instances sleep and lose the disk); set the env vars above;
  health check path `/health`. WebSockets work on the service's `wss://<name>.onrender.com`.
- **Railway**: *New Project → Deploy from repo*, set `RAILWAY_DOCKERFILE_PATH=server/Dockerfile`, add a *Volume*
  mounted at `/data`, set the variables, expose port 8787 (Railway sets `PORT`).
- Any VPS: `docker build -f server/Dockerfile -t sc-world . && docker run -d --restart unless-stopped -p 8787:8787 -v /srv/sc-world:/data --env-file .env sc-world`
  behind a TLS proxy (Caddy/nginx) that upgrades WebSockets.

### Moderation and returning players (environment)

| Variable | Default | Meaning |
|---|---|---|
| `WORLD_WORD_FILTER` | `server/config/wordfilter.txt` (relative to the working directory, `/app` in the image) | The word filter list for chat lines and offer texts: one entry per line, `word*` for prefixes, `#` for comments. The image ships the starter list from `server/config/`. To edit it without a rebuild, copy it to the volume (`/data/wordfilter.txt`) and set `WORLD_WORD_FILTER=/data/wordfilter.txt`; the server re-reads it within 30 s, admins can reload it at once. An empty or missing list is logged as a warning at start. |
| `ADMIN_TOKEN` | empty (endpoints off) | Enables `GET /admin/reports` (`?all=1` also lists handled ones), `POST /admin/ban?uid=…&reason=…&hours=…&release=1` and `POST /admin/unban?uid=…`, each with the header `Authorization: Bearer <ADMIN_TOKEN>`. Set it as a secret (`fly secrets set ADMIN_TOKEN=…`). |
| `ADMIN_USERS` | empty | Extra admins by uid (or by display name with the development login), besides the `admin_roles` table. |
| `CATCHUP_MIN_DAYS` | 7 | In-game days a ruler must have been away before the catch-up summary is shown on return (at 36 s per day: about 4 minutes). |

### Endpoints

- `GET /health` – liveness · `GET /world` – world clock/status (JSON) · `GET /leaderboard` – live ranking
- WebSocket on `/` – protocol in `src/online/protocol.ts` (JSON frames + binary frames for owner/controller maps,
  map-mode colours and snow).

---

## 4. Season length (checked)

One season runs from 1 January 1356 to 31 December 1815. With the game calendar (`src/sim/calendar.ts`) that is
`dateToDay(1816, 0, 1, 1356)` = **168,013 in-game days**. At the default **36 s per day**:
168,013 × 36 s = 6,048,468 s = **70.0 real days = 10.0 weeks**. Afterwards the server writes the leaderboard and
achievements, archives the season (`season-<n>/results.json`) and starts season n+1 on a fresh map.

---

## 5. Costs and limits (approximate, at the time of writing – check the providers' current pricing)

- **Supabase Free**: 500 MB database, 1 GB file storage, 5 GB egress, 50,000 monthly active users, 2 projects.
  Free projects are paused after a week without activity (a running world server keeps it active). Built-in e-mail is
  limited to a few messages per hour → custom SMTP for launch. Pro plan from US$25/month removes pausing.
  Storage use here: cloud saves ≈ 1.5–3 MB each (max 30 per user, enforced by a trigger); world snapshots ≈ 3 MB,
  overwritten in place (uploaded every `SNAPSHOT_UPLOAD_EVERY_DAYS` = 300 in-game days ≈ 3 hours).
- **Vercel Hobby**: free for personal, non-commercial projects; the game is a static build of ≈ 30 MB (mostly map data).
  Commercial use needs Pro (US$20/month per member).
- **Fly.io**: `shared-cpu-1x` with 1 GB RAM ≈ US$5–6/month (the simulation needs ≈ 350 MB; one day takes ≈ 60 ms CPU,
  i.e. under 0.2 % of a core at 36 s/day), volume US$0.15/GB/month. Traffic: the daily tick sends only what changed (armies, realms,
  owners); measured with 100 bots ≈ 30 KB per player per in-game day before WebSocket compression
  (`tools/load_test.ts`), sent every 36 s → ≈ 70 MB per player per day online, less with compression. 100 players online all day
  ≈ 7 GB/day; outbound traffic in Europe/North America costs about US$0.02/GB.
- Server-side limits (env): `MAX_PLAYERS` (100), `CMDS_PER_DAY` (60 orders per player per in-game day), a request
  rate limit of 10/s (burst 40) per account, 5 chat lines per 10 s, 3 sessions per account, 12 connections per IP,
  64 KB per WebSocket message.

## 6. Fairness

The server is authoritative: clients send `Command`s, which are checked (own realm only, developer commands only for
admins, rate limits, protection of new players) and applied through `applyCommand` at the start of the next day.
There are no purchases and nothing that can be bought; achievements are cosmetic. Inactive seats (no login for
`INACTIVE_RELEASE_DAYS`) go back to the AI; while a player is offline, their realm follows their standing orders.
