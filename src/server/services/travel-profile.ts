import "server-only";
import { and, eq, inArray, isNotNull, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { toCents } from "@/lib/money";
import {
  computeTravelProfile,
  EMPTY_PROFILE,
  type ProfileTripInput,
  type TravelProfile,
} from "@/lib/travel-profile";
import { db } from "@/server/db";
import {
  destinations,
  expenses,
  itineraryDays,
  itineraryItems,
  places,
  tripDestinations,
  tripMembers,
  tripPlaces,
  trips,
  userTravelProfiles,
} from "@/server/db/schema";

/** Trips count towards the profile once they are over, or once marked completed. */
async function finishedTripIds(userId: string): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({ id: trips.id, endDate: trips.endDate, completedAt: trips.completedAt })
    .from(tripMembers)
    .innerJoin(trips, eq(trips.id, tripMembers.tripId))
    .where(and(eq(tripMembers.userId, userId), eq(trips.kind, "plan")));
  return rows
    .filter((r) => r.completedAt !== null || (r.endDate !== null && r.endDate < today))
    .map((r) => r.id);
}

async function gatherTrip(tripId: string): Promise<ProfileTripInput> {
  const [days, items, dests, spend] = await Promise.all([
    db.select().from(itineraryDays).where(eq(itineraryDays.tripId, tripId)),
    db
      .select({
        item: itineraryItems,
        place: places,
        visited: tripPlaces.visited,
        placeId: places.id,
      })
      .from(itineraryItems)
      .leftJoin(tripPlaces, eq(tripPlaces.id, itineraryItems.tripPlaceId))
      .leftJoin(places, eq(places.id, tripPlaces.placeId))
      .where(eq(itineraryItems.tripId, tripId)),
    db
      .select({
        destinationId: tripDestinations.destinationId,
        countryCode: destinations.countryCode,
      })
      .from(tripDestinations)
      .innerJoin(destinations, eq(destinations.id, tripDestinations.destinationId))
      .where(eq(tripDestinations.tripId, tripId)),
    db.select({ amount: expenses.amount }).from(expenses).where(eq(expenses.tripId, tripId)),
  ]);

  const byDay = new Map<string, Array<(typeof items)[number]>>();
  for (const item of items)
    byDay.set(item.item.dayId, [...(byDay.get(item.item.dayId) ?? []), item]);

  return {
    tripId,
    destinationIds: dests.map((d) => d.destinationId),
    countryCodes: dests.map((d) => d.countryCode),
    days: days.map((d) => {
      const dayItems = (byDay.get(d.id) ?? []).filter((i) => i.place);
      const times = dayItems
        .map((i) => i.item.startTime)
        .filter((t): t is string => Boolean(t))
        .sort();
      return {
        stops: dayItems.length,
        firstStartTime: times[0]?.slice(0, 5) ?? null,
        travelMode: d.travelMode ?? null,
      };
    }),
    placeTypes: items.flatMap((i) => i.place?.types ?? []),
    visitedPlaceIds: items.filter((i) => i.visited && i.placeId).map((i) => i.placeId!),
    spendCents: spend.length > 0 ? spend.reduce((sum, e) => sum + toCents(e.amount), 0) : null,
  };
}

/** Rebuilds and stores the traveller's profile from every trip that has finished. */
export async function recomputeTravelProfile(userId: string): Promise<TravelProfile> {
  const ids = await finishedTripIds(userId);
  const inputs = await Promise.all(ids.map(gatherTrip));
  const profile = computeTravelProfile(inputs);
  await db
    .insert(userTravelProfiles)
    .values({ userId, data: profile, computedAt: new Date() })
    .onConflictDoUpdate({
      target: userTravelProfiles.userId,
      set: { data: profile, computedAt: new Date() },
    });
  return profile;
}

const STALE_MS = 24 * 3600 * 1000;

export async function getTravelProfile(userId: string): Promise<TravelProfile> {
  const [row] = await db
    .select()
    .from(userTravelProfiles)
    .where(eq(userTravelProfiles.userId, userId))
    .limit(1);
  if (row && Date.now() - row.computedAt.getTime() < STALE_MS) return row.data;
  try {
    return await recomputeTravelProfile(userId);
  } catch (err) {
    console.error("travel profile recompute failed", err);
    return row?.data ?? EMPTY_PROFILE;
  }
}

export type LovedPlace = {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  primaryType: string | null;
  googlePlaceId: string | null;
};

