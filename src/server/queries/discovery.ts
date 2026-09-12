import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  destinations,
  guideLikes,
  guideStats,
  tripDestinations,
  tripPlaces,
  trips,
  user,
  userProfile,
} from "@/server/db/schema";

export type GuideCardDTO = {
  tripId: string;
  slug: string;
  name: string;
  kind: "plan" | "guide" | "journal";
  coverUrl: string | null;
  description: string | null;
  dayCount: number;
  placeCount: number;
  destinations: string[];
  authorName: string;
  authorHandle: string | null;
  authorImage: string | null;
  likes: number;
  copies: number;
  likedByViewer: boolean;
};

async function decorate(
  rows: Array<{
    trip: typeof trips.$inferSelect;
    authorName: string;
    authorHandle: string | null;
    authorImage: string | null;
  }>,
  viewerId: string | null,
): Promise<GuideCardDTO[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.trip.id);
  const [dests, counts, stats, likes] = await Promise.all([
    db
      .select({ tripId: tripDestinations.tripId, name: destinations.name })
      .from(tripDestinations)
      .innerJoin(destinations, eq(destinations.id, tripDestinations.destinationId))
      .where(inArray(tripDestinations.tripId, ids))
      .orderBy(tripDestinations.position),
    db
      .select({ tripId: tripPlaces.tripId, count: sql<number>`count(*)` })
      .from(tripPlaces)
      .where(inArray(tripPlaces.tripId, ids))
      .groupBy(tripPlaces.tripId),
    db.select().from(guideStats).where(inArray(guideStats.tripId, ids)),
    viewerId
      ? db
          .select()
          .from(guideLikes)
          .where(and(inArray(guideLikes.tripId, ids), eq(guideLikes.userId, viewerId)))
      : Promise.resolve([]),
  ]);

  const destsByTrip = new Map<string, string[]>();
  for (const d of dests) destsByTrip.set(d.tripId, [...(destsByTrip.get(d.tripId) ?? []), d.name]);
  const countByTrip = new Map(counts.map((c) => [c.tripId, Number(c.count)]));
  const statsByTrip = new Map(stats.map((s) => [s.tripId, s]));
  const likedByViewer = new Set(likes.map((l) => l.tripId));

  return rows.map(({ trip, authorName, authorHandle, authorImage }) => ({
    tripId: trip.id,
    slug: trip.slug,
    name: trip.name,
    kind: trip.kind,
    coverUrl: trip.coverUrl,
    description: trip.description,
    dayCount: trip.dayCount,
    placeCount: countByTrip.get(trip.id) ?? 0,
    destinations: destsByTrip.get(trip.id) ?? [],
    authorName,
    authorHandle,
    authorImage,
    likes: statsByTrip.get(trip.id)?.likes ?? 0,
    copies: statsByTrip.get(trip.id)?.copies ?? 0,
    likedByViewer: likedByViewer.has(trip.id),
  }));
}

const authorColumns = {
  trip: trips,
  authorName: user.name,
  authorHandle: userProfile.handle,
  authorImage: user.image,
};

export async function getPublicGuides(
  viewerId: string | null,
  limit = 24,
): Promise<GuideCardDTO[]> {
  const rows = await db
    .select(authorColumns)
    .from(trips)
    .innerJoin(user, eq(user.id, trips.ownerId))
    .leftJoin(userProfile, eq(userProfile.userId, user.id))
    .where(and(eq(trips.visibility, "public"), isNull(trips.archivedAt)))
    .orderBy(desc(trips.publishedAt), desc(trips.updatedAt))
    .limit(limit);
  return decorate(rows, viewerId);
}

export async function getGuidesForDestination(
  destinationId: string,
  viewerId: string | null,
  limit = 12,
): Promise<GuideCardDTO[]> {
  const rows = await db
    .select(authorColumns)
    .from(tripDestinations)
    .innerJoin(trips, eq(trips.id, tripDestinations.tripId))
    .innerJoin(user, eq(user.id, trips.ownerId))
    .leftJoin(userProfile, eq(userProfile.userId, user.id))
    .where(
      and(
        eq(tripDestinations.destinationId, destinationId),
        eq(trips.visibility, "public"),
        isNull(trips.archivedAt),
      ),
    )
    .orderBy(desc(trips.publishedAt))
    .limit(limit);
  return decorate(rows, viewerId);
}

