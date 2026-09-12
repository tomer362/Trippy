"use client";
import { History, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { undoActivity } from "@/server/actions/comments";
import type { ActivityDTO } from "@/server/queries/activity";

function relative(iso: string) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString();
}

/** Who changed what, with an undo for the changes we can reverse. */
export function ActivityFeed({
  tripId,
  activity,
  canEdit,
}: {
  tripId: string;
  activity: ActivityDTO[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (activity.length === 0) {
    return (
      <EmptyState
        icon={<History />}
        title="No activity yet"
        description="Changes you and your trip mates make show up here."
      />
    );
  }

  return (
    <ul className="divide-y divide-border rounded-3xl border border-border">
      {activity.map((a) => (
        <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
          <Avatar src={a.actorImage} name={a.actorName} size={26} />
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{a.actorName}</span> {a.summary}
            <span className="block text-xs text-muted-foreground">{relative(a.createdAt)}</span>
          </span>
          {canEdit && a.undoable && (
            <button
              type="button"
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-50"
              onClick={() =>
                start(async () => {
                  const res = await undoActivity({ tripId, id: a.id });
                  if (!res.ok) toast.error(res.error);
                  else {
                    toast.success("Undone");
                    router.refresh();
                  }
                })
              }
            >
              <Undo2 className="size-3" /> Undo
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