/** Places this traveller ticked off before, in the destinations this trip visits. */
export async function lovedPlacesForTrip(
  tripId: string,
  userId: string,
  limit = 8,
): Promise<LovedPlace[]> {
  const profile = await getTravelProfile(userId);
  if (profile.favoritePlaceIds.length === 0) return [];
  const dests = await db
    .select({ id: tripDestinations.destinationId })
    .from(tripDestinations)
    .where(eq(tripDestinations.tripId, tripId));
  if (dests.length === 0) return [];
  const destIds = dests.map((d) => d.id);
  // Keep only favourites that sit in a trip this user took to one of these destinations.
  const rows = await db
    .selectDistinct({
      placeId: places.id,
      name: places.name,
      lat: places.lat,
      lng: places.lng,
      primaryType: places.primaryType,
      googlePlaceId: places.googlePlaceId,
    })
    .from(tripPlaces)
    .innerJoin(places, eq(places.id, tripPlaces.placeId))
    .innerJoin(tripDestinations, eq(tripDestinations.tripId, tripPlaces.tripId))
    .where(
      and(
        inArray(places.id, profile.favoritePlaceIds),
        inArray(tripDestinations.destinationId, destIds),
        ne(tripPlaces.tripId, tripId),
      ),
    )
    .limit(limit);
  return rows;
}

export type FriendPlace = LovedPlace & { friendNames: string[] };

/** Places friends saved in the same destinations, so their picks surface while planning. */
export async function friendPlacesForTrip(
  tripId: string,
  userId: string,
  friendIds: string[],
  limit = 10,
): Promise<FriendPlace[]> {
  if (friendIds.length === 0) return [];
  const ownTrips = alias(tripMembers, "own_trips");
  const dests = await db
    .select({ id: tripDestinations.destinationId })
    .from(tripDestinations)
    .where(eq(tripDestinations.tripId, tripId));
  if (dests.length === 0) return [];
  const rows = await db
    .select({
      placeId: places.id,
      name: places.name,
      lat: places.lat,
      lng: places.lng,
      primaryType: places.primaryType,
      googlePlaceId: places.googlePlaceId,
      friendId: tripMembers.userId,
    })
    .from(tripPlaces)
    .innerJoin(places, eq(places.id, tripPlaces.placeId))
    .innerJoin(tripMembers, eq(tripMembers.tripId, tripPlaces.tripId))
    .innerJoin(tripDestinations, eq(tripDestinations.tripId, tripPlaces.tripId))
    .where(
      and(
        inArray(tripMembers.userId, friendIds),
        inArray(
          tripDestinations.destinationId,
          dests.map((d) => d.id),
        ),
        ne(tripPlaces.tripId, tripId),
        // Their trips, not ones we planned together, so the signal is genuinely a friend's.
        notExists(
          db
            .select({ one: sql`1` })
            .from(ownTrips)
            .where(and(eq(ownTrips.tripId, tripPlaces.tripId), eq(ownTrips.userId, userId))),
        ),
        or(eq(tripPlaces.visited, true), isNotNull(tripPlaces.notes)),
      ),
    )
    .limit(limit * 4);

  const grouped = new Map<string, FriendPlace>();
  for (const row of rows) {
    const existing = grouped.get(row.placeId);
    if (existing) {
      if (!existing.friendNames.includes(row.friendId)) existing.friendNames.push(row.friendId);
      continue;
    }
    grouped.set(row.placeId, {
      placeId: row.placeId,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      primaryType: row.primaryType,
      googlePlaceId: row.googlePlaceId,
      friendNames: [row.friendId],
    });
  }
  return [...grouped.values()].slice(0, limit);
}

/** Days from past trips to the same destinations, offered as "copy a day". */
export async function pastDaysForTrip(tripId: string, userId: string, limit = 12) {
  const dests = await db
    .select({ id: tripDestinations.destinationId })
    .from(tripDestinations)
    .where(eq(tripDestinations.tripId, tripId));
  if (dests.length === 0) return [];
  const rows = await db
    .select({
      dayId: itineraryDays.id,
      dayIndex: itineraryDays.dayIndex,
      title: itineraryDays.title,
      tripId: trips.id,
      tripName: trips.name,
    })
    .from(itineraryDays)
    .innerJoin(trips, eq(trips.id, itineraryDays.tripId))
    .innerJoin(tripMembers, and(eq(tripMembers.tripId, trips.id), eq(tripMembers.userId, userId)))
    .innerJoin(tripDestinations, eq(tripDestinations.tripId, trips.id))
    .where(
      and(
        ne(trips.id, tripId),
        inArray(
          tripDestinations.destinationId,
          dests.map((d) => d.id),
        ),
      ),
    )
    .limit(limit);
  const counts = await db
    .select({ dayId: itineraryItems.dayId, tripPlaceId: itineraryItems.tripPlaceId })
    .from(itineraryItems)
    .where(
      inArray(
        itineraryItems.dayId,
        rows.map((r) => r.dayId),
      ),
    );
  const stopsByDay = new Map<string, number>();
  for (const c of counts)
    if (c.tripPlaceId) stopsByDay.set(c.dayId, (stopsByDay.get(c.dayId) ?? 0) + 1);
  return rows
    .map((r) => ({ ...r, stops: stopsByDay.get(r.dayId) ?? 0 }))
    .filter((r) => r.stops > 0)
    .sort((a, b) => b.stops - a.stops);
}
