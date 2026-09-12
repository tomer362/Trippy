import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { attachments, lodgings, places, reservations } from "@/server/db/schema";
import type { ReservationDetails } from "@/server/db/schema/bookings";

export type LodgingDTO = {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  googlePlaceId: string | null;
  checkIn: string;
  checkOut: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  confirmationNo: string | null;
  price: string | null;
  currency: string | null;
  bookingUrl: string | null;
  notes: string | null;
  nights: number;
  version: number;
};

export type ReservationDTO = {
  id: string;
  kind: "flight" | "train" | "bus" | "ferry" | "car" | "restaurant" | "activity" | "other";
  title: string;
  startAt: string | null;
  endAt: string | null;
  timezone: string | null;
  details: ReservationDetails;
  confirmationNo: string | null;
  price: string | null;
  currency: string | null;
  notes: string | null;
  placeName: string | null;
  version: number;
};

export type AttachmentDTO = {
  id: string;
  entityType: string;
  entityId: string;
  filename: string;
  mime: string;
  size: number;
  isPrivate: boolean;
  url: string;
  createdAt: string;
};

function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

export async function getLodgings(tripId: string): Promise<LodgingDTO[]> {
  const rows = await db
    .select({ l: lodgings, p: places })
    .from(lodgings)
    .leftJoin(places, eq(places.id, lodgings.placeId))
    .where(eq(lodgings.tripId, tripId))
    .orderBy(asc(lodgings.checkIn));
  return rows.map(({ l, p }) => ({
    id: l.id,
    name: l.name,
    address: l.address ?? p?.formattedAddress ?? null,
    lat: l.lat ?? p?.lat ?? null,
    lng: l.lng ?? p?.lng ?? null,
    placeId: l.placeId,
    googlePlaceId: p?.googlePlaceId ?? null,
    checkIn: l.checkIn,
    checkOut: l.checkOut,
    checkInTime: l.checkInTime,
    checkOutTime: l.checkOutTime,
    confirmationNo: l.confirmationNo,
    price: l.price,
    currency: l.currency,
    bookingUrl: l.bookingUrl,
    notes: l.notes,
    nights: nightsBetween(l.checkIn, l.checkOut),
    version: l.version,
  }));
}

export async function getReservations(tripId: string): Promise<ReservationDTO[]> {
  const rows = await db
    .select({ r: reservations, p: places })
    .from(reservations)
    .leftJoin(places, eq(places.id, reservations.placeId))
    .where(eq(reservations.tripId, tripId))
    .orderBy(asc(reservations.startAt));
  return rows.map(({ r, p }) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    startAt: r.startAt?.toISOString() ?? null,
    endAt: r.endAt?.toISOString() ?? null,
    timezone: r.timezone,
    details: r.details,
    confirmationNo: r.confirmationNo,
    price: r.price,
    currency: r.currency,
    notes: r.notes,
    placeName: p?.name ?? null,
    version: r.version,
  }));
}

export async function getAttachments(tripId: string): Promise<AttachmentDTO[]> {
  const rows = await db
    .select()
    .from(attachments)
    .where(eq(attachments.tripId, tripId))
    .orderBy(asc(attachments.createdAt));
  return rows.map((a) => ({
    id: a.id,
    entityType: a.entityType,
    entityId: a.entityId,
    filename: a.filename,
    mime: a.mime,
    size: a.size,
    isPrivate: a.isPrivate === 1,
    url: `/api/attachments/${a.id}`,
    createdAt: a.createdAt.toISOString(),
  }));
}

export async function getAttachmentsFor(tripId: string, entityType: string, entityId: string) {
  return db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.tripId, tripId),
        eq(attachments.entityType, entityType),
        eq(attachments.entityId, entityId),
      ),
    );
}

/** Total bytes stored for a trip, shown against the storage allowance in settings. */
export async function getStorageUsed(tripId: string): Promise<number> {
  const rows = await db
    .select({ size: attachments.size })
    .from(attachments)
    .where(eq(attachments.tripId, tripId));
  return rows.reduce((sum, r) => sum + r.size, 0);
}

/** Lodging nights mapped to the itinerary days they cover, so each day can show its hotel. */
export function lodgingByDay(
  lodgingList: LodgingDTO[],
  days: Array<{ id: string; date: string | null }>,
) {
  const map = new Map<string, LodgingDTO[]>();
  for (const day of days) {
    if (!day.date) continue;
    const staying = lodgingList.filter((l) => day.date! >= l.checkIn && day.date! < l.checkOut);
    const checkingOut = lodgingList.filter((l) => day.date === l.checkOut);
    const combined = [
      ...staying,
      ...checkingOut.filter((c) => !staying.some((s) => s.id === c.id)),
    ];
    if (combined.length) map.set(day.id, combined);
  }
  return map;
}
