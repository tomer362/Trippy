import { CalendarDays, History, MapPin, MessageSquare, NotebookPen, Users } from "lucide-react";
import Link from "next/link";
import { CommentThread } from "@/components/comments/comment-thread";
import { DestinationHero } from "@/components/destinations/destination-card";
import { TripNotesCard } from "@/components/notes/trip-notes-card";
import { ActivityFeed } from "@/components/trips/activity-feed";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { formatDateRange, formatDayLabel } from "@/lib/days";
import { getTripAccess } from "@/server/authz";
import { getActivity } from "@/server/queries/activity";
import { getTripNotes } from "@/server/queries/content";
import { getTripDays, getTripDestinations, getTripMembers } from "@/server/queries/trips";

export default async function TripOverviewPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const session = await getSession();
  const access = (await getTripAccess(tripId, session?.user.id ?? null))!;
  const [destinations, members, days, activity] = await Promise.all([
    getTripDestinations(tripId),
    getTripMembers(tripId),
    getTripDays(tripId),
    getActivity(tripId, 25),
  ]);
  const notes = await getTripNotes(tripId);
  const trip = access.trip;
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 overflow-y-auto px-4 py-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<CalendarDays />}
          label="Dates"
          value={formatDateRange(trip.startDate, trip.endDate, trip.dayCount)}
          href={`/t/${tripId}/itinerary`}
        />
        <Stat
          icon={<MapPin />}
          label="Destinations"
          value={destinations.map((d) => d.name).join(", ")}
          href={`/t/${tripId}/settings`}
        />
        <Stat
          icon={<Users />}
          label="Trip mates"
          value={`${members.length} member${members.length === 1 ? "" : "s"}`}
          href={`/t/${tripId}/settings#members`}
        />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">Destinations</h2>
          {access.canEdit && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/t/${tripId}/settings`}>Edit</Link>
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((d) => (
            <div key={d.id} className="overflow-hidden rounded-3xl border border-border bg-card">
              <DestinationHero destination={d} className="aspect-[16/10]" />
              <div className="p-3">
                <p className="font-bold">{d.name}</p>
                <p className="text-xs text-muted-foreground">{d.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">Days</h2>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {days.map((d) => (
            <li key={d.id}>
              <Link
                href={`/t/${tripId}/itinerary#day-${d.dayIndex}`}
                className="block rounded-2xl border border-border bg-card px-4 py-3 hover:bg-muted"
              >
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Day {d.dayIndex + 1}
                </p>
                <p className="font-semibold">{d.title ?? formatDayLabel(d, { long: true })}</p>
              </Link>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-bold">
          <NotebookPen className="size-5" /> Notes
        </h2>
        <TripNotesCard
          tripId={tripId}
          initialContent={notes.body}
          initialVersion={notes.version}
          canEdit={access.canEdit}
        />
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-bold">
          <MessageSquare className="size-5" /> Discussion
        </h2>
        <div className="rounded-3xl border border-border p-4">
          <CommentThread tripId={tripId} entityType="trip" entityId={tripId} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-bold">
          <History className="size-5" /> Activity
        </h2>
        <ActivityFeed tripId={tripId} activity={activity} canEdit={access.canEdit} />
      </section>
    </main>
  );
}

function Stat({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4 hover:bg-muted"
    >
      <span className="rounded-2xl bg-primary/10 p-2.5 text-primary [&_svg]:size-5">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase text-muted-foreground">{label}</span>
        <span className="block truncate font-semibold">{value}</span>
      </span>
    </Link>
  );
}
