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
