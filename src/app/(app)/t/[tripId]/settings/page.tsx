import { redirect } from "next/navigation";
import { TripSettingsForm } from "@/components/trips/trip-settings-form";
import { features } from "@/env";
import { requireUser } from "@/lib/auth";
import { getTripAccess } from "@/server/authz";
import { getTripInvites } from "@/server/queries/social";
import { getTripDestinations, getTripMembers } from "@/server/queries/trips";

export const metadata = { title: "Trip settings" };

export default async function TripSettingsPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const user = await requireUser();
  const access = await getTripAccess(tripId, user.id);
  if (!access?.canEdit) redirect(`/t/${tripId}`);
  const [destinations, members, invites] = await Promise.all([
    getTripDestinations(tripId),
    getTripMembers(tripId),
    getTripInvites(tripId),
  ]);
  const t = access.trip;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-6">
      <h2 className="mb-4 text-xl font-bold">Trip settings</h2>
      <TripSettingsForm
        trip={{
          id: t.id,
          name: t.name,
          description: t.description,
          kind: t.kind,
          visibility: t.visibility,
          currency: t.currency,
          defaultTravelMode: t.defaultTravelMode,
          startDate: t.startDate,
          endDate: t.endDate,
          dayCount: t.dayCount,
          archived: Boolean(t.archivedAt),
        }}
        destinations={destinations}
        members={members}
        invites={invites}
        canManage={access.canManage}
        currentUserId={user.id}
        emailEnabled={features.email}
      />
    </main>
  );
}
