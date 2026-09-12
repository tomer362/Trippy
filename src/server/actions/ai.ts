"use server";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { features } from "@/env";
import type { DaySuggestion, SuggestedStop } from "@/lib/ai-suggest";
import { favouriteCategories } from "@/lib/travel-profile";
import { requireTripAccess } from "@/server/authz";
import { db } from "@/server/db";
import { itineraryDays, itineraryItems, places, tripPlaces, trips } from "@/server/db/schema";
import { getTripDestinations } from "@/server/queries/trips";
import { AiUnavailableError, suggestDayPlan } from "@/server/services/ai";
import { unionBBox } from "@/server/services/destinations";
import { bboxToViewport, textSearch } from "@/server/services/google/places";
import { ensurePlace } from "@/server/services/places";
import { getTravelProfile } from "@/server/services/travel-profile";
import { saveTripPlace } from "@/server/services/trip-places";
import { action } from "./_helpers";

/** Days without a pacing history get a comfortable default. */
const DEFAULT_TARGET_STOPS = 4;
/** Adding places costs a Places call each, so one round is capped. */
const MAX_STOPS_PER_ADD = 8;

async function dayContextFor(
  tripId: string,
  dayId: string,
  userId: string,
  request: string | null,
) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) throw new Error("Trip not found");
  const [day] = await db
    .select()
    .from(itineraryDays)
    .where(and(eq(itineraryDays.id, dayId), eq(itineraryDays.tripId, tripId)))
    .limit(1);
  if (!day) throw new Error("Day not found");

  const [destinations, rows, profile] = await Promise.all([
    getTripDestinations(tripId),
    db
      .select({
        name: places.name,
        titleOverride: tripPlaces.titleOverride,
        startTime: itineraryItems.startTime,
        dayId: itineraryItems.dayId,
        position: itineraryItems.position,
      })
      .from(tripPlaces)
      .innerJoin(places, eq(places.id, tripPlaces.placeId))
      .leftJoin(itineraryItems, eq(itineraryItems.tripPlaceId, tripPlaces.id))
      .where(eq(tripPlaces.tripId, tripId))
      .orderBy(asc(itineraryItems.position)),
    getTravelProfile(userId).catch(() => null),
  ]);

  const named = rows.map((r) => ({ ...r, name: r.titleOverride ?? r.name }));
  const existingStops = named
    .filter((r) => r.dayId === dayId)
    .map((r) => ({ name: r.name, startTime: r.startTime?.slice(0, 5) ?? null }));
  // Anything saved elsewhere in the trip is off limits too, or the model repeats it.
  const savedPlaces = [...new Set(named.filter((r) => r.dayId !== dayId).map((r) => r.name))];

  const target = profile?.avgStopsPerDay
    ? Math.round(profile.avgStopsPerDay)
    : DEFAULT_TARGET_STOPS;

  return {
    tripName: trip.name,
    destinations: destinations.map((d) => d.name),
    dayLabel: day.title ?? `Day ${day.dayIndex + 1}`,
    date: day.date,
    travelMode: day.travelMode ?? trip.defaultTravelMode,
    existingStops,
    savedPlaces,
    targetStops: Math.min(8, Math.max(2, target)),
    favouriteCategories: profile ? favouriteCategories(profile) : [],
    request,
  };
}

/**
 * Drafts stops for one day. Nothing is written to the trip here — the traveller reviews
 * the list and picks what to keep.
 */
export const suggestDay = action(
  z.object({
    tripId: z.string(),
    dayId: z.string(),
    request: z.string().max(300).nullable().optional(),
  }),
  async ({ tripId, dayId, request }, userId): Promise<DaySuggestion> => {
    await requireTripAccess(tripId, userId, "edit");
    if (!features.ai) throw new AiUnavailableError();
    const ctx = await dayContextFor(tripId, dayId, userId, request ?? null);
    return suggestDayPlan(ctx);
  },
);

export type AddedSuggestions = { added: string[]; unmatched: string[] };

/**
 * Turns accepted suggestions into real places: each one is looked up on Google within the
 * trip's area, so only places that genuinely exist land on the day.
 */
export const addSuggestedStops = action(
  z.object({
    tripId: z.string(),
    dayId: z.string(),
    stops: z
      .array(
        z.object({
          name: z.string().min(1).max(120),
          searchQuery: z.string().min(1).max(200),
          startTime: z
            .string()
            .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
            .nullable(),
          durationMin: z.number().int().min(15).max(600).nullable(),
        }),
      )
      .min(1)
      .max(MAX_STOPS_PER_ADD),
  }),
  async ({ tripId, dayId, stops }, userId): Promise<AddedSuggestions> => {
    await requireTripAccess(tripId, userId, "edit");
    const [day] = await db
      .select({ id: itineraryDays.id })
      .from(itineraryDays)
      .where(and(eq(itineraryDays.id, dayId), eq(itineraryDays.tripId, tripId)))
      .limit(1);
    if (!day) throw new Error("Day not found");

    const destinations = await getTripDestinations(tripId);
    const view = unionBBox(
      destinations.map((d) => ({ lat: d.lat, lng: d.lng, bbox: d.bbox, zoom: d.zoom })),
    );
    const viewport = view && "bbox" in view ? bboxToViewport(view.bbox) : undefined;

    const added: string[] = [];
    const unmatched: string[] = [];
    for (const stop of stops) {
      let place = null;
      if (features.mapsServer) {
        try {
          const [best] = await textSearch({ query: stop.searchQuery, viewport, maxResults: 1 });
          if (best?.id) place = await ensurePlace(best.id);
        } catch (err) {
          console.error("suggestion lookup failed", stop.searchQuery, err);
        }
      }
      if (!place) {
        unmatched.push(stop.name);
        continue;
      }
      await saveTripPlace({
        tripId,
        userId,
        place,
        dayId,
        startTime: stop.startTime,
        durationMin: stop.durationMin,
        activityType: "place.suggested",
        activitySummary: `added ${place.name} from a suggested day`,
      });
      added.push(place.name);
    }

    await db.update(trips).set({ updatedAt: new Date() }).where(eq(trips.id, tripId));
    revalidatePath(`/t/${tripId}/itinerary`);
    revalidatePath(`/t/${tripId}`);
    return { added, unmatched };
  },
);

export type { DaySuggestion, SuggestedStop };
