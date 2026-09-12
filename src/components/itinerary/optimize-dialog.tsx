"use client";
import { Sparkles } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { formatDuration } from "@/lib/geo";
import { placeSequence } from "@/lib/itinerary";
import { applyDayOrder, type OptimizePreview, optimizeDay } from "@/server/actions/itinerary";
import type { ItineraryDayDTO } from "@/server/queries/itinerary";

/**
 * Previews a faster order for one day before changing anything: pick where the day starts
 * and ends (the hotel is a good choice), see the time saved, then apply.
 */
export function OptimizeDialog({
  day,
  tripId,
  open,
  onOpenChange,
  onApplied,
}: {
  day: ItineraryDayDTO | null;
  tripId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}) {
  const stops = day ? placeSequence(day.items) : [];
  const [startItemId, setStartItemId] = useState<string>("auto");
  const [endItemId, setEndItemId] = useState<string>("auto");
  const [preview, setPreview] = useState<OptimizePreview | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (open) {
      setPreview(null);
      setStartItemId("auto");
      setEndItemId("auto");
    }
  }, [open]);

  if (!day) return null;
  const activeDay = day;

  function run() {
    start(async () => {
      const res = await optimizeDay({
        tripId,
        dayId: activeDay.id,
        startItemId: startItemId === "auto" ? null : startItemId,
        endItemId: endItemId === "auto" ? null : endItemId,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPreview(res.data);
    });
  }

  function apply() {
    if (!preview) return;
    start(async () => {
      const res = await applyDayOrder({
        tripId,
        dayId: activeDay.id,
        orderedItemIds: preview.orderedItemIds,
      });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Day reordered");
        onOpenChange(false);
        onApplied();
      }
    });
  }

  const saved = preview ? preview.currentDurationS - preview.optimizedDurationS : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="sm:max-w-md">
        <DialogTitle className="mb-1 text-lg font-bold">
          Optimise day {day.dayIndex + 1}
        </DialogTitle>
        <p className="mb-4 text-sm text-muted-foreground">
          Reorders the {stops.length} stops to cut travel time. Notes and breaks stay where they
          are.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="opt-start">Start at</Label>
            <select
              id="opt-start"
              value={startItemId}
              onChange={(e) => setStartItemId(e.target.value)}
              className="h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm"
            >
              <option value="auto">Auto-suggest</option>
              {stops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.place!.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="opt-end">End at</Label>
            <select
              id="opt-end"
              value={endItemId}
              onChange={(e) => setEndItemId(e.target.value)}
              className="h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm"
            >
              <option value="auto">Auto-suggest</option>
              {stops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.place!.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {preview && (
          <div className="mt-4 rounded-2xl bg-muted p-3 text-sm">
            <p className="font-semibold">
              {saved > 60
                ? `Saves about ${formatDuration(saved)} of travel`
                : "Your current order is already close to optimal"}
            </p>
            <p className="text-muted-foreground">
              {formatDuration(preview.currentDurationS)} →{" "}
              {formatDuration(preview.optimizedDurationS)}
              {preview.estimated && " · estimated from straight-line distance"}
            </p>
            <ol className="mt-2 list-decimal space-y-0.5 pl-5">
              {preview.orderedItemIds.map((id) => (
                <li key={id}>{stops.find((s) => s.id === id)?.place?.name}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={run} disabled={pending}>
            {pending && !preview ? <Spinner /> : <Sparkles />} {preview ? "Recalculate" : "Preview"}
          </Button>
          <Button className="flex-1" onClick={apply} disabled={pending || !preview}>
            Apply order
          </Button>
        </div>
      </SheetContent>
    </Dialog>
  );
}