export async function getGuidesForTripDestinations(
  tripId: string,
  viewerId: string | null,
  limit = 8,
): Promise<GuideCardDTO[]> {
  const dests = await db
    .select({ id: tripDestinations.destinationId })
    .from(tripDestinations)
    .where(eq(tripDestinations.tripId, tripId));
  if (dests.length === 0) return [];
  const rows = await db
    .select(authorColumns)
    .from(tripDestinations)
    .innerJoin(trips, eq(trips.id, tripDestinations.tripId))
    .innerJoin(user, eq(user.id, trips.ownerId))
    .leftJoin(userProfile, eq(userProfile.userId, user.id))
    .where(
      and(
        inArray(
          tripDestinations.destinationId,
          dests.map((d) => d.id),
        ),
        eq(trips.visibility, "public"),
        isNull(trips.archivedAt),
        sql`${trips.id} <> ${tripId}`,
      ),
    )
    .orderBy(desc(trips.publishedAt))
    .limit(limit);
  return decorate(rows, viewerId);
}

export type PublicProfileDTO = {
  userId: string;
  name: string;
  handle: string;
  bio: string | null;
  image: string | null;
  isPublic: boolean;
  guides: GuideCardDTO[];
  countries: string[];
  visited: Array<{ name: string; lat: number; lng: number }>;
};

export async function getPublicProfile(
  handle: string,
  viewerId: string | null,
): Promise<PublicProfileDTO | null> {
  const [row] = await db
    .select({
      userId: user.id,
      name: user.name,
      image: user.image,
      handle: userProfile.handle,
      bio: userProfile.bio,
      isPublic: userProfile.isPublic,
    })
    .from(userProfile)
    .innerJoin(user, eq(user.id, userProfile.userId))
    .where(eq(userProfile.handle, handle))
    .limit(1);
  if (!row) return null;

  const guideRows = await db
    .select(authorColumns)
    .from(trips)
    .innerJoin(user, eq(user.id, trips.ownerId))
    .leftJoin(userProfile, eq(userProfile.userId, user.id))
    .where(
      and(eq(trips.ownerId, row.userId), eq(trips.visibility, "public"), isNull(trips.archivedAt)),
    )
    .orderBy(desc(trips.publishedAt))
    .limit(24);

  const visited = await db
    .selectDistinct({
      name: destinations.name,
      lat: destinations.lat,
      lng: destinations.lng,
      countryCode: destinations.countryCode,
    })
    .from(tripDestinations)
    .innerJoin(trips, eq(trips.id, tripDestinations.tripId))
    .innerJoin(destinations, eq(destinations.id, tripDestinations.destinationId))
    .where(eq(trips.ownerId, row.userId))
    .limit(200);

  return {
    userId: row.userId,
    name: row.name,
    handle: row.handle,
    bio: row.bio,
    image: row.image,
    isPublic: row.isPublic,
    guides: await decorate(guideRows, viewerId),
    countries: [...new Set(visited.map((v) => v.countryCode))].sort(),
    visited: visited.map((v) => ({ name: v.name, lat: v.lat, lng: v.lng })),
  };
}

export async function getPopularDestinationsWithGuides(limit = 12) {
  return db
    .select({
      id: destinations.id,
      slug: destinations.slug,
      name: destinations.name,
      kind: destinations.kind,
      heroUrl: destinations.heroUrl,
      ancestorNames: destinations.ancestorNames,
      guides: sql<number>`count(distinct ${trips.id})`,
    })
    .from(destinations)
    .leftJoin(tripDestinations, eq(tripDestinations.destinationId, destinations.id))
    .leftJoin(trips, and(eq(trips.id, tripDestinations.tripId), eq(trips.visibility, "public")))
    .groupBy(destinations.id)
    .orderBy(desc(sql`count(distinct ${trips.id})`), desc(destinations.popularity))
    .limit(limit);
}
