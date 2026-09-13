import { BookOpen, CalendarDays, ExternalLink, MapPin, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicTripMap } from "@/components/trips/public-trip-map";
import { env } from "@/env";
import { getSession } from "@/lib/auth";
import { colorHex, dayColor } from "@/lib/colors";
import { APP_NAME } from "@/lib/constants";
import { formatDateRange, formatDayLabel } from "@/lib/days";
import { formatDistance, formatDuration } from "@/lib/geo";
import { richTextToParagraphs } from "@/lib/rich-text";
import { getTripAccess } from "@/server/authz";
import { getJournal } from "@/server/queries/content";
import { getItinerary } from "@/server/queries/itinerary";
import { getTripPlaces } from "@/server/queries/places";
import { findTripBySlug, getTripDestinations } from "@/server/queries/trips";
import { unionBBox } from "@/server/services/destinations";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const trip = await findTripBySlug(slug).catch(() => null);
  if (!trip || (trip.visibility !== "public" && trip.visibility !== "link")) {
    return { title: "Trip", robots: { index: false } };
  }
  const destinations = await getTripDestinations(trip.id);
  const where = destinations.map((d) => d.name).join(", ");
  const description =
    trip.description ??
    `A ${trip.dayCount}-day itinerary${where ? ` for ${where}` : ""}, with places, travel times and where to stay.`;
  return {
    title: trip.name,
    description,
    openGraph: {
      title: trip.name,
      description,
      images: trip.coverUrl ? [trip.coverUrl] : [],
      type: "article",
    },
    robots: trip.visibility === "public" ? undefined : { index: false },
  };
}

