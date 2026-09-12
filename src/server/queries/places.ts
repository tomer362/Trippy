import "server-only";
import { asc, eq } from "drizzle-orm";
import type { MarkerColor } from "@/lib/colors";
import { db } from "@/server/db";
import { itineraryDays, itineraryItems, places, tripLists, tripPlaces } from "@/server/db/schema";

export type TripPlaceDTO = {
  id: string;
  listId: string | null;
  placeId: string;
  googlePlaceId: string | null;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  primaryType: string | null;
  googleMapsUri: string | null;
  website: string | null;
  phone: string | null;
  notes: string | null;
  cost: string | null;
  currency: string | null;
  visited: boolean;
  color: string | null;
  position: number;
  /** Day indexes this place is scheduled on, so lists can show "Day 2" chips. */
  dayIndexes: number[];
  version: number;
};

export type TripListDTO = {
  id: string;
  name: string;
  kind: "places" | "restaurants" | "hotels" | "custom";
  color: MarkerColor;
  icon: string;
  position: number;
  hiddenOnMap: boolean;
  version: number;
  places: TripPlaceDTO[];
};

/** Every list and saved place for a trip, with the days each place appears on. */
export async function getTripPlaces(
  tripId: string,
): Promise<{ lists: TripListDTO[]; unlisted: TripPlaceDTO[] }> {
  const [lists, rows, scheduled] = await Promise.all([
    db
      .select()
      .from(tripLists)
      .where(eq(tripLists.tripId, tripId))
      .orderBy(asc(tripLists.position)),
    db
      .select({ tp: tripPlaces, p: places })
      .from(tripPlaces)
      .innerJoin(places, eq(places.id, tripPlaces.placeId))
      .where(eq(tripPlaces.tripId, tripId))
      .orderBy(asc(tripPlaces.position)),
    db
      .select({ tripPlaceId: itineraryItems.tripPlaceId, dayIndex: itineraryDays.dayIndex })
      .from(itineraryItems)
      .innerJoin(itineraryDays, eq(itineraryDays.id, itineraryItems.dayId))
      .where(eq(itineraryItems.tripId, tripId)),
  ]);

  const daysByPlace = new Map<string, number[]>();
  for (const s of scheduled) {
    if (!s.tripPlaceId) continue;
    daysByPlace.set(
      s.tripPlaceId,
      [...(daysByPlace.get(s.tripPlaceId) ?? []), s.dayIndex].sort((a, b) => a - b),
    );
  }

  const dto = (row: (typeof rows)[number]): TripPlaceDTO => ({
    id: row.tp.id,
    listId: row.tp.listId,
    placeId: row.p.id,
    googlePlaceId: row.p.googlePlaceId,
    name: row.tp.titleOverride ?? row.p.name,
    address: row.p.formattedAddress,
    lat: row.p.lat,
    lng: row.p.lng,
    primaryType: row.p.primaryType,
    googleMapsUri: row.p.googleMapsUri,
    website: row.p.website,
    phone: row.p.phone,
    notes: row.tp.notes,
    cost: row.tp.cost,
    currency: row.tp.currency,
    visited: row.tp.visited,
    color: row.tp.color,
    position: row.tp.position,
    dayIndexes: daysByPlace.get(row.tp.id) ?? [],
    version: row.tp.version,
  });

  const all = rows.map(dto);
  const byList = new Map<string, TripPlaceDTO[]>();
  const unlisted: TripPlaceDTO[] = [];
  for (const p of all) {
    if (p.listId) byList.set(p.listId, [...(byList.get(p.listId) ?? []), p]);
    else unlisted.push(p);
  }
  return {
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      color: l.color as MarkerColor,
      icon: l.icon,
      position: l.position,
      hiddenOnMap: l.hiddenOnMap,
      version: l.version,
      places: byList.get(l.id) ?? [],
    })),
    unlisted,
  };
}

export async function getTripLists(tripId: string) {
  return db
    .select()
    .from(tripLists)
    .where(eq(tripLists.tripId, tripId))
    .orderBy(asc(tripLists.position));
}
