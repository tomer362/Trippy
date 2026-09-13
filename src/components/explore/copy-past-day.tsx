"use client";
import { CopyPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDayLabel } from "@/lib/days";
import { copyDayFromPastTrip } from "@/server/actions/itinerary";

type Day = { id: string; dayIndex: number; date: string | null; title: string | null };

/**
 * Brings a day you already enjoyed on an earlier trip into this one. Places the trip already
 * has are skipped, so pressing it twice does not duplicate the day.
 */
export function CopyPastDay({
  tripId,
  sourceDayId,
  days,
  onDone,
}: {
  tripId: string;
  sourceDayId: string;
  days: Day[];
  onDone: () => void;
}) {
  const [target, setTarget] = useState(days[0]?.id ?? "");
  const [pending, start] = useTransition();

  function copy() {
    if (!target) return;
    start(async () => {
      const res = await copyDayFromPastTrip({ tripId, dayId: target, sourceDayId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.data.added === 0
          ? "Those places are already in this trip"
          : `Copied ${res.data.added} ${res.data.added === 1 ? "stop" : "stops"}`,
      );
      onDone();
    });
  }

  return (
    <span className="flex items-center gap-1">
      <label className="sr-only" htmlFor={`copy-to-${sourceDayId}`}>
        Copy to which day
      </label>
      <select
        id={`copy-to-${sourceDayId}`}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="h-8 rounded-xl border border-border bg-background px-2 text-xs"
      >
        {days.map((d) => (
          <option key={d.id} value={d.id}>
            {d.title ?? formatDayLabel(d)}
          </option>
        ))}
      </select>
      <Button size="sm" variant="outline" onClick={copy} disabled={pending || !target}>
        <CopyPlus /> Copy
      </Button>
    </span>
  );
}
