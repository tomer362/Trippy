import { Globe, Lock, Users } from "lucide-react";
import Link from "next/link";
import { formatDateRange } from "@/lib/days";
import type { TripCard as TripCardData } from "@/server/queries/trips";

const KIND_EMOJI = { plan: "🧳", guide: "🧭", journal: "📔" } as const;

export function TripCard({ trip }: { trip: TripCardData }) {
  return (
    <Link
      href={`/t/${trip.id}`}
      className="group flex overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition hover:shadow-md"
    >
      <div className="relative w-32 shrink-0 bg-muted sm:w-44">
        {trip.coverUrl ? (
          // biome-ignore lint/performance/noImgElement: remote CDN image
          <img
            src={trip.coverUrl}
            alt=""
            className="absolute inset-0 size-full object-cover transition group-hover:scale-105"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="sunset-bg absolute inset-0 flex items-center justify-center text-4xl">
            {KIND_EMOJI[trip.kind]}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 p-4">
        <p className="truncate text-lg font-bold">{trip.name}</p>
        <p className="truncate text-sm text-muted-foreground">
          {trip.destinations.join(" · ") || "No destination"}
        </p>
        <p className="mt-1 text-sm">
          {formatDateRange(trip.startDate, trip.endDate, trip.dayCount)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{trip.placeCount} places</span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" /> {trip.memberCount}
          </span>
          <span className="inline-flex items-center gap-1">
            {trip.visibility === "private" ? (
              <Lock className="size-3.5" />
            ) : (
              <Globe className="size-3.5" />
            )}{" "}
            {trip.visibility}
          </span>
          {trip.role !== "owner" && (
            <span className="rounded-full bg-muted px-2 py-0.5">shared · {trip.role}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
