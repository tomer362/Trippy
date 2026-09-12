import { notFound, redirect } from "next/navigation";
import { TripHeader } from "@/components/trips/trip-header";
import { getSession } from "@/lib/auth";
import { getTripAccess } from "@/server/authz";
import { getTripDestinations, getTripMembers } from "@/server/queries/trips";

export const dynamic = "force-dynamic";

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const session = await getSession();
  const access = await getTripAccess(tripId, session?.user.id ?? null);
  if (!access) notFound();
  if (!access.canView) redirect(session ? "/trips" : `/?next=/t/${tripId}`);
  const [destinations, members] = await Promise.all([
    getTripDestinations(tripId),
    getTripMembers(tripId),
  ]);
  return (
    <div className="app-shell flex h-dvh flex-col overflow-hidden">
      <TripHeader
        trip={{
          id: access.trip.id,
          name: access.trip.name,
          kind: access.trip.kind,
          coverUrl: access.trip.coverUrl,
          startDate: access.trip.startDate,
          endDate: access.trip.endDate,
          dayCount: access.trip.dayCount,
          visibility: access.trip.visibility,
        }}
        destinations={destinations}
        members={members}
        role={access.role}
        canEdit={access.canEdit}
        canManage={access.canManage}
      />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
