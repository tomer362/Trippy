import { Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuideCard } from "@/components/guides/guide-card";
import { EmptyState } from "@/components/ui/misc";
import { getSession } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { KIND_LABEL } from "@/lib/types";
import { getGuidesForDestination } from "@/server/queries/discovery";
import { getDestinationBySlug, resolveHero } from "@/server/services/destinations";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const destination = await getDestinationBySlug(slug).catch(() => null);
  if (!destination) return { title: "Destination" };
  const where = [destination.name, destination.subtitle].filter(Boolean).join(", ");
  const description = `Trip ideas, itineraries and places to visit in ${where}, shared by travellers on ${APP_NAME}.`;
  return {
    title: `${destination.name} trip ideas`,
    description,
    openGraph: {
      title: `${destination.name} trip ideas`,
      description,
      images: destination.heroUrl ? [destination.heroUrl] : [],
    },
  };
}

export default async function DestinationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const destination = await getDestinationBySlug(slug);
  if (!destination) notFound();
  const session = await getSession();
  const [guides, hero] = await Promise.all([
    getGuidesForDestination(destination.id!, session?.user.id ?? null),
    destination.heroUrl
      ? Promise.resolve({ url: destination.heroUrl, credit: destination.heroCredit })
      : resolveHero(destination.id!),
  ]);

  return (
    <main className="min-h-dvh bg-background">
      <div className="relative h-52 sm:h-64">
        {hero.url ? (
          // biome-ignore lint/performance/noImgElement: remote CDN image
          <img
            src={hero.url}
            alt=""
            className="absolute inset-0 size-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="sunset-bg absolute inset-0" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-4xl p-5 text-white">
          <p className="text-sm font-semibold uppercase tracking-wide text-white/80">
            {KIND_LABEL[destination.kind]}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{destination.name}</h1>
          {destination.subtitle && <p className="text-white/90">{destination.subtitle}</p>}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link
            href={`/trips/new?destination=${destination.slug}`}
            className="rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground"
          >
            Plan a trip here
          </Link>
          <Link href="/explore" className="text-sm text-muted-foreground hover:underline">
            Browse all destinations
          </Link>
        </div>

        <h2 className="mb-3 text-xl font-bold">Guides and itineraries</h2>
        {guides.length === 0 ? (
          <EmptyState
            icon={<Compass />}
            title={`No public guides for ${destination.name} yet`}
            description="Be the first: plan a trip here, then publish it as a guide."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((g) => (
              <GuideCard key={g.tripId} guide={g} canInteract={Boolean(session)} />
            ))}
          </div>
        )}

        {hero.credit && <p className="mt-8 text-xs text-muted-foreground">Photo: {hero.credit}</p>}
      </div>
    </main>
  );
}