export default async function PublicTripPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const trip = await findTripBySlug(slug);
  if (!trip) notFound();
  const session = await getSession();
  const access = await getTripAccess(trip.id, session?.user.id ?? null);
  if (!access?.canView) notFound();

  const [destinations, { lists }, days, journal] = await Promise.all([
    getTripDestinations(trip.id),
    getTripPlaces(trip.id),
    getItinerary(trip.id, trip.defaultTravelMode),
    // A journal trip whose public page showed no journal was the whole point of publishing it.
    trip.kind === "journal" ? getJournal(trip.id) : Promise.resolve([]),
  ]);
  const view = unionBBox(
    destinations.map((d) => ({ lat: d.lat, lng: d.lng, bbox: d.bbox, zoom: d.zoom })),
  );
  const markers = days.flatMap((day) =>
    day.items
      .filter((i) => i.place)
      .map((i, n) => ({
        id: i.id,
        lat: i.place!.lat,
        lng: i.place!.lng,
        title: i.place!.name,
        label: n + 1,
        colorHex: colorHex(day.color ?? dayColor(day.dayIndex)),
      })),
  );

  return (
    <main className="min-h-dvh bg-background">
      <div className="relative h-56 sm:h-72">
        {trip.coverUrl ? (
          // biome-ignore lint/performance/noImgElement: remote CDN image
          <img
            src={trip.coverUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="sunset-bg absolute inset-0" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl p-5 text-white">
          <p className="text-sm font-semibold uppercase tracking-wide text-white/80">
            {trip.kind === "guide"
              ? "Travel guide"
              : trip.kind === "journal"
                ? "Trip journal"
                : "Trip plan"}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{trip.name}</h1>
          <p className="mt-1 text-white/90">
            {destinations.map((d) => d.name).join(" · ")}
            {destinations.length > 0 && " · "}
            {formatDateRange(trip.startDate, trip.endDate, trip.dayCount)}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        {trip.description && <p className="text-lg text-muted-foreground">{trip.description}</p>}

        {markers.length > 0 && (
          <PublicTripMap
            apiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? null}
            mapId={env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? null}
            markers={markers}
            bbox={view && "bbox" in view ? view.bbox : null}
          />
        )}

        {days.some((d) => d.items.length > 0) && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-xl font-bold">
              <CalendarDays className="size-5" /> Day by day
            </h2>
            <div className="space-y-5">
              {days
                .filter((d) => d.items.length > 0)
                .map((day) => {
                  let n = 0;
                  const totalTime = day.legs.reduce((sum, l) => sum + (l.leg?.durationS ?? 0), 0);
                  const totalDistance = day.legs.reduce(
                    (sum, l) => sum + (l.leg?.distanceM ?? 0),
                    0,
                  );
                  return (
                    <div key={day.id} className="rounded-3xl border border-border p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Day {day.dayIndex + 1}
                        {day.date && ` · ${formatDayLabel(day, { long: true })}`}
                      </p>
                      {day.title && <p className="text-lg font-bold">{day.title}</p>}
                      {totalTime > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {formatDuration(totalTime)} travel · {formatDistance(totalDistance)}
                        </p>
                      )}
                      <ol className="mt-2 space-y-1">
                        {day.items.map((item) => {
                          if (!item.place) {
                            return item.text ? (
                              <li key={item.id} className="pl-8 text-sm text-muted-foreground">
                                {item.text}
                              </li>
                            ) : null;
                          }
                          n += 1;
                          return (
                            <li key={item.id} className="flex items-start gap-2">
                              <span
                                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
                                style={{
                                  backgroundColor: colorHex(day.color ?? dayColor(day.dayIndex)),
                                }}
                              >
                                {n}
                              </span>
                              <span className="min-w-0">
                                <span className="block font-semibold">
                                  {item.place.name}
                                  {item.startTime && (
                                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                                      {item.startTime.slice(0, 5)}
                                    </span>
                                  )}
                                </span>
                                {item.place.notes && (
                                  <span className="block text-sm text-muted-foreground">
                                    {item.place.notes}
                                  </span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  );
                })}
            </div>
          </section>
        )}

        {lists.some((l) => l.places.length > 0) && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-xl font-bold">
              <MapPin className="size-5" /> Places
            </h2>
            <div className="space-y-4">
              {lists
                .filter((l) => l.places.length > 0)
                .map((list) => (
                  <div key={list.id}>
                    <p className="mb-1 flex items-center gap-2 font-bold">
                      <span
                        className="size-3 rounded-full"
                        style={{ backgroundColor: colorHex(list.color) }}
                      />
                      {list.name}
                    </p>
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {list.places.map((p) => (
                        <li key={p.id} className="rounded-2xl border border-border px-3 py-2">
                          <p className="truncate font-medium">{p.name}</p>
                          {p.primaryType && (
                            <p className="truncate text-xs capitalize text-muted-foreground">
                              {p.primaryType.replace(/_/g, " ")}
                            </p>
                          )}
                          {p.notes && (
                            <p className="mt-1 text-sm text-muted-foreground">{p.notes}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </section>
        )}

        {journal.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-3 flex items-center gap-2 text-xl font-bold">
              <BookOpen className="size-5" /> Journal
            </h2>
            <div className="space-y-6">
              {journal.map((entry) => {
                const paragraphs = richTextToParagraphs(entry.body);
                return (
                  <article key={entry.id}>
                    <h3 className="font-bold">
                      {entry.title ??
                        (entry.date
                          ? formatDayLabel(
                              { date: entry.date, dayIndex: entry.dayIndex ?? 0 },
                              { long: true },
                            )
                          : "Entry")}
                    </h3>
                    {entry.mood && <p className="text-sm text-muted-foreground">{entry.mood}</p>}
                    {paragraphs.map((text) => (
                      <p key={text} className="mt-2 text-sm">
                        {text}
                      </p>
                    ))}
                    {entry.photos.length > 0 && (
                      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {entry.photos.map((photo) => (
                          <li key={photo.id}>
                            {/* biome-ignore lint/performance/noImgElement: served straight from the blob CDN, so it spends none of Hobby's image transformations */}
                            <img
                              src={photo.url}
                              alt={photo.caption ?? ""}
                              width={photo.width ?? undefined}
                              height={photo.height ?? undefined}
                              loading="lazy"
                              className="aspect-square w-full rounded-2xl object-cover"
                            />
                            {photo.caption && (
                              <p className="mt-1 text-xs text-muted-foreground">{photo.caption}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <footer className="border-t border-border pt-6 text-sm text-muted-foreground">
          <p className="flex flex-wrap items-center gap-2">
            <Star className="size-4" />
            Planned with {APP_NAME}.
            <Link
              href="/"
              className="inline-flex items-center gap-1 font-semibold text-foreground hover:underline"
            >
              Plan your own trip <ExternalLink className="size-3.5" />
            </Link>
          </p>
          <p className="mt-2 text-xs">
            Map data © Google. Place information shown live from Google Maps.
          </p>
        </footer>
      </div>
    </main>
  );
}
