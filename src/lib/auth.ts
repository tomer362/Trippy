import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { env, features } from "@/env";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { ensureProfile } from "@/server/services/profile";

function createAuth() {
  return betterAuth({
    appName: "Trippy",
    baseURL: env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    socialProviders: features.googleAuth
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID!,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
            prompt: "select_account",
          },
        }
      : {},
    // Email/password is only enabled for automated tests (never in production).
    emailAndPassword: { enabled: features.authTestBypass },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
    databaseHooks: {
      user: {
        create: {
          after: async (created) => {
            await ensureProfile(created.id, created.name, created.email);
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { __trippyAuth?: Auth };

function getAuth(): Auth {
  if (!globalForAuth.__trippyAuth) globalForAuth.__trippyAuth = createAuth();
  return globalForAuth.__trippyAuth;
}

/** Lazily-created auth instance so importing this module never requires a database. */
export const auth: Auth = new Proxy({} as Auth, {
  get(_target, prop, receiver) {
    const real = getAuth();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type Session = Auth["$Infer"]["Session"];
export type SessionUser = Session["user"];

/** Cached per-request session lookup for server components and actions. */
export const getSession = cache(async () => {
  const requestHeaders = await headers();
  return auth.api.getSession({ headers: requestHeaders });
});

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/?next=/trips");
  return session.user;
}
