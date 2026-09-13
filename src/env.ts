import { z } from "zod";

/**
 * Server-side environment validation. Import from server code only.
 * Optional integrations are detected via `features` so the app degrades gracefully
 * when a key is absent (e.g. realtime falls back to polling).
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(16).default("dev-secret-change-me-please-32-bytes"),
  BETTER_AUTH_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: z.string().optional(),
  GOOGLE_MAPS_SERVER_KEY: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  PUSHER_APP_ID: z.string().optional(),
  PUSHER_KEY: z.string().optional(),
  PUSHER_SECRET: z.string().optional(),
  PUSHER_CLUSTER: z.string().default("eu"),
  // Read directly by the client hook so Next can inline them, and declared here so they are
  // documented and validated in one place.
  NEXT_PUBLIC_PUSHER_KEY: z.string().optional(),
  NEXT_PUBLIC_PUSHER_CLUSTER: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Trippy <no-reply@example.com>"),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
  CRON_SECRET: z.string().optional(),
  AI_PROVIDER: z.enum(["anthropic", "google", ""]).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AUTH_TEST_BYPASS: z.string().optional(),
});

const DEV_AUTH_SECRET = "dev-secret-change-me-please-32-bytes";

/**
 * In production the app must not *start* half-configured — a build with no secrets is fine. Every one of these fails silently at
 * runtime rather than at boot: a default auth secret makes sessions forgeable by anyone who
 * has read this repository, a localhost app URL breaks the OAuth callback and every invite and
 * reminder link, and missing Google credentials leave no way to sign in at all, because
 * email-and-password auth is disabled outside development.
 */
const productionSchema = schema.superRefine((value, ctx) => {
  if (value.NODE_ENV !== "production") return;
  // `next build` runs with NODE_ENV=production but without the deployment's secrets, and CI
  // builds with none at all. These are runtime requirements, so the build is exempt.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.SKIP_ENV_VALIDATION === "1") return;
  const required = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });
  if (!value.DATABASE_URL) required("DATABASE_URL", "is required in production");
  if (!value.BETTER_AUTH_SECRET || value.BETTER_AUTH_SECRET === DEV_AUTH_SECRET)
    required("BETTER_AUTH_SECRET", "must be set to a real secret in production");
  if (new URL(value.NEXT_PUBLIC_APP_URL).hostname === "localhost")
    required("NEXT_PUBLIC_APP_URL", "must be the deployed URL, not localhost");
  if (!value.GOOGLE_CLIENT_ID || !value.GOOGLE_CLIENT_SECRET)
    required("GOOGLE_CLIENT_ID", "Google sign-in credentials are required in production");
});

const parsed = productionSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;

export const features = {
  database: Boolean(env.DATABASE_URL),
  googleAuth: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  mapsServer: Boolean(env.GOOGLE_MAPS_SERVER_KEY),
  blob: Boolean(env.BLOB_READ_WRITE_TOKEN),
  realtime: Boolean(env.PUSHER_APP_ID && env.PUSHER_KEY && env.PUSHER_SECRET),
  // The browser half needs its own public vars, and Next inlines those at build time — so a
  // deployment that adds them after the fact keeps polling until it is rebuilt.
  realtimeClient: Boolean(env.NEXT_PUBLIC_PUSHER_KEY && env.NEXT_PUBLIC_PUSHER_CLUSTER),
  email: Boolean(env.RESEND_API_KEY),
  push: Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
  ai: Boolean(
    env.AI_PROVIDER &&
      ((env.AI_PROVIDER === "anthropic" && env.ANTHROPIC_API_KEY) ||
        (env.AI_PROVIDER === "google" && env.GOOGLE_GENERATIVE_AI_API_KEY)),
  ),
  authTestBypass: env.AUTH_TEST_BYPASS === "1" && env.NODE_ENV !== "production",
} as const;

// Easy to get wrong and silent when you do: the server thinks realtime is on, every browser
// keeps polling, and nothing anywhere says why.
if (features.realtime && !features.realtimeClient) {
  console.warn(
    "Pusher is configured on the server but NEXT_PUBLIC_PUSHER_KEY / NEXT_PUBLIC_PUSHER_CLUSTER " +
      "are missing, so clients will fall back to polling. These are inlined at build time — " +
      "set them and redeploy, an env change alone will not take effect.",
  );
}
