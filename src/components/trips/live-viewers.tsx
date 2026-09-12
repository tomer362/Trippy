"use client";
import { useEffect } from "react";
import { Avatar, Tooltip } from "@/components/ui/misc";
import { useTripSync } from "@/lib/use-trip-sync";
import { heartbeat } from "@/server/actions/comments";

/**
 * Keeps this trip page in step with other people editing it, and shows who is looking
 * at it right now. Falls back to polling when realtime isn't configured.
 */
export function LiveViewers({
  tripId,
  currentUserId,
}: {
  tripId: string;
  currentUserId: string | null;
}) {
  const { viewers, live } = useTripSync(tripId, currentUserId);

  useEffect(() => {
    if (!currentUserId) return;
    void heartbeat({ tripId });
  }, [tripId, currentUserId]);

  if (viewers.length === 0) return null;
  return (
    <span className="flex items-center gap-1">
      {viewers.slice(0, 3).map((v) => (
        <Tooltip key={v.id} content={`${v.name} is viewing`}>
          <span className="relative">
            <Avatar src={v.image} name={v.name} size={24} className="ring-2 ring-white" />
            {live && (
              <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-white" />
            )}
          </span>
        </Tooltip>
      ))}
      {viewers.length > 3 && (
        <span className="text-xs font-semibold text-white">+{viewers.length - 3}</span>
      )}
    </span>
  );
}
