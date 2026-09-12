"use client";
import { Bed, Bus, Car, FerrisWheel, Plane, Ship, Ticket, Train, Utensils } from "lucide-react";
import Link from "next/link";
import type { LodgingDTO, ReservationDTO } from "@/server/queries/bookings";

const KIND_ICON = {
  flight: Plane,
  train: Train,
  bus: Bus,
  ferry: Ship,
  car: Car,
  restaurant: Utensils,
  activity: FerrisWheel,
  other: Ticket,
} as const;

function timeOf(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * The pinned rows at the top of a day: where you are sleeping (shown on every night the
 * stay covers, and again on the morning you check out) and any bookings timed for that day.
 */
export function DayExtras({
  tripId,
  date,
  lodgings,
  reservations,
}: {
  tripId: string;
  date: string | null;
  lodgings: LodgingDTO[];
  reservations: ReservationDTO[];
}) {
  if (lodgings.length === 0 && reservations.length === 0) return null;
  return (
    <div className="mb-1 space-y-1 px-1">
      {lodgings.map((l) => {
        const checkingIn = date === l.checkIn;
        const checkingOut = date === l.checkOut;
        return (
          <Link
            key={l.id}
            href={`/t/${tripId}/lodging`}
            className="flex items-center gap-2 rounded-2xl bg-indigo-50 px-3 py-2 text-sm hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/60"
          >
            <Bed className="size-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold">
                {checkingOut ? "Check out of" : checkingIn ? "Check in to" : "Staying at"} {l.name}
              </span>
              {checkingIn && l.checkInTime && (
                <span className="text-muted-foreground"> from {l.checkInTime.slice(0, 5)}</span>
              )}
              {checkingOut && l.checkOutTime && (
                <span className="text-muted-foreground"> by {l.checkOutTime.slice(0, 5)}</span>
              )}
            </span>
          </Link>
        );
      })}
      {reservations.map((r) => {
        const Icon = KIND_ICON[r.kind];
        const time = timeOf(r.startAt);
        return (
          <Link
            key={r.id}
            href={`/t/${tripId}/reservations`}
            className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm hover:bg-muted/70"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
            {time && (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{time}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
