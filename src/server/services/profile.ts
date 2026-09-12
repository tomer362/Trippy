import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { userProfile } from "@/server/db/schema";

export function slugifyHandle(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
  return base.length >= 3 ? base : `traveler${base}`;
}

/** Creates the profile row for a new user with a unique handle. Idempotent. */
export async function ensureProfile(userId: string, name: string, email: string) {
  const existing = await db.query.userProfile.findFirst({ where: eq(userProfile.userId, userId) });
  if (existing) return existing;
  const base = slugifyHandle(name || email.split("@")[0] || "traveler");
  for (let attempt = 0; attempt < 20; attempt++) {
    const handle = attempt === 0 ? base : `${base}${Math.floor(Math.random() * 10000)}`;
    try {
      const [row] = await db.insert(userProfile).values({ userId, handle }).returning();
      return row!;
    } catch (err) {
      if (attempt === 19) throw err;
    }
  }
  throw new Error("Could not allocate a handle");
}
