import { getSession } from "@/lib/auth";
import { buildIcs, type IcsEvent, nextIsoDate } from "@/lib/ics";
import { getTripAccess } from "@/server/authz";
import { getLodgings, getReservations } from "@/server/queries/bookings";
import { getItinerary } from "@/server/queries/itinerary";

export const dynamic = "force-dynamic";

/**
 * The trip as a calendar: one all-day event per planned day, timed events for stops that
 * carry a start time, plus bookings and hotel check-in and check-out.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await ctx.params;
  const session = await getSession();
  const access = await getTripAccess(tripId, session?.user.id ?? null);
  if (!access?.canView) return new Response("Forbidden", { status: 403 });

  const [days, reservations, lodgings] = await Promise.all([
    getItinerary(tripId, access.trip.defaultTravelMode),
    getReservations(tripId),
    getLodgings(tripId),
  ]);

  const events: IcsEvent[] = [];

  for (const day of days) {
    const stops = day.items.filter((i) => i.place);
    if (stops.length === 0 || !day.date) continue;
    events.push({
      uid: `day-${day.id}@trippy`,
      summary: day.title
        ? `${access.trip.name}: ${day.title}`
        : `${access.trip.name}: day ${day.dayIndex + 1}`,
      description: stops.map((s, i) => `${i + 1}. ${s.place!.name}`).join("\n"),
      start: { date: day.date },
      end: { date: nextIsoDate(day.date) },
    });
    for (const stop of stops) {
      if (!stop.startTime) continue;
      const start = `${day.date}T${stop.startTime.slice(0, 8).padEnd(8, ":00")}`;
      const end = stop.endTime ? `${day.date}T${stop.endTime.slice(0, 8).padEnd(8, ":00")}` : null;
      events.push({
        uid: `stop-${stop.id}@trippy`,
        summary: stop.place!.name,
        location: stop.place!.address,
        description: stop.place!.notes,
        url: stop.place!.googleMapsUri,
        start: { dateTime: new Date(start).toISOString() },
        end: end ? { dateTime: new Date(end).toISOString() } : undefined,
      });
    }
  }

  for (const r of reservations) {
    if (!r.startAt) continue;
    events.push({
      uid: `reservation-${r.id}@trippy`,
      summary: r.title,
      description:
        [r.confirmationNo && `Confirmation ${r.confirmationNo}`, r.notes]
          .filter(Boolean)
          .join("\n") || null,
      start: { dateTime: r.startAt },
      end: r.endAt ? { dateTime: r.endAt } : undefined,
    });
  }

  for (const l of lodgings) {
    events.push({
      uid: `lodging-${l.id}@trippy`,
      summary: `Staying at ${l.name}`,
      location: l.address,
      description: l.confirmationNo ? `Confirmation ${l.confirmationNo}` : null,
      start: { date: l.checkIn },
      end: { date: l.checkOut },
    });
  }

  const ics = buildIcs(access.trip.name, events);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${access.trip.slug}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
