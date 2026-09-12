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
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Trippy <no-reply@example.com>"),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
  CRON_SECRET: z.string().optional(),
  AI_PROVIDER: z.enum(["anthropic", "google", ""]).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  AUTH_TEST_BYPASS: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
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
  email: Boolean(env.RESEND_API_KEY),
  push: Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
  ai: Boolean(
    env.AI_PROVIDER &&
      ((env.AI_PROVIDER === "anthropic" && env.ANTHROPIC_API_KEY) ||
        (env.AI_PROVIDER === "google" && env.GOOGLE_GENERATIVE_AI_API_KEY)),
  ),
  authTestBypass: env.AUTH_TEST_BYPASS === "1" && env.NODE_ENV !== "production",
} as const;
