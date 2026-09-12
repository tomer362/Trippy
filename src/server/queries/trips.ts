import "server-only";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { DestinationDTO } from "@/lib/types";
import { db } from "@/server/db";
import {
  destinations,
  itineraryDays,
  tripDestinations,
  tripMembers,
  tripPlaces,
  trips,
  user,
} from "@/server/db/schema";
import { toDTO } from "@/server/services/destinations";

export type TripCard = {
  id: string;
  slug: string;
  name: string;
  kind: "plan" | "guide" | "journal";
  coverUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  dayCount: number;
  visibility: "private" | "link" | "friends" | "public";
  role: "owner" | "editor" | "viewer";
  destinations: string[];
  placeCount: number;
  memberCount: number;
  archived: boolean;
  updatedAt: string;
};

export async function listTripsForUser(userId: string): Promise<TripCard[]> {
  const rows = await db
    .select({
      trip: trips,
      role: tripMembers.role,
      placeCount: sql<number>`(SELECT count(*) FROM ${tripPlaces} tp WHERE tp.trip_id = ${trips.id})`,
      memberCount: sql<number>`(SELECT count(*) FROM ${tripMembers} tm WHERE tm.trip_id = ${trips.id})`,
    })
    .from(tripMembers)
    .innerJoin(trips, eq(trips.id, tripMembers.tripId))
    .where(eq(tripMembers.userId, userId))
    .orderBy(desc(trips.updatedAt));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.trip.id);
  const dests = await db
    .select({
      tripId: tripDestinations.tripId,
      name: destinations.name,
      position: tripDestinations.position,
    })
    .from(tripDestinations)
    .innerJoin(destinations, eq(destinations.id, tripDestinations.destinationId))
    .where(inArray(tripDestinations.tripId, ids))
    .orderBy(asc(tripDestinations.position));
  const byTrip = new Map<string, string[]>();
  for (const d of dests) byTrip.set(d.tripId, [...(byTrip.get(d.tripId) ?? []), d.name]);
  return rows.map(({ trip, role, placeCount, memberCount }) => ({
    id: trip.id,
    slug: trip.slug,
    name: trip.name,
    kind: trip.kind,
    coverUrl: trip.coverUrl,
    startDate: trip.startDate,
    endDate: trip.endDate,
    dayCount: trip.dayCount,
    visibility: trip.visibility,
    role,
    destinations: byTrip.get(trip.id) ?? [],
    placeCount: Number(placeCount),
    memberCount: Number(memberCount),
    archived: Boolean(trip.archivedAt),
    updatedAt: trip.updatedAt.toISOString(),
  }));
}

export async function getTripDestinations(tripId: string): Promise<DestinationDTO[]> {
  const rows = await db
    .select({ d: destinations })
    .from(tripDestinations)
    .innerJoin(destinations, eq(destinations.id, tripDestinations.destinationId))
    .where(eq(tripDestinations.tripId, tripId))
    .orderBy(asc(tripDestinations.position));
  return rows.map((r) => toDTO(r.d));
}

export type TripMemberInfo = {
  userId: string;
  name: string;
  image: string | null;
  email: string;
  role: "owner" | "editor" | "viewer";
  joinedAt: string;
};

export async function getTripMembers(tripId: string): Promise<TripMemberInfo[]> {
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      image: user.image,
      email: user.email,
      role: tripMembers.role,
      joinedAt: tripMembers.joinedAt,
    })
    .from(tripMembers)
    .innerJoin(user, eq(user.id, tripMembers.userId))
    .where(eq(tripMembers.tripId, tripId))
    .orderBy(asc(tripMembers.joinedAt));
  return rows.map((r) => ({ ...r, joinedAt: r.joinedAt.toISOString() }));
}

export async function getTripDays(tripId: string) {
  return db
    .select()
    .from(itineraryDays)
    .where(eq(itineraryDays.tripId, tripId))
    .orderBy(asc(itineraryDays.dayIndex));
}

export async function findTripBySlug(slug: string) {
  const [row] = await db.select().from(trips).where(eq(trips.slug, slug)).limit(1);
  return row ?? null;
}

export async function listPublicTripsForDestination(destinationId: string, limit = 12) {
  return db
    .select({ trip: trips })
    .from(tripDestinations)
    .innerJoin(trips, eq(trips.id, tripDestinations.tripId))
    .where(
      and(
        eq(tripDestinations.destinationId, destinationId),
        eq(trips.visibility, "public"),
        isNull(trips.archivedAt),
      ),
    )
    .orderBy(desc(trips.updatedAt))
    .limit(limit);
}

export async function isOwnerOrEditor(tripId: string, userId: string) {
  const [m] = await db
    .select({ role: tripMembers.role })
    .from(tripMembers)
    .where(
      and(
        eq(tripMembers.tripId, tripId),
        eq(tripMembers.userId, userId),
        or(eq(tripMembers.role, "owner"), eq(tripMembers.role, "editor")),
      ),
    )
    .limit(1);
  return Boolean(m);
}
