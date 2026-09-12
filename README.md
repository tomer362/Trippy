# Trippy

A collaborative trip planner PWA: pick destinations, save places, build a day-by-day itinerary on a
map with travel times, manage hotels and bookings, split expenses, invite trip mates, and keep a
travel journal. Built to run for free on Vercel Hobby + Neon.

- **Spec:** [docs/SPEC.md](docs/SPEC.md)
- **Setup (Google Cloud, Neon, Vercel, Maps, Blob, Pusher):** [docs/SETUP.md](docs/SETUP.md)

## Quick start

```bash
pnpm install
cp .env.example .env.local      # fill in the values described in docs/SETUP.md
pnpm db:migrate                 # apply migrations to your Neon database
pnpm db:seed                    # load the curated destination list
pnpm dev
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm check` | typecheck + lint + unit tests |
| `pnpm test:e2e` | Playwright end-to-end tests (uses a test-only auth bypass) |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle migrations |
| `pnpm db:seed` | Upsert `data/destinations.json` |
| `pnpm db:enrich` | Optional: expand destinations from GeoNames + Wikidata (run locally) |

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind v4 · better-auth (Google) ·
Neon Postgres + Drizzle · Google Maps / Places (New) / Routes APIs · Serwist PWA · TanStack Query ·
dnd-kit · Pusher (optional realtime) · Vercel Blob (uploads).
