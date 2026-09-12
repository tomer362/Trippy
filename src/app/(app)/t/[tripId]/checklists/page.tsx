import { notFound } from "next/navigation";
import { ChecklistsPanel } from "@/components/checklists/checklists-panel";
import { getSession } from "@/lib/auth";
import { getTripAccess } from "@/server/authz";
import { getChecklists, getSavedTemplates } from "@/server/queries/content";
import { getTripMembers } from "@/server/queries/trips";

export const metadata = { title: "Checklists" };

export default async function ChecklistsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const session = await getSession();
  const access = await getTripAccess(tripId, session?.user.id ?? null);
  if (!access?.canView) notFound();
  const [checklists, members, templates] = await Promise.all([
    getChecklists(tripId),
    getTripMembers(tripId),
    session ? getSavedTemplates(session.user.id) : Promise.resolve([]),
  ]);
  return (
    <ChecklistsPanel
      tripId={tripId}
      canEdit={access.canEdit}
      checklists={checklists}
      members={members}
      savedTemplates={templates.map((t) => ({ id: t.id, name: t.name, count: t.items.length }))}
    />
  );
}
