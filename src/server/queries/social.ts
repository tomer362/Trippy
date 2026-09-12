import "server-only";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { follow, friendship, tripInvites, user, userProfile } from "@/server/db/schema";

export type PersonDTO = {
  userId: string;
  name: string;
  image: string | null;
  handle: string | null;
};

export type FriendsData = {
  friends: PersonDTO[];
  incoming: PersonDTO[];
  outgoing: PersonDTO[];
  followers: PersonDTO[];
  following: PersonDTO[];
};

const person = { userId: user.id, name: user.name, image: user.image, handle: userProfile.handle };

export async function getFriendsData(userId: string): Promise<FriendsData> {
  const rows = await db
    .select({
      requesterId: friendship.requesterId,
      addresseeId: friendship.addresseeId,
      status: friendship.status,
    })
    .from(friendship)
    .where(or(eq(friendship.requesterId, userId), eq(friendship.addresseeId, userId)));

  const ids = new Set<string>();
  for (const r of rows) ids.add(r.requesterId === userId ? r.addresseeId : r.requesterId);

  const [followerRows, followingRows] = await Promise.all([
    db
      .select(person)
      .from(follow)
      .innerJoin(user, eq(user.id, follow.followerId))
      .leftJoin(userProfile, eq(userProfile.userId, user.id))
      .where(eq(follow.followeeId, userId)),
    db
      .select(person)
      .from(follow)
      .innerJoin(user, eq(user.id, follow.followeeId))
      .leftJoin(userProfile, eq(userProfile.userId, user.id))
      .where(eq(follow.followerId, userId)),
  ]);

  const people =
    ids.size > 0
      ? await db
          .select(person)
          .from(user)
          .leftJoin(userProfile, eq(userProfile.userId, user.id))
          .where(sql`${user.id} IN ${[...ids]}`)
      : [];
  const byId = new Map(people.map((p) => [p.userId, p]));

  const friends: PersonDTO[] = [];
  const incoming: PersonDTO[] = [];
  const outgoing: PersonDTO[] = [];
  for (const r of rows) {
    const otherId = r.requesterId === userId ? r.addresseeId : r.requesterId;
    const p = byId.get(otherId);
    if (!p) continue;
    if (r.status === "accepted") friends.push(p);
    else if (r.status === "pending") (r.addresseeId === userId ? incoming : outgoing).push(p);
  }
  return { friends, incoming, outgoing, followers: followerRows, following: followingRows };
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  const [row] = await db
    .select({ status: friendship.status })
    .from(friendship)
    .where(
      and(
        eq(friendship.status, "accepted"),
        or(
          and(eq(friendship.requesterId, a), eq(friendship.addresseeId, b)),
          and(eq(friendship.requesterId, b), eq(friendship.addresseeId, a)),
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export type InviteDTO = {
  id: string;
  token: string;
  role: "owner" | "editor" | "viewer";
  email: string | null;
  uses: number;
  maxUses: number | null;
  expiresAt: string | null;
  createdAt: string;
};

export async function getTripInvites(tripId: string): Promise<InviteDTO[]> {
  const rows = await db
    .select()
    .from(tripInvites)
    .where(and(eq(tripInvites.tripId, tripId), sql`${tripInvites.revokedAt} IS NULL`))
    .orderBy(desc(tripInvites.createdAt));
  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    role: r.role,
    email: r.email,
    uses: r.uses,
    maxUses: r.maxUses,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function findUserByHandleOrEmail(query: string): Promise<PersonDTO | null> {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const [row] = await db
    .select(person)
    .from(user)
    .leftJoin(userProfile, eq(userProfile.userId, user.id))
    .where(
      or(
        sql`lower(${user.email}) = ${q}`,
        sql`lower(${userProfile.handle}) = ${q.replace(/^@/, "")}`,
      ),
    )
    .limit(1);
  return row ?? null;
}
