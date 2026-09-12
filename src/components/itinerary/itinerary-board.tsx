"use client";
import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Printer, Rows2, Rows3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { SplitView } from "@/components/layout/split-view";
import { MapOverlayControls, TripMap } from "@/components/map/trip-map";
import type { MapMarker, MapRoute } from "@/components/map/types";
import { PlaceSearchSheet } from "@/components/places/place-search-sheet";
import { Button } from "@/components/ui/button";
import { colorHex, dayColor } from "@/lib/colors";
import { formatDayLabel } from "@/lib/days";
import type { DestinationDTO, TravelMode } from "@/lib/types";
import {
  addItineraryItem,
  moveItemToDay,
  refreshDayLegs,
  removeItineraryItem,
  reorderDayItems,
  updateDay,
  updateItineraryItem,
} from "@/server/actions/itinerary";
import type { BBox } from "@/server/db/schema/geo";
import type { ItineraryDayDTO, ItineraryPlace } from "@/server/queries/itinerary";
import { AddToDaySheet } from "./add-to-day-sheet";
import { DaySection } from "./day-section";
import { OptimizeDialog } from "./optimize-dialog";

export function ItineraryBoard({
  tripId,
  tripMode,
  canEdit,
  days: initialDays,
  unscheduled,
  destinations,
  mapsApiKey,
  mapId,
  tripBBox,
}: {
  tripId: string;
  tripMode: TravelMode;
  canEdit: boolean;
  days: ItineraryDayDTO[];
  unscheduled: ItineraryPlace[];
  destinations: DestinationDTO[];
  mapsApiKey: string | null;
  mapId: string | null;
  tripBBox: BBox | null;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [days, setDays] = useState(initialDays);
  const [compact, setCompact] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [addForDay, setAddForDay] = useState<ItineraryDayDTO | null>(null);
  const [searchForDay, setSearchForDay] = useState<ItineraryDayDTO | null>(null);
  const [optimizeDay, setOptimizeDay] = useState<ItineraryDayDTO | null>(null);
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const [legsLoading, setLegsLoading] = useState<Set<string>>(new Set());
  const requestedLegs = useRef<Set<string>>(new Set());

  useEffect(() => setDays(initialDays), [initialDays]);

  const refresh = useCallback(() => start(() => router.refresh()), [router]);

  /** Fills in any missing travel times once per day signature, so the API is called sparingly. */
  useEffect(() => {
    for (const day of days) {
      const missing = day.legs.some((l) => !l.leg);
      if (!missing) continue;
      const signature = `${day.id}:${day.travelMode ?? tripMode}:${day.items.map((i) => i.id).join(",")}`;
      if (requestedLegs.current.has(signature)) continue;
      requestedLegs.current.add(signature);
      setLegsLoading((prev) => new Set(prev).add(day.id));
      void refreshDayLegs({ tripId, dayId: day.id }).then((res) => {
        setLegsLoading((prev) => {
          const next = new Set(prev);
          next.delete(day.id);
          return next;
        });
        if (res.ok && res.data.legs > 0) router.refresh();
      });
    }
  }, [days, tripId, tripMode, router]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visibleDays = focusDay ? days.filter((d) => d.id === focusDay) : days;

  const markers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [];
    for (const day of visibleDays) {
      let n = 0;
      for (const item of day.items) {
        if (!item.place) continue;
        n += 1;
        out.push({
          id: item.id,
          lat: item.place.lat,
          lng: item.place.lng,
          title: item.place.name,
          label: n,
          colorHex: colorHex(day.color ?? dayColor(day.dayIndex)),
          variant: "place",
          visited: item.place.visited,
          dimmed: hoverId !== null && hoverId !== item.id,
        });
      }
    }
    return out;
  }, [visibleDays, hoverId]);

  const routes: MapRoute[] = useMemo(
    () =>
      visibleDays.flatMap((day) => {
        const hex = colorHex(day.color ?? dayColor(day.dayIndex));
        return day.legs.map((l, i) => {
          const from = day.items.find((it) => it.id === l.afterItemId)?.place;
          const to = day.items.find((it) => it.id === l.beforeItemId)?.place;
          return {
            id: `${day.id}:${i}`,
            colorHex: hex,
            encoded: l.leg?.polyline ?? null,
            points:
              from && to
                ? [
                    { lat: from.lat, lng: from.lng },
                    { lat: to.lat, lng: to.lng },
                  ]
                : [],
            dashed: !l.leg?.polyline,
          };
        });
      }),
    [visibleDays],
  );

  function dayOf(itemId: string): ItineraryDayDTO | undefined {
    if (itemId.startsWith("day:")) return days.find((d) => d.id === itemId.slice(4));
    return days.find((d) => d.items.some((i) => i.id === itemId));
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = dayOf(String(active.id));
    const to = dayOf(String(over.id));
    if (!from || !to || from.id === to.id) return;
    setDays((prev) => {
      const moving = from.items.find((i) => i.id === active.id);
      if (!moving) return prev;
      const overIndex = to.items.findIndex((i) => i.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : to.items.length;
      return prev.map((d) => {
        if (d.id === from.id) return { ...d, items: d.items.filter((i) => i.id !== active.id) };
        if (d.id === to.id)
          return {
            ...d,
            items: [...d.items.slice(0, insertAt), moving, ...d.items.slice(insertAt)],
          };
        return d;
      });
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const target = dayOf(String(over.id)) ?? dayOf(String(active.id));
    if (!target) return;
    const oldIndex = target.items.findIndex((i) => i.id === active.id);
    const newIndex = target.items.findIndex((i) => i.id === over.id);
    const ordered =
      oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex
        ? arrayMove(target.items, oldIndex, newIndex)
        : target.items;
    setDays((prev) => prev.map((d) => (d.id === target.id ? { ...d, items: ordered } : d)));
    const originalDay = initialDays.find((d) => d.items.some((i) => i.id === active.id));
    start(async () => {
      if (originalDay && originalDay.id !== target.id) {
        const res = await moveItemToDay({
          tripId,
          id: String(active.id),
          dayId: target.id,
          index: ordered.findIndex((i) => i.id === active.id),
        });
        if (!res.ok) {
          toast.error(res.error);
          router.refresh();
          return;
        }
      }
      const res = await reorderDayItems({
        tripId,
        dayId: target.id,
        orderedIds: ordered.map((i) => i.id),
      });
      if (!res.ok) toast.error(res.error);
      router.refresh();
    });
  }

  const listPane = (
    <div className="space-y-3 p-3 pb-32 lg:pb-6">
      <div className="no-print flex items-center gap-2">
        <select
          value={focusDay ?? "all"}
          onChange={(e) => setFocusDay(e.target.value === "all" ? null : e.target.value)}
          className="h-9 rounded-full border border-border bg-background px-3 text-sm font-semibold"
          aria-label="Show days"
        >
          <option value="all">All days</option>
          {days.map((d) => (
            <option key={d.id} value={d.id}>
              Day {d.dayIndex + 1}
              {d.date ? ` · ${formatDayLabel(d)}` : ""}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCompact((c) => !c)}
          aria-pressed={compact}
        >
          {compact ? <Rows3 /> : <Rows2 />} {compact ? "Detailed" : "Compact"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        {visibleDays.map((day) => (
          <DaySection
            key={day.id}
            day={day}
            tripMode={tripMode}
            canEdit={canEdit}
            compact={compact}
            legsLoading={legsLoading.has(day.id)}
            onAdd={setAddForDay}
            onAddQuick={(d, kind) =>
              start(async () => {
                const res = await addItineraryItem({ tripId, dayId: d.id, kind });
                if (!res.ok) toast.error(res.error);
                else router.refresh();
              })
            }
            onOptimize={setOptimizeDay}
            onSetMode={(d, mode) =>
              start(async () => {
                const res = await updateDay({ tripId, dayId: d.id, travelMode: mode });
                if (!res.ok) toast.error(res.error);
                else router.refresh();
              })
            }
            onRenameDay={(d, title) =>
              start(async () => {
                await updateDay({ tripId, dayId: d.id, title: title.trim() || null });
                router.refresh();
              })
            }
            onToggleCollapsed={(d, collapsed) => {
              setDays((prev) => prev.map((x) => (x.id === d.id ? { ...x, collapsed } : x)));
              start(async () => void (await updateDay({ tripId, dayId: d.id, collapsed })));
            }}
            onOpenItem={(item) => {
              if (item.place?.googleMapsUri)
                window.open(item.place.googleMapsUri, "_blank", "noreferrer");
            }}
            onRemoveItem={(item) =>
              start(async () => {
                const res = await removeItineraryItem({ tripId, id: item.id });
                if (!res.ok) toast.error(res.error);
                else router.refresh();
              })
            }
            onSetItemTime={(item, time) =>
              start(async () => {
                await updateItineraryItem({ tripId, id: item.id, startTime: time });
                router.refresh();
              })
            }
            onEditItemText={(item, text) =>
              start(async () => {
                await updateItineraryItem({ tripId, id: item.id, text });
                router.refresh();
              })
            }
            onToggleItemDone={(item, done) =>
              start(async () => {
                await updateItineraryItem({ tripId, id: item.id, done });
                router.refresh();
              })
            }
            onHoverItem={setHoverId}
          />
        ))}
        <DragOverlay>
          {activeId && (
            <div className="rounded-2xl border border-primary bg-card px-3 py-2 font-semibold shadow-lg">
              {days.flatMap((d) => d.items).find((i) => i.id === activeId)?.place?.name ?? "Item"}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {days.length === 0 && (
        <p className="rounded-3xl border border-dashed border-border p-8 text-center text-muted-foreground">
          This trip has no days yet. Add dates in trip settings.
        </p>
      )}
    </div>
  );

  const mapPane = (
    <>
      <TripMap
        apiKey={mapsApiKey}
        mapId={mapId}
        markers={markers}
        routes={routes}
        view={{ bbox: tripBBox }}
        fitKey={`itinerary:${focusDay ?? "all"}:${markers.length}`}
        selectedId={hoverId}
        onSelect={setHoverId}
        className="size-full"
      />
      <MapOverlayControls />
    </>
  );

  return (
    <>
      <SplitView list={listPane} map={mapPane} />
      <AddToDaySheet
        open={addForDay !== null}
        onOpenChange={(o) => !o && setAddForDay(null)}
        tripId={tripId}
        dayId={addForDay?.id ?? null}
        dayLabel={addForDay ? `Day ${addForDay.dayIndex + 1}` : ""}
        unscheduled={unscheduled}
        onSearchInstead={() => setSearchForDay(addForDay)}
        onDone={refresh}
      />
      <PlaceSearchSheet
        open={searchForDay !== null}
        onOpenChange={(o) => !o && setSearchForDay(null)}
        tripId={tripId}
        bbox={tripBBox}
        near={destinations.map((d) => d.name).join(", ")}
        dayId={searchForDay?.id}
        onAdded={refresh}
      />
      <OptimizeDialog
        day={optimizeDay}
        tripId={tripId}
        open={optimizeDay !== null}
        onOpenChange={(o) => !o && setOptimizeDay(null)}
        onApplied={refresh}
      />
    </>
  );
}
