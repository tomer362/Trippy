"use client";
import { Clock, Sparkles } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import type { DaySuggestion, SuggestedStop } from "@/lib/ai-suggest";
import { addSuggestedStops, suggestDay } from "@/server/actions/ai";
import type { ItineraryDayDTO } from "@/server/queries/itinerary";

function durationLabel(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${h} hr` : `${h} hr ${rest} min`;
}

/**
 * Drafts a day, then lets the traveller keep the parts they like. Suggestions are only
 * text until they are added: each accepted stop is looked up on the map first.
 */
export function SuggestDayDialog({
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
  const [request, setRequest] = useState("");
  const [suggestion, setSuggestion] = useState<DaySuggestion | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  useEffect(() => {
    if (open) {
      setSuggestion(null);
      setChosen(new Set());
      setRequest("");
    }
  }, [open]);

  if (!day) return null;
  const activeDay = day;

  function ask() {
    start(async () => {
      const res = await suggestDay({
        tripId,
        dayId: activeDay.id,
        request: request.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.data.stops.length === 0) {
        toast.info("Nothing new to suggest for this day");
        return;
      }
      setSuggestion(res.data);
      setChosen(new Set(res.data.stops.map((s) => s.name)));
    });
  }

  function toggle(stop: SuggestedStop) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(stop.name)) next.delete(stop.name);
      else next.add(stop.name);
      return next;
    });
  }

  function add() {
    const stops = (suggestion?.stops ?? []).filter((s) => chosen.has(s.name));
    if (stops.length === 0) return;
    start(async () => {
      const res = await addSuggestedStops({
        tripId,
        dayId: activeDay.id,
        stops: stops.map((s) => ({
          name: s.name,
          searchQuery: s.searchQuery,
          startTime: s.startTime,
          durationMin: s.durationMin,
        })),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { added, unmatched } = res.data;
      if (added.length > 0) toast.success(`Added ${added.length} to day ${activeDay.dayIndex + 1}`);
      if (unmatched.length > 0) toast.warning(`Could not find ${unmatched.join(", ")} on the map`);
      if (added.length === 0) return;
      onOpenChange(false);
      onApplied();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="sm:max-w-lg">
        <DialogTitle className="mb-1 text-lg font-bold">
          Suggest stops for day {activeDay.dayIndex + 1}
        </DialogTitle>
        <p className="mb-4 text-sm text-muted-foreground">
          Builds a draft around what is already on this day. Nothing is added until you pick it.
        </p>

        <div className="space-y-1">
          <Label htmlFor="suggest-request">Anything in mind? (optional)</Label>
          <Input
            id="suggest-request"
            value={request}
            maxLength={300}
            placeholder="Rainy day, mostly indoors, no long walks"
            onChange={(e) => setRequest(e.target.value)}
          />
        </div>

        {suggestion && (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-muted-foreground">{suggestion.summary}</p>
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {suggestion.stops.map((stop) => {
                const picked = chosen.has(stop.name);
                return (
                  <li key={stop.name}>
                    <label className="flex cursor-pointer gap-3 rounded-2xl border border-border p-3 text-left has-checked:border-primary has-checked:bg-primary/5">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 accent-primary"
                        checked={picked}
                        onChange={() => toggle(stop)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{stop.name}</span>
                          <Badge>{stop.category}</Badge>
                        </span>
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          {stop.startTime ? `${stop.startTime} · ` : ""}
                          {durationLabel(stop.durationMin)}
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">{stop.why}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={ask} disabled={pending}>
            {pending && !suggestion ? <Spinner /> : <Sparkles />}
            {suggestion ? "Try again" : "Suggest"}
          </Button>
          <Button className="flex-1" onClick={add} disabled={pending || chosen.size === 0}>
            {chosen.size > 0 ? `Add ${chosen.size}` : "Add stops"}
          </Button>
        </div>
      </SheetContent>
    </Dialog>
  );
}
