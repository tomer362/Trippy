import { notFound, redirect } from "next/navigation";
import { BudgetPanel } from "@/components/budget/budget-panel";
import { requireUser } from "@/lib/auth";
import { getTripAccess } from "@/server/authz";
import { getBudget } from "@/server/queries/budget";
import { getTripDays, getTripMembers } from "@/server/queries/trips";

export const metadata = { title: "Budget" };

export default async function BudgetPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const user = await requireUser();
  const access = await getTripAccess(tripId, user.id);
  if (!access) notFound();
  if (!access.isMember) redirect(`/t/${tripId}`);

  const [data, members, days] = await Promise.all([
    getBudget(tripId, user.id, access.trip.currency),
    getTripMembers(tripId),
    getTripDays(tripId),
  ]);
  return (
    <BudgetPanel
      tripId={tripId}
      canEdit={access.canEdit}
      currentUserId={user.id}
      members={members}
      days={days.map((d) => ({ dayIndex: d.dayIndex, date: d.date }))}
      data={data}
    />
  );
}
