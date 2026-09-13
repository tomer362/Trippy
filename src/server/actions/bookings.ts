"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTripAccess } from "@/server/authz";
import { db } from "@/server/db";
import { activities, attachments, lodgings, reservations, trips } from "@/server/db/schema";
import { assertInTrip } from "@/server/scope";
import { ensurePlace } from "@/server/services/places";
import { publishTripChange } from "@/server/services/realtime";
import {
  deleteStored,
  isStoredBlobUrl,
  tripIdFromPath,
  UPLOAD_LIMITS,
} from "@/server/services/storage";
import { action } from "./_helpers";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const clockTime = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Use HH:MM")
  .nullable();

async function touch(tripId: string) {
  await db.update(trips).set({ updatedAt: new Date() }).where(eq(trips.id, tripId));
  revalidatePath(`/t/${tripId}/lodging`);
  revalidatePath(`/t/${tripId}/reservations`);
  revalidatePath(`/t/${tripId}/itinerary`);
}

/* ------------------------------- lodging -------------------------------- */

const lodgingFields = z.object({
  tripId: z.string(),
  googlePlaceId: z.string().optional(),
  name: z.string().trim().min(1, "Name the place you're staying").max(200),
  address: z.string().max(300).nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  checkIn: isoDate,
  checkOut: isoDate,
  checkInTime: clockTime.optional(),
  checkOutTime: clockTime.optional(),
  confirmationNo: z.string().max(80).nullable().optional(),
  price: z.string().max(20).nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  bookingUrl: z.string().url().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const lodgingSchema = lodgingFields.refine((v) => v.checkOut > v.checkIn, {
  message: "Check-out must be after check-in",
  path: ["checkOut"],
});

export const addLodging = action(
  lodgingSchema,
  async ({ tripId, googlePlaceId, ...input }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    const place = googlePlaceId ? await ensurePlace(googlePlaceId) : null;
    const [created] = await db
      .insert(lodgings)
      .values({
        tripId,
        placeId: place?.id ?? null,
        name: input.name || place?.name || "Lodging",
        address: input.address ?? place?.formattedAddress ?? null,
        lat: input.lat ?? place?.lat ?? null,
        lng: input.lng ?? place?.lng ?? null,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        checkInTime: input.checkInTime ?? null,
        checkOutTime: input.checkOutTime ?? null,
        confirmationNo: input.confirmationNo ?? null,
        price: input.price ?? null,
        currency: input.currency ?? null,
        bookingUrl: input.bookingUrl ?? null,
        notes: input.notes ?? null,
        createdBy: userId,
      })
      .returning();
    await db.insert(activities).values({
      tripId,
      actorId: userId,
      type: "lodging.added",
      entityType: "lodging",
      entityId: created!.id,
      summary: `added ${created!.name}`,
    });
    await touch(tripId);
    await publishTripChange(tripId, { entity: "lodging", id: created!.id, actorId: userId });
    return { id: created!.id };
  },
);

export const updateLodging = action(
  lodgingFields.partial().extend({ tripId: z.string(), id: z.string() }),
  async ({ tripId, id, googlePlaceId: _googlePlaceId, ...patch }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    if (patch.checkIn && patch.checkOut && patch.checkOut <= patch.checkIn)
      throw new Error("Check-out must be after check-in");
    await db
      .update(lodgings)
      .set({ ...patch, version: sql`${lodgings.version} + 1` })
      .where(and(eq(lodgings.id, id), eq(lodgings.tripId, tripId)));
    await touch(tripId);
    await publishTripChange(tripId, { entity: "lodging", id, actorId: userId });
    return null;
  },
);

export const removeLodging = action(
  z.object({ tripId: z.string(), id: z.string() }),
  async ({ tripId, id }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db.delete(lodgings).where(and(eq(lodgings.id, id), eq(lodgings.tripId, tripId)));
    await touch(tripId);
    await publishTripChange(tripId, { entity: "lodging", actorId: userId });
    return null;
  },
);

/* ----------------------------- reservations ------------------------------ */

const reservationKind = z.enum([
  "flight",
  "train",
  "bus",
  "ferry",
  "car",
  "restaurant",
  "activity",
  "other",
]);

const reservationSchema = z.object({
  tripId: z.string(),
  kind: reservationKind,
  title: z.string().trim().min(1, "Give the booking a name").max(200),
  startAt: z.string().datetime({ offset: true }).nullable().optional(),
  endAt: z.string().datetime({ offset: true }).nullable().optional(),
  timezone: z.string().max(60).nullable().optional(),
  googlePlaceId: z.string().optional(),
  confirmationNo: z.string().max(80).nullable().optional(),
  price: z.string().max(20).nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const addReservation = action(
  reservationSchema,
  async ({ tripId, googlePlaceId, startAt, endAt, ...input }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    const place = googlePlaceId ? await ensurePlace(googlePlaceId) : null;
    const [created] = await db
      .insert(reservations)
      .values({
        tripId,
        kind: input.kind,
        title: input.title,
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
        timezone: input.timezone ?? null,
        placeId: place?.id ?? null,
        details: input.details ?? {},
        confirmationNo: input.confirmationNo ?? null,
        price: input.price ?? null,
        currency: input.currency ?? null,
        notes: input.notes ?? null,
        createdBy: userId,
      })
      .returning();
    await db.insert(activities).values({
      tripId,
      actorId: userId,
      type: "reservation.added",
      entityType: "reservation",
      entityId: created!.id,
      summary: `added ${created!.title}`,
    });
    await touch(tripId);
    await publishTripChange(tripId, { entity: "reservations", id: created!.id, actorId: userId });
    return { id: created!.id };
  },
);

export const updateReservation = action(
  reservationSchema.partial().extend({ tripId: z.string(), id: z.string() }),
  async ({ tripId, id, googlePlaceId: _googlePlaceId, startAt, endAt, ...patch }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db
      .update(reservations)
      .set({
        ...patch,
        ...(startAt !== undefined ? { startAt: startAt ? new Date(startAt) : null } : {}),
        ...(endAt !== undefined ? { endAt: endAt ? new Date(endAt) : null } : {}),
        version: sql`${reservations.version} + 1`,
      })
      .where(and(eq(reservations.id, id), eq(reservations.tripId, tripId)));
    await touch(tripId);
    await publishTripChange(tripId, { entity: "reservations", id, actorId: userId });
    return null;
  },
);

export const removeReservation = action(
  z.object({ tripId: z.string(), id: z.string() }),
  async ({ tripId, id }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db
      .delete(reservations)
      .where(and(eq(reservations.id, id), eq(reservations.tripId, tripId)));
    await touch(tripId);
    await publishTripChange(tripId, { entity: "reservations", actorId: userId });
    return null;
  },
);

/* ------------------------------ attachments ------------------------------ */

const registerSchema = z.object({
  tripId: z.string(),
  entityType: z.enum(["trip", "lodging", "reservation", "expense", "journal"]),
  entityId: z.string(),
  kind: z.enum(["attachment", "journal", "cover"]),
  // Rejected here too, so a row that could later be redirected to is never created.
  url: z.string().url().refine(isStoredBlobUrl, "That file is not in our storage"),
  pathname: z.string().min(1),
  filename: z.string().min(1).max(200),
  mime: z.string().min(1).max(120),
  size: z.number().int().min(0),
});

/** Attachments hang off several kinds of row, each of which must be this trip's. */
async function assertAttachmentTarget(
  tripId: string,
  entityType: "trip" | "lodging" | "reservation" | "expense" | "journal",
  entityId: string,
) {
  if (entityType === "trip") {
    if (entityId !== tripId) throw new Error("That file does not belong to this trip");
    return;
  }
  const kind = {
    lodging: "lodging",
    reservation: "reservation",
    expense: "expense",
    journal: "journalEntry",
  } as const;
  await assertInTrip(tripId, { [kind[entityType]]: entityId });
}

/** Records a finished browser upload after re-checking that it belongs to this trip. */
export const registerAttachment = action(registerSchema, async (input, userId) => {
  await requireTripAccess(input.tripId, userId, "edit");
  await assertAttachmentTarget(input.tripId, input.entityType, input.entityId);
  if (tripIdFromPath(input.pathname) !== input.tripId)
    throw new Error("That file does not belong to this trip");
  const limits = UPLOAD_LIMITS[input.kind];
  if (input.size > limits.maxBytes) throw new Error("That file is too large");
  const [created] = await db
    .insert(attachments)
    .values({
      tripId: input.tripId,
      entityType: input.entityType,
      entityId: input.entityId,
      storageKey: input.pathname,
      url: input.url,
      filename: input.filename,
      mime: input.mime,
      size: input.size,
      isPrivate: limits.access === "private" ? 1 : 0,
      uploadedBy: userId,
    })
    .returning();
  await touch(input.tripId);
  return { id: created!.id, url: `/api/attachments/${created!.id}` };
});

export const removeAttachment = action(
  z.object({ tripId: z.string(), id: z.string() }),
  async ({ tripId, id }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    const [row] = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.tripId, tripId)))
      .limit(1);
    if (!row) throw new Error("Attachment not found");
    await db.delete(attachments).where(eq(attachments.id, id));
    await deleteStored(row.url);
    await touch(tripId);
    return null;
  },
);
