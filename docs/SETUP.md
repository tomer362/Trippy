# Setup guide

Everything below runs on free tiers. Budget about 30 minutes the first time.

## 1. Google Cloud: sign-in + Maps

1. Create a project at https://console.cloud.google.com (or reuse one).
2. **OAuth consent screen** → External → add your app name, support email, and (while testing)
   your Google account as a test user.
3. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorized JavaScript origins: `http://localhost:3000`, `https://<your-app>.vercel.app`
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`,
     `https://<your-app>.vercel.app/api/auth/callback/google`
   - Copy the client ID/secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
4. **Enable APIs** (APIs & Services → Library): *Maps JavaScript API*, *Places API (New)*,
   *Routes API*, *Geocoding API*. Google requires a billing account on the project, but every
   SKU used here has a monthly free allowance (10,000 Essentials / 5,000 Pro / 1,000 Enterprise
   calls). Set a **budget alert at $1** under Billing → Budgets so surprises are impossible.
5. **Two API keys** (Credentials → Create credentials → API key):
   - *Browser key* → Application restriction: **HTTP referrers** (`http://localhost:3000/*`,
     `https://<your-app>.vercel.app/*`); API restriction: **Maps JavaScript API** only.
     → `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`
   - *Server key* → no application restriction (Vercel egress IPs are dynamic); API restriction:
     **Places API (New)**, **Routes API**, **Geocoding API**. → `GOOGLE_MAPS_SERVER_KEY`
6. Optional: Google Maps Platform → **Map Management → Create Map ID** (JavaScript, Vector) and put
   it in `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` for styled vector maps with advanced markers.

## 2. Neon Postgres

1. https://neon.tech → New project (free plan). Copy the pooled connection string into
   `DATABASE_URL`.
2. Run migrations and the destination seed:
   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```
   The first migration enables the `pg_trgm` extension (available on Neon free).

   **Provision with `pnpm db:migrate`, never `pnpm db:push`.** `db:push` diffs the schema
   straight to the database and skips the SQL files, so it never runs `CREATE EXTENSION
   pg_trgm` and the destination search index then fails to create on a fresh database.
3. Optional, run locally (these hosts are not reachable from some CI sandboxes):
   `pnpm db:enrich` downloads GeoNames + Wikidata data to expand the destination table with
   ~25k cities, admin regions and islands. Set `MIN_POP` to change the population floor
   (default 150000).

## 3. Vercel

1. Import the GitHub repo. Framework preset: Next.js. Build command `pnpm build`.
2. **Storage → Create → Blob** (free) and connect it to the project; Vercel injects
   `BLOB_READ_WRITE_TOKEN`.
3. Add the remaining environment variables from `.env.example` in Project → Settings →
   Environment Variables, **before the first build**. Set `BETTER_AUTH_URL` and
   `NEXT_PUBLIC_APP_URL` to the production URL. Generate `BETTER_AUTH_SECRET` with
   `openssl rand -base64 32`.

   In production the app refuses to start without `DATABASE_URL`, a real `BETTER_AUTH_SECRET`
   (the development default is rejected — it is in this repository, so sessions signed with it
   are forgeable), a non-localhost `NEXT_PUBLIC_APP_URL`, and the Google credentials. That is
   deliberate: each of those otherwise fails silently later, at sign-in. The build itself is
   exempt — `next build` runs as production without the deployment's secrets — and
   `SKIP_ENV_VALIDATION=1` is the escape hatch if you ever need to boot a partial deployment
   on purpose.

   Anything named `NEXT_PUBLIC_*` is inlined into the browser bundle **at build time**, so
   adding one afterwards needs a redeploy, not just an environment change.
4. Deploy. The PWA is installable from the browser menu ("Add to Home Screen" on iOS Safari).

Hobby plan notes: non-commercial use only; serverless functions cap at 300 s; cron jobs run at
most once a day (this repo uses a GitHub Actions schedule instead; set repository variable
`APP_URL` and secret `CRON_SECRET`).

## 4. Optional integrations

| Feature | Provider | Env vars | Without it |
|---|---|---|---|
| Live collaboration | Pusher Channels (free sandbox) | `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER` **and** `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER` | Polling every 15 s + refetch on focus |
| Email invites & notifications | Resend (3,000/mo) | `RESEND_API_KEY`, `EMAIL_FROM` | Share invite links via the system share sheet |
| Web push | VAPID keys (`npx web-push generate-vapid-keys`) | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | No push notifications |
| Planning assistant | Anthropic or Google AI key | `AI_PROVIDER`, `ANTHROPIC_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`, optional `AI_MODEL` | "Suggest stops" is hidden; everything else works |

### Planning assistant

Set `AI_PROVIDER=anthropic` with an `ANTHROPIC_API_KEY`, or `AI_PROVIDER=google` with a
`GOOGLE_GENERATIVE_AI_API_KEY`. A small, cheap model is used by default (`claude-haiku-4-5` or
`gemini-2.5-flash`); set `AI_MODEL` to override it. With a key present, each itinerary day's
menu gains **Suggest stops**. Accepted suggestions are looked up through Places, so
`GOOGLE_MAPS_SERVER_KEY` must also be set for them to be added to a day.

### Live collaboration

Realtime needs both halves. The server-side `PUSHER_*` vars alone make `/api/pusher/auth` start
answering while every browser silently keeps polling, because the public pair is inlined at
build time — the server logs a warning on boot when it sees that combination. Set all six and
redeploy.

## 5. First deploy: a checklist

Work through it in this order; each step depends on the one before.

1. Neon project created, `DATABASE_URL` copied.
2. `pnpm db:migrate` then `pnpm db:seed` against it (not `db:push` — see above).
3. Google Cloud: OAuth client created with the redirect URI, both Maps keys restricted,
   billing on with a budget alert.
4. All environment variables set in Vercel **before** the first build.
5. Build command is `pnpm build`. A detected plain `next build` uses Turbopack and the service
   worker plugin is webpack-only, so the PWA silently stops being installable.
6. Deploy, then check in the browser: sign in with Google; search a destination; create a trip
   and add a place (exercises Places); build a two-stop day and confirm travel times appear
   (exercises Routes); confirm the install prompt appears.
7. If anything is missing, the boot log says which variable — production refuses to start
   half-configured rather than failing at sign-in.

## 6. Local development

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate && pnpm db:seed
pnpm dev
```

The service worker is disabled in development. To test PWA/offline behaviour locally run
`pnpm build && pnpm start`.

## 7. Scheduled jobs

Two endpoints are driven by `.github/workflows/scheduled.yml`, which needs the repository
variable `APP_URL` and the secret `CRON_SECRET` (matching the app's `CRON_SECRET`):

| Endpoint | What it does |
|---|---|
| `POST /api/cron/fx` | Refreshes exchange rates used by multi-currency budgets |
| `POST /api/cron/reminders` | Pushes (or emails) "your trip starts tomorrow" to trip mates |

Vercel Hobby cron runs at most once a day, which is why these live in GitHub Actions.

## 8. Tests

- `pnpm check` → typecheck, lint (Biome), unit tests (Vitest).
- `pnpm test:e2e` → Playwright. Starts the dev server with `AUTH_TEST_BYPASS=1`, which enables
  a test-only email/password login route. Never set this in production. Needs a seeded
  `DATABASE_URL` pointing at a **Neon** database — the HTTP driver cannot talk to a plain
  Postgres server — so CI runs this suite only when `E2E_DATABASE_URL` and `RUN_E2E` are set.
  See `e2e/README.md`.
