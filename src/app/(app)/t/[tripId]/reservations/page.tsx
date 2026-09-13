import { notFound, redirect } from "next/navigation";
import { ReservationsPanel } from "@/components/reservations/reservations-panel";
import { features } from "@/env";
import { getSession } from "@/lib/auth";
import { getTripAccess } from "@/server/authz";
import { getAttachments, getReservations } from "@/server/queries/bookings";

export const metadata = { title: "Bookings" };

export default async function ReservationsPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const session = await getSession();
  const access = await getTripAccess(tripId, session?.user.id ?? null);
  if (!access) notFound();
  // Confirmation numbers and tickets are members-only, even on a public or link-shared trip.
  if (!access.isMember) redirect(`/t/${tripId}`);
  const [reservations, attachments] = await Promise.all([
    getReservations(tripId),
    getAttachments(tripId),
  ]);
  return (
    <ReservationsPanel
      tripId={tripId}
      currency={access.trip.currency}
      canEdit={access.canEdit}
      reservations={reservations}
      attachments={attachments}
      blobEnabled={features.blob}
    />
  );
}
