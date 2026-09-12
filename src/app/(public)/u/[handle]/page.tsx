import { Globe2, Lock } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideCard } from "@/components/guides/guide-card";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { getSession } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { getPublicProfile } from "@/server/queries/discovery";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfile(handle, null).catch(() => null);
  if (!profile?.isPublic) return { title: "Traveller", robots: { index: false } };
  return {
    title: `${profile.name} (@${profile.handle})`,
    description: profile.bio ?? `Travel guides and trips shared by ${profile.name} on ${APP_NAME}.`,
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const session = await getSession();
  const profile = await getPublicProfile(handle, session?.user.id ?? null);
  if (!profile) notFound();
  const isSelf = session?.user.id === profile.userId;
  if (!profile.isPublic && !isSelf) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <EmptyState
          icon={<Lock />}
          title="This profile is private"
          description="Only this traveller can see it."
        />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-4xl px-4 py-10">
      <header className="mb-8 flex items-center gap-4">
        <Avatar src={profile.image} name={profile.name} size={72} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{profile.name}</h1>
          <p className="text-muted-foreground">@{profile.handle}</p>
          {profile.bio && <p className="mt-1 text-sm">{profile.bio}</p>}
        </div>
      </header>

      {profile.countries.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 flex items-center gap-2 font-bold">
            <Globe2 className="size-4" /> {profile.countries.length} countries
          </h2>
          <p className="flex flex-wrap gap-1.5">
            {profile.visited.map((v) => (
              <span key={v.name} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                {v.name}
              </span>
            ))}
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-bold">Published guides</h2>
        {profile.guides.length === 0 ? (
          <EmptyState
            title="Nothing published yet"
            description={
              isSelf
                ? "Publish a trip to show it here."
                : "This traveller hasn't shared a guide yet."
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {profile.guides.map((g) => (
              <GuideCard key={g.tripId} guide={g} canInteract={Boolean(session)} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
