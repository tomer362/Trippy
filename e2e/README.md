# End-to-end tests

These run against a real dev server with a test-only credential login enabled.

```bash
# once
pnpm exec playwright install chromium

# needs DATABASE_URL pointing at a database you don't mind writing to
AUTH_TEST_BYPASS=1 pnpm test:e2e
```

`AUTH_TEST_BYPASS=1` enables email/password sign-in so the tests don't need Google OAuth.
It is ignored in production builds (see `features.authTestBypass` in `src/env.ts`).

The destination step needs the destination table seeded (`pnpm db:seed`). Google Places and
Routes are not exercised: the suite covers the planning flow, not the third-party proxies.

`DATABASE_URL` has to be a **Neon** database. The app connects with Neon's HTTP driver, which
speaks Neon's own protocol rather than the Postgres wire protocol, so a local `postgres://`
server or a CI service container will not work — use a throwaway Neon branch. That is also why
CI only runs this suite when the repository has an `E2E_DATABASE_URL` secret and the `RUN_E2E`
variable set to `true`; without them the job skips and the rest of CI still runs.

## What is covered

- `trip-planning.spec.ts` — sign up, create a trip through the wizard, see it listed, and the
  offline page.
- `visibility.spec.ts` — a shared trip must not leak its bookings: an anonymous visitor is kept
  out of the reservations page and gets 403 from the calendar and expenses exports. This is the
  regression test for the worst finding of the security audit.
