"use client";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  ChevronDown,
  Coffee,
  ListChecks,
  MapPin,
  MoreHorizontal,
  Navigation,
  Plus,
  Sparkles,
  StickyNote,
  Wand2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { colorHex, dayColor } from "@/lib/colors";
import { formatDayLabel } from "@/lib/days";
import { directionsUrl, formatDistance, formatDuration } from "@/lib/geo";
import { placeSequence } from "@/lib/itinerary";
import type { TravelMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { ItineraryDayDTO, ItineraryItemDTO } from "@/server/queries/itinerary";
import { ItineraryItemRow } from "./itinerary-item";
import { LegRow, MODE_LABEL } from "./leg-row";

export function DaySection({
  day,
  tripMode,
  canEdit,
  compact,
  legsLoading,
  lodgingHeader,
  onAdd,
  onAddQuick,
  onOptimize,
  onSuggest,
  onSetMode,
  onRenameDay,
  onToggleCollapsed,
  onOpenItem,
  onRemoveItem,
  onSetItemTime,
  onEditItemText,
  onToggleItemDone,
  onHoverItem,
}: {
  day: ItineraryDayDTO;
  tripMode: TravelMode;
  canEdit: boolean;
  compact: boolean;
  legsLoading: boolean;
  lodgingHeader?: React.ReactNode;
  onAdd: (day: ItineraryDayDTO) => void;
  onAddQuick: (day: ItineraryDayDTO, kind: "note" | "checklist" | "break") => void;
  onOptimize: (day: ItineraryDayDTO) => void;
  /** Absent when the planning assistant is not enabled on this deployment. */
  onSuggest?: (day: ItineraryDayDTO) => void;
  onSetMode: (day: ItineraryDayDTO, mode: TravelMode) => void;
  onRenameDay: (day: ItineraryDayDTO, title: string) => void;
  onToggleCollapsed: (day: ItineraryDayDTO, collapsed: boolean) => void;
  onOpenItem: (item: ItineraryItemDTO) => void;
  onRemoveItem: (item: ItineraryItemDTO) => void;
  onSetItemTime: (item: ItineraryItemDTO, time: string | null) => void;
  onEditItemText: (item: ItineraryItemDTO, text: string) => void;
  onToggleItemDone: (item: ItineraryItemDTO, done: boolean) => void;
  onHoverItem?: (id: string | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day.id}` });
  const mode = day.travelMode ?? tripMode;
  const hex = colorHex(day.color ?? dayColor(day.dayIndex));
  const stops = placeSequence(day.items);
  const legs = day.legs;
  const totalDistance = legs.reduce((sum, l) => sum + (l.leg?.distanceM ?? 0), 0);
  const totalDuration = legs.reduce((sum, l) => sum + (l.leg?.durationS ?? 0), 0);
  const dayDirections = directionsUrl(
    stops.map((s) => ({ lat: s.place!.lat, lng: s.place!.lng, placeId: s.place!.googlePlaceId })),
    mode,
  );
  let stopNumber = 0;

  return (
    <section
      id={`day-${day.dayIndex}`}
      className={cn(
        "scroll-mt-4 rounded-3xl border border-border bg-card/60 p-2",
        isOver && "ring-2 ring-primary",
      )}
    >
      <header className="flex items-start gap-2 px-1 py-1">
        <button
          type="button"
          onClick={() => onToggleCollapsed(day, !day.collapsed)}
          className="mt-0.5 rounded-lg p-1 hover:bg-muted"
          aria-label={
            day.collapsed ? `Expand day ${day.dayIndex + 1}` : `Collapse day ${day.dayIndex + 1}`
          }
          aria-expanded={!day.collapsed}
        >
          <ChevronDown
            className={cn("size-4 transition-transform", day.collapsed && "-rotate-90")}
          />
        </button>
        <span
          className="mt-1 size-3 shrink-0 rounded-full"
          style={{ backgroundColor: hex }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Day {day.dayIndex + 1}
            {day.date && ` · ${formatDayLabel(day)}`}
          </p>
          {canEdit ? (
            <input
              defaultValue={day.title ?? ""}
              onBlur={(e) =>
                e.target.value !== (day.title ?? "") && onRenameDay(day, e.target.value)
              }
              placeholder="Name this day"
              className="w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-lg font-bold hover:border-border focus:border-border focus:outline-none"
              aria-label={`Title for day ${day.dayIndex + 1}`}
            />
          ) : (
            day.title && <p className="px-1 text-lg font-bold">{day.title}</p>
          )}
          {stops.length > 0 && (
            <p className="px-1 text-xs text-muted-foreground">
              {stops.length} stop{stops.length === 1 ? "" : "s"}
              {totalDuration > 0 && ` · ${formatDuration(totalDuration)} travel`}
              {totalDistance > 0 && ` · ${formatDistance(totalDistance)}`}
            </p>
          )}
        </div>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => onAdd(day)}
              className="rounded-lg p-1.5 hover:bg-muted"
              aria-label={`Add to day ${day.dayIndex + 1}`}
            >
              <Plus className="size-4" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="rounded-lg p-1.5 hover:bg-muted"
                aria-label={`Options for day ${day.dayIndex + 1}`}
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onAdd(day)}>
                  <MapPin /> Add a place
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAddQuick(day, "note")}>
                  <StickyNote /> Add a note
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAddQuick(day, "checklist")}>
                  <ListChecks /> Add a to-do
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAddQuick(day, "break")}>
                  <Coffee /> Add a break
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {onSuggest && (
                  <DropdownMenuItem onSelect={() => onSuggest(day)}>
                    <Wand2 /> Suggest stops
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem disabled={stops.length < 3} onSelect={() => onOptimize(day)}>
                  <Sparkles /> Optimise this day
                </DropdownMenuItem>
                {dayDirections && (
                  <DropdownMenuItem asChild>
                    <a href={dayDirections} target="_blank" rel="noreferrer">
                      <Navigation /> Open day in Google Maps
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Travel mode</DropdownMenuLabel>
                {(["drive", "walk", "transit", "bicycle"] as const).map((m) => (
                  <DropdownMenuItem key={m} onSelect={() => onSetMode(day, m)}>
                    {mode === m ? "• " : ""}
                    {MODE_LABEL[m]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </header>

      {lodgingHeader}

      {!day.collapsed && (
        <div ref={setNodeRef} className="min-h-6">
          <SortableContext
            items={day.items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul>
              {day.items.map((item) => {
                if (item.place) stopNumber += 1;
                const leg = legs.find((l) => l.afterItemId === item.id);
                const next = leg ? day.items.find((i) => i.id === leg.beforeItemId) : undefined;
                return (
                  <li key={item.id} className="list-none">
                    <ul className="list-none">
                      <ItineraryItemRow
                        item={item}
                        stopNumber={item.place ? stopNumber : null}
                        dayColorHex={hex}
                        canEdit={canEdit}
                        compact={compact}
                        onOpen={onOpenItem}
                        onRemove={onRemoveItem}
                        onSetTime={onSetItemTime}
                        onEditText={onEditItemText}
                        onToggleDone={onToggleItemDone}
                        onHover={onHoverItem}
                      />
                    </ul>
                    {leg && next?.place && item.place && (
                      <LegRow
                        leg={leg.leg}
                        mode={mode}
                        from={{
                          lat: item.place.lat,
                          lng: item.place.lng,
                          googlePlaceId: item.place.googlePlaceId,
                        }}
                        to={{
                          lat: next.place.lat,
                          lng: next.place.lng,
                          googlePlaceId: next.place.googlePlaceId,
                        }}
                        loading={legsLoading && !leg.leg}
                        onChangeMode={canEdit ? () => onSetMode(day, nextMode(mode)) : undefined}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </SortableContext>
          {day.items.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              {canEdit ? "Nothing planned. Drop a place here or tap +" : "Nothing planned"}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function nextMode(mode: TravelMode): TravelMode {
  const order: TravelMode[] = ["drive", "walk", "transit", "bicycle"];
  return order[(order.indexOf(mode) + 1) % order.length]!;
}
