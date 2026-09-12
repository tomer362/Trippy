"use client";
import { CalendarDays } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { colorHex } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { moveTripPlaces } from "@/server/actions/places";
import type { TripListDTO } from "@/server/queries/places";
import { ListIcon } from "./list-icon";

export type DayOption = { id: string; label: string };

/** Shared "Move to / Copy to" picker used by the row menu and the bulk selection bar. */
export function MoveToSheet({
  open,
  onOpenChange,
  tripId,
  ids,
  lists,
  days,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  ids: string[];
  lists: TripListDTO[];
  days: DayOption[];
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"move" | "copy">("move");
  const [pending, start] = useTransition();

  function apply(target: { targetListId?: string | null; targetDayId?: string }) {
    start(async () => {
      const res = await moveTripPlaces({ tripId, ids, mode, ...target });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(mode === "move" ? "Moved" : "Copied");
        onOpenChange(false);
        onDone();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="sm:max-w-md">
        <DialogTitle className="mb-1 text-lg font-bold">
          {ids.length} place{ids.length === 1 ? "" : "s"}
        </DialogTitle>
        <div className="mb-4 inline-flex rounded-full bg-muted p-1">
          {(["move", "copy"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-semibold capitalize",
                mode === m && "bg-background shadow",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Lists</p>
        <ul className="mb-4 space-y-1">
          {lists.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => apply({ targetListId: l.id })}
                className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left hover:bg-muted disabled:opacity-50"
              >
                <span
                  className="flex size-6 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: colorHex(l.color) }}
                >
                  <ListIcon name={l.icon} className="size-3.5" />
                </span>
                <span className="flex-1 truncate font-medium">{l.name}</span>
                <span className="text-xs text-muted-foreground">{l.places.length}</span>
              </button>
            </li>
          ))}
        </ul>
        {days.length > 0 && (
          <>
            <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Itinerary days</p>
            <ul className="space-y-1">
              {days.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => apply({ targetDayId: d.id })}
                    className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left hover:bg-muted disabled:opacity-50"
                  >
                    <CalendarDays className="size-4 text-muted-foreground" />
                    <span className="flex-1 truncate font-medium">{d.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </SheetContent>
    </Dialog>
  );
}
