"use client";
import { MapPin, Search } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { colorHex } from "@/lib/colors";
import { addPlacesToDay } from "@/server/actions/itinerary";
import type { ItineraryPlace } from "@/server/queries/itinerary";

/** Adds already-saved places to a day, or hands off to place search for something new. */
export function AddToDaySheet({
  open,
  onOpenChange,
  tripId,
  dayId,
  dayLabel,
  unscheduled,
  onSearchInstead,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  dayId: string | null;
  dayLabel: string;
  unscheduled: ItineraryPlace[];
  onSearchInstead: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  function add() {
    if (!dayId || selected.size === 0) return;
    start(async () => {
      const res = await addPlacesToDay({ tripId, dayId, tripPlaceIds: [...selected] });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(`Added ${res.data.added} to ${dayLabel}`);
        setSelected(new Set());
        onOpenChange(false);
        onDone();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="sm:max-w-md">
        <DialogTitle className="mb-3 text-lg font-bold">Add to {dayLabel}</DialogTitle>
        <Button
          variant="outline"
          className="mb-4 w-full"
          onClick={() => {
            onOpenChange(false);
            onSearchInstead();
          }}
        >
          <Search /> Search for a new place
        </Button>
        {unscheduled.length > 0 ? (
          <>
            <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">
              From your saved places
            </p>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {unscheduled.map((p) => (
                <li key={p.tripPlaceId}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={selected.has(p.tripPlaceId)}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(p.tripPlaceId);
                          else next.delete(p.tripPlaceId);
                          return next;
                        })
                      }
                      className="size-4"
                    />
                    <span
                      className="flex size-6 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: colorHex(p.colorHint ?? undefined) }}
                    >
                      <MapPin className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.primaryType?.replace(/_/g, " ") ?? p.address}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <Button className="mt-4 w-full" disabled={pending || selected.size === 0} onClick={add}>
              Add{" "}
              {selected.size > 0
                ? `${selected.size} place${selected.size === 1 ? "" : "s"}`
                : "places"}
            </Button>
          </>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Every saved place is already scheduled.
          </p>
        )}
      </SheetContent>
    </Dialog>
  );
}
