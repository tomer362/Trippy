import "server-only";
import { asc, eq } from "drizzle-orm";
import { placeSequence } from "@/lib/itinerary";
import type { TravelMode } from "@/lib/types";
import { db } from "@/server/db";
import { itineraryDays, itineraryItems, places, tripLists, tripPlaces } from "@/server/db/schema";
import { getCachedSequenceLegs, type Leg } from "@/server/services/routing";

export { placeSequence };

export type ItineraryPlace = {
  tripPlaceId: string;
  placeId: string;
  googlePlaceId: string | null;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  primaryType: string | null;
  googleMapsUri: string | null;
  notes: string | null;
  cost: string | null;
  currency: string | null;
  visited: boolean;
  colorHint: string | null;
};

export type ItineraryItemDTO = {
  id: string;
  kind: "place" | "note" | "checklist" | "lodging" | "reservation" | "expense" | "break";
  position: number;
  text: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMin: number | null;
  travelModeOverride: TravelMode | null;
  done: boolean;
  refId: string | null;
  version: number;
  place: ItineraryPlace | null;
};

export type ItineraryLegDTO = { afterItemId: string; beforeItemId: string; leg: Leg | null };

export type ItineraryDayDTO = {
  id: string;
  dayIndex: number;
  date: string | null;
  title: string | null;
  notes: unknown;
  travelMode: TravelMode | null;
  color: string | null;
  collapsed: boolean;
  version: number;
  startPlaceId: string | null;
  endPlaceId: string | null;
  items: ItineraryItemDTO[];
  legs: ItineraryLegDTO[];
};

export async function getItinerary(
  tripId: string,
  defaultMode: TravelMode,
): Promise<ItineraryDayDTO[]> {
  const [days, itemRows] = await Promise.all([
    db
      .select()
      .from(itineraryDays)
      .where(eq(itineraryDays.tripId, tripId))
      .orderBy(asc(itineraryDays.dayIndex)),
    db
      .select({ item: itineraryItems, tp: tripPlaces, p: places, list: tripLists })
      .from(itineraryItems)
      .leftJoin(tripPlaces, eq(tripPlaces.id, itineraryItems.tripPlaceId))
      .leftJoin(places, eq(places.id, tripPlaces.placeId))
      .leftJoin(tripLists, eq(tripLists.id, tripPlaces.listId))
      .where(eq(itineraryItems.tripId, tripId))
      .orderBy(asc(itineraryItems.position)),
  ]);

  const itemsByDay = new Map<string, ItineraryItemDTO[]>();
  for (const row of itemRows) {
    const dto: ItineraryItemDTO = {
      id: row.item.id,
      kind: row.item.kind,
      position: row.item.position,
      text: row.item.text,
      startTime: row.item.startTime,
      endTime: row.item.endTime,
      durationMin: row.item.durationMin,
      travelModeOverride: row.item.travelModeOverride,
      done: row.item.done,
      refId: row.item.refId,
      version: row.item.version,
      place:
        row.tp && row.p
          ? {
              tripPlaceId: row.tp.id,
              placeId: row.p.id,
              googlePlaceId: row.p.googlePlaceId,
              name: row.tp.titleOverride ?? row.p.name,
              address: row.p.formattedAddress,
              lat: row.p.lat,
              lng: row.p.lng,
              primaryType: row.p.primaryType,
              googleMapsUri: row.p.googleMapsUri,
              notes: row.tp.notes,
              cost: row.tp.cost,
              currency: row.tp.currency,
              visited: row.tp.visited,
              colorHint: row.tp.color ?? row.list?.color ?? null,
            }
          : null,
    };
    itemsByDay.set(row.item.dayId, [...(itemsByDay.get(row.item.dayId) ?? []), dto]);
  }

  return Promise.all(
    days.map(async (d) => {
      const items = (itemsByDay.get(d.id) ?? []).sort((a, b) => a.position - b.position);
      const stops = placeSequence(items);
      const mode = d.travelMode ?? defaultMode;
      const cached = await getCachedSequenceLegs(
        stops.map((s) => s.place!.placeId),
        mode,
      );
      const legs: ItineraryLegDTO[] = stops.slice(0, -1).map((s, i) => ({
        afterItemId: s.id,
        beforeItemId: stops[i + 1]!.id,
        leg: cached[i] ?? null,
      }));
      return {
        id: d.id,
        dayIndex: d.dayIndex,
        date: d.date,
        title: d.title,
        notes: d.notes,
        travelMode: d.travelMode,
        color: d.color,
        collapsed: d.collapsed,
        version: d.version,
        startPlaceId: d.startPlaceId,
        endPlaceId: d.endPlaceId,
        items,
        legs,
      };
    }),
  );
}

export async function getDay(tripId: string, dayId: string) {
  const [row] = await db.select().from(itineraryDays).where(eq(itineraryDays.id, dayId)).limit(1);
  return row && row.tripId === tripId ? row : null;
}

/** Saved places not yet scheduled anywhere, offered when adding to a day. */
export async function getUnscheduledPlaces(tripId: string): Promise<ItineraryPlace[]> {
  const scheduled = await db
    .select({ id: itineraryItems.tripPlaceId })
    .from(itineraryItems)
    .where(eq(itineraryItems.tripId, tripId));
  const used = new Set(scheduled.map((s) => s.id).filter(Boolean) as string[]);
  const rows = await db
    .select({ tp: tripPlaces, p: places, list: tripLists })
    .from(tripPlaces)
    .innerJoin(places, eq(places.id, tripPlaces.placeId))
    .leftJoin(tripLists, eq(tripLists.id, tripPlaces.listId))
    .where(eq(tripPlaces.tripId, tripId))
    .orderBy(asc(tripPlaces.position));
  return rows
    .filter((r) => !used.has(r.tp.id))
    .map((r) => ({
      tripPlaceId: r.tp.id,
      placeId: r.p.id,
      googlePlaceId: r.p.googlePlaceId,
      name: r.tp.titleOverride ?? r.p.name,
      address: r.p.formattedAddress,
      lat: r.p.lat,
      lng: r.p.lng,
      primaryType: r.p.primaryType,
      googleMapsUri: r.p.googleMapsUri,
      notes: r.tp.notes,
      cost: r.tp.cost,
      currency: r.tp.currency,
      visited: r.tp.visited,
      colorHint: r.tp.color ?? r.list?.color ?? null,
    }));
}
