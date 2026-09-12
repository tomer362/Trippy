"use server";
import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { features } from "@/env";
import { requireTripAccess } from "@/server/authz";
import { db } from "@/server/db";
import {
  activities,
  destinations,
  tripDestinations,
  tripLists,
  tripPlaces,
  trips,
} from "@/server/db/schema";
import { bboxToViewport, textSearch } from "@/server/services/google/places";
import { createManualPlace, ensurePlace } from "@/server/services/places";
import { action } from "./_helpers";

const MAX_IMPORT = 30;

const schema = z.object({
  tripId: z.string(),
  listName: z.string().trim().min(1).max(80).default("Imported"),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(120),
        lat: z.number().optional(),
        lng: z.number().optional(),
      }),
    )
    .min(1)
    .max(MAX_IMPORT),
});

/**
 * Resolves reviewed place names against Google Places and saves the matches into a new
 * list. Names that cannot be matched are reported back rather than silently dropped; ones
 * that arrived with coordinates are kept as manual pins so nothing is lost.
 */
export const importPlaces = action(schema, async ({ tripId, listName, items }, userId) => {
  const access = await requireTripAccess(tripId, userId, "edit");

  const dests = await db
    .select({ bbox: destinations.bbox, name: destinations.name })
    .from(tripDestinations)
    .innerJoin(destinations, eq(destinations.id, tripDestinations.destinationId))
    .where(eq(tripDestinations.tripId, tripId));
  const bbox = dests.find((d) => d.bbox)?.bbox ?? null;
  const near = dests.map((d) => d.name).join(", ");

  const [listRow] = await db
    .select({ max: max(tripLists.position) })
    .from(tripLists)
    .where(eq(tripLists.tripId, tripId));
  const [list] = await db
    .insert(tripLists)
    .values({
      tripId,
      name: listName,
      kind: "custom",
      color: "teal",
      icon: "map-pin",
      position: (listRow?.max ?? -1) + 1,
    })
    .returning();

  const [positionRow] = await db
    .select({ max: max(tripPlaces.position) })
    .from(tripPlaces)
    .where(and(eq(tripPlaces.tripId, tripId), eq(tripPlaces.listId, list!.id)));
  let position = (positionRow?.max ?? -1) + 1;

  const added: string[] = [];
  const unmatched: string[] = [];

  for (const item of items) {
    let placeId: string | null = null;
    if (features.mapsServer) {
      try {
        const results = await textSearch({
          query: near ? `${item.name} ${near}` : item.name,
          viewport: bbox ? bboxToViewport(bbox) : undefined,
          maxResults: 1,
        });
        const best = results[0];
        if (best?.id) placeId = (await ensurePlace(best.id)).id;
      } catch (err) {
        console.error("import lookup failed", item.name, err);
      }
    }
    if (!placeId && item.lat !== undefined && item.lng !== undefined) {
      placeId = (await createManualPlace({ name: item.name, lat: item.lat, lng: item.lng })).id;
    }
    if (!placeId) {
      unmatched.push(item.name);
      continue;
    }
    await db
      .insert(tripPlaces)
      .values({ tripId, listId: list!.id, placeId, position: position++, addedBy: userId });
    added.push(item.name);
  }

  if (added.length === 0) {
    await db.delete(tripLists).where(eq(tripLists.id, list!.id));
  } else {
    await db.insert(activities).values({
      tripId,
      actorId: userId,
      type: "places.imported",
      summary: `imported ${added.length} place${added.length === 1 ? "" : "s"} into ${listName}`,
    });
    await db.update(trips).set({ updatedAt: new Date() }).where(eq(trips.id, tripId));
  }

  revalidatePath(`/t/${tripId}/places`);
  return {
    added: added.length,
    unmatched,
    listId: added.length > 0 ? list!.id : null,
    mapsConfigured: features.mapsServer,
    tripName: access.trip.name,
  };
});
