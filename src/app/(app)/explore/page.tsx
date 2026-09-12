import { Compass } from "lucide-react";
import Link from "next/link";
import { GuideCard } from "@/components/guides/guide-card";
import { EmptyState } from "@/components/ui/misc";
import { getSession } from "@/lib/auth";
import { getPopularDestinationsWithGuides, getPublicGuides } from "@/server/queries/discovery";

export const metadata = { title: "Explore" };

export default async function ExploreIndexPage() {
  const session = await getSession();
  const [guides, destinations] = await Promise.all([
    getPublicGuides(session?.user.id ?? null),
    getPopularDestinationsWithGuides(),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-4 py-6">
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Explore</h1>
      <p className="mb-6 text-muted-foreground">
        Guides and itineraries other travellers have shared.
      </p>

      <section className="mb-8">
        <h2 className="mb-3 font-bold">Popular destinations</h2>
        <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
          {destinations.map((d) => (
            <Link
              key={d.id}
              href={`/d/${d.slug}`}
              className="relative h-28 w-44 shrink-0 overflow-hidden rounded-3xl border border-border"
            >
              {d.heroUrl ? (
                // biome-ignore lint/performance/noImgElement: remote CDN image
                <img
                  src={d.heroUrl}
                  alt=""
                  className="absolute inset-0 size-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="sunset-bg absolute inset-0" />
              )}
              <span className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-2 text-white">
                <span className="block truncate text-sm font-bold">{d.name}</span>
                <span className="block truncate text-[11px] text-white/80">
                  {Number(d.guides) > 0
                    ? `${d.guides} guide${Number(d.guides) === 1 ? "" : "s"}`
                    : d.ancestorNames.join(", ")}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-bold">Recently shared</h2>
        {guides.length === 0 ? (
          <EmptyState
            icon={<Compass />}
            title="No public guides yet"
            description="Publish one of your trips and it will show up here."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((g) => (
              <GuideCard key={g.tripId} guide={g} canInteract={Boolean(session)} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
