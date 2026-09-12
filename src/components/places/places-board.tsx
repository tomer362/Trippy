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
import { Copy, FolderInput, ListPlus, Plus, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { SplitView } from "@/components/layout/split-view";
import { MapOverlayControls, TripMap } from "@/components/map/trip-map";
import type { MapMarker } from "@/components/map/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { colorHex } from "@/lib/colors";
import type { DestinationDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  createList,
  deleteList,
  moveTripPlaces,
  removeTripPlaces,
  reorderTripPlaces,
  updateList,
} from "@/server/actions/places";
import type { BBox } from "@/server/db/schema/geo";
import type { TripListDTO, TripPlaceDTO } from "@/server/queries/places";
import { ImportSheet } from "./import-sheet";
import { ListSection } from "./list-section";
import { type DayOption, MoveToSheet } from "./move-to-sheet";
import { PlaceDetailSheet } from "./place-detail-sheet";
import { PlaceSearchSheet } from "./place-search-sheet";

const UNLISTED = "__unlisted__";

export function PlacesBoard({
  tripId,
  currency,
  canEdit,
  lists: initialLists,
  unlisted: initialUnlisted,
  days,
  destinations,
  mapsApiKey,
  mapId,
  tripBBox,
}: {
  tripId: string;
  currency: string;
  canEdit: boolean;
  lists: TripListDTO[];
  unlisted: TripPlaceDTO[];
  days: DayOption[];
  destinations: DestinationDTO[];
  mapsApiKey: string | null;
  mapId: string | null;
  tripBBox: BBox | null;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [lists, setLists] = useState<TripListDTO[]>(() =>
    withUnlisted(initialLists, initialUnlisted),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [openPlace, setOpenPlace] = useState<TripPlaceDTO | null>(null);
  const [searchFor, setSearchFor] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(
    () => setLists(withUnlisted(initialLists, initialUnlisted)),
    [initialLists, initialUnlisted],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const allPlaces = useMemo(() => lists.flatMap((l) => l.places), [lists]);
  const dayLabelFor = useCallback(
    (p: TripPlaceDTO) =>
      p.dayIndexes.length === 0
        ? null
        : p.dayIndexes.length === 1
          ? `Day ${p.dayIndexes[0]! + 1}`
          : `${p.dayIndexes.length} days`,
    [],
  );

  const markers: MapMarker[] = useMemo(
    () =>
      lists
        .filter((l) => !l.hiddenOnMap)
        .flatMap((l) =>
          l.places.map((p, i) => ({
            id: p.id,
            lat: p.lat,
            lng: p.lng,
            title: p.name,
            label: i + 1,
            colorHex: colorHex(p.color ?? l.color),
            variant: "place" as const,
            visited: p.visited,
            dimmed: hoverId !== null && hoverId !== p.id,
          })),
        ),
    [lists, hoverId],
  );

  const refresh = useCallback(() => start(() => router.refresh()), [router]);

  function containerOf(id: string): string | null {
    if (id.startsWith("list:")) return id.slice(5);
    return lists.find((l) => l.places.some((p) => p.id === id))?.id ?? null;
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = containerOf(String(active.id));
    const to = containerOf(String(over.id));
    if (!from || !to || from === to) return;
    setLists((prev) => {
      const source = prev.find((l) => l.id === from);
      const target = prev.find((l) => l.id === to);
      const moving = source?.places.find((p) => p.id === active.id);
      if (!source || !target || !moving) return prev;
      const overIndex = target.places.findIndex((p) => p.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : target.places.length;
      return prev.map((l) => {
        if (l.id === from) return { ...l, places: l.places.filter((p) => p.id !== active.id) };
        if (l.id === to)
          return {
            ...l,
            places: [
              ...l.places.slice(0, insertAt),
              { ...moving, listId: to === UNLISTED ? null : to },
              ...l.places.slice(insertAt),
            ],
          };
        return l;
      });
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const container = containerOf(String(over.id)) ?? containerOf(String(active.id));
    if (!container) return;
    const list = lists.find((l) => l.id === container);
    if (!list) return;
    const oldIndex = list.places.findIndex((p) => p.id === active.id);
    const newIndex = list.places.findIndex((p) => p.id === over.id);
    const ordered =
      oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex
        ? arrayMove(list.places, oldIndex, newIndex)
        : list.places;
    setLists((prev) => prev.map((l) => (l.id === container ? { ...l, places: ordered } : l)));
    const targetListId = container === UNLISTED ? null : container;
    start(async () => {
      const original =
        initialLists.find((l) => l.places.some((p) => p.id === active.id))?.id ?? UNLISTED;
      if (original !== container) {
        const res = await moveTripPlaces({
          tripId,
          ids: [String(active.id)],
          targetListId,
          mode: "move",
        });
        if (!res.ok) {
          toast.error(res.error);
          router.refresh();
          return;
        }
      }
      const res = await reorderTripPlaces({
        tripId,
        listId: targetListId,
        orderedIds: ordered.map((p) => p.id),
      });
      if (!res.ok) toast.error(res.error);
      router.refresh();
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function bulkDelete() {
    const ids = [...selected];
    if (!confirm(`Remove ${ids.length} place${ids.length === 1 ? "" : "s"} from this trip?`))
      return;
    start(async () => {
      const res = await removeTripPlaces({ tripId, ids });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Removed");
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  const listPane = (
    <div className="space-y-3 p-3 pb-32 lg:pb-6">
      {canEdit && (
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => {
              setSearchFor(lists.find((l) => l.id !== UNLISTED)?.id ?? null);
              setSearchOpen(true);
            }}
          >
            <Plus /> Add a place
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              start(async () => {
                const res = await createList({
                  tripId,
                  name: `List ${lists.length}`,
                  kind: "custom",
                });
                if (!res.ok) toast.error(res.error);
                else router.refresh();
              })
            }
          >
            <ListPlus /> New list
          </Button>
          <Button variant="outline" onClick={() => setImporting(true)} aria-label="Import places">
            <Upload />
          </Button>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        {lists
          .filter((l) => l.id !== UNLISTED || l.places.length > 0)
          .map((l) => (
            <ListSection
              key={l.id}
              list={l}
              canEdit={canEdit && l.id !== UNLISTED}
              selectedIds={selected}
              selecting={selected.size > 0}
              dayLabelFor={dayLabelFor}
              onToggleSelect={toggleSelect}
              onOpenPlace={setOpenPlace}
              onPlaceMenu={(p) => setFocusedId(p.id)}
              onHoverPlace={setHoverId}
              onAddPlace={(listId) => {
                setSearchFor(listId);
                setSearchOpen(true);
              }}
              onRename={(listId, name) =>
                start(async () => {
                  await updateList({ tripId, id: listId, name });
                  router.refresh();
                })
              }
              onRecolor={(listId, color) =>
                start(async () => {
                  await updateList({ tripId, id: listId, color });
                  router.refresh();
                })
              }
              onToggleMapVisibility={(listId, hidden) => {
                setLists((prev) =>
                  prev.map((x) => (x.id === listId ? { ...x, hiddenOnMap: hidden } : x)),
                );
                start(async () => {
                  await updateList({ tripId, id: listId, hiddenOnMap: hidden });
                  router.refresh();
                });
              }}
              onSelectAll={(listId) => {
                const target = lists.find((x) => x.id === listId);
                if (target) setSelected(new Set(target.places.map((p) => p.id)));
              }}
              onDelete={(listId) => {
                if (!confirm("Delete this list? Its places move to your first list.")) return;
                start(async () => {
                  const res = await deleteList({ tripId, id: listId });
                  if (!res.ok) toast.error(res.error);
                  else router.refresh();
                });
              }}
              onCopyToTrip={() =>
                toast.info("Copy a list into another trip from that trip's Places tab.")
              }
            />
          ))}
        <DragOverlay>
          {activeId && (
            <div className="rounded-2xl border border-primary bg-card px-3 py-2 font-semibold shadow-lg">
              {allPlaces.find((p) => p.id === activeId)?.name ?? "Place"}
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {allPlaces.length === 0 && (
        <p className="rounded-3xl border border-dashed border-border p-8 text-center text-muted-foreground">
          No saved places yet. Search for somewhere you want to go.
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
        view={{ bbox: tripBBox }}
        fitKey={`places:${markers.length}`}
        selectedId={openPlace?.id ?? hoverId}
        onSelect={(id) => setOpenPlace(allPlaces.find((p) => p.id === id) ?? null)}
        className="size-full"
      />
      <MapOverlayControls onToggleLayers={() => setLayersOpen(true)} layersOpen={layersOpen} />
    </>
  );

  return (
    <>
      <SplitView list={listPane} map={mapPane} />

      {selected.size > 0 && (
        <div className="no-print fixed inset-x-3 bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+5.5rem))] z-40 mx-auto flex max-w-lg items-center gap-2 rounded-full bg-foreground px-3 py-2 text-background shadow-xl lg:bottom-6">
          <span className="pl-2 text-sm font-bold">{selected.size} selected</span>
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMoveIds([...selected])}
              className="rounded-full p-2 hover:bg-background/20"
              aria-label="Move or copy"
            >
              <FolderInput className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setMoveIds([...selected]);
              }}
              className="rounded-full p-2 hover:bg-background/20"
              aria-label="Copy"
            >
              <Copy className="size-5" />
            </button>
            <button
              type="button"
              onClick={bulkDelete}
              className="rounded-full p-2 hover:bg-background/20"
              aria-label="Remove"
            >
              <Trash2 className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-full p-2 hover:bg-background/20"
              aria-label="Clear selection"
            >
              <X className="size-5" />
            </button>
          </span>
        </div>
      )}

      <ImportSheet open={importing} onOpenChange={setImporting} tripId={tripId} onDone={refresh} />
      <PlaceSearchSheet
        open={searchOpen}
        onOpenChange={setSearchOpen}
        tripId={tripId}
        bbox={tripBBox}
        near={destinations.map((d) => d.name).join(", ")}
        listId={searchFor}
        onAdded={refresh}
      />
      <PlaceDetailSheet
        place={openPlace}
        tripId={tripId}
        currency={currency}
        canEdit={canEdit}
        onOpenChange={(o) => !o && setOpenPlace(null)}
      />
      <MoveToSheet
        open={moveIds !== null}
        onOpenChange={(o) => !o && setMoveIds(null)}
        tripId={tripId}
        ids={moveIds ?? []}
        lists={lists.filter((l) => l.id !== UNLISTED)}
        days={days}
        onDone={() => {
          setSelected(new Set());
          refresh();
        }}
      />
      <PlaceActions
        place={allPlaces.find((p) => p.id === focusedId) ?? null}
        onOpenChange={(o) => !o && setFocusedId(null)}
        onDetails={(p) => {
          setFocusedId(null);
          setOpenPlace(p);
        }}
        onMove={(p) => {
          setFocusedId(null);
          setMoveIds([p.id]);
        }}
        onRemove={(p) => {
          setFocusedId(null);
          start(async () => {
            const res = await removeTripPlaces({ tripId, ids: [p.id] });
            if (!res.ok) toast.error(res.error);
            else router.refresh();
          });
        }}
      />

      <Dialog open={layersOpen} onOpenChange={setLayersOpen}>
        <SheetContent side="bottom" className="sm:max-w-sm">
          <DialogTitle className="mb-3 text-lg font-bold">Map layers</DialogTitle>
          <ul className="space-y-1">
            {lists
              .filter((l) => l.places.length > 0)
              .map((l) => (
                <li key={l.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={!l.hiddenOnMap}
                      onChange={(e) => {
                        const hidden = !e.target.checked;
                        setLists((prev) =>
                          prev.map((x) => (x.id === l.id ? { ...x, hiddenOnMap: hidden } : x)),
                        );
                        if (l.id !== UNLISTED)
                          start(
                            async () =>
                              void (await updateList({ tripId, id: l.id, hiddenOnMap: hidden })),
                          );
                      }}
                      className="size-4"
                    />
                    <span
                      className={cn("size-4 rounded-full")}
                      style={{ backgroundColor: colorHex(l.color) }}
                    />
                    <span className="flex-1 truncate font-medium">{l.name}</span>
                    <span className="text-xs text-muted-foreground">{l.places.length}</span>
                  </label>
                </li>
              ))}
          </ul>
        </SheetContent>
      </Dialog>
    </>
  );
}

function PlaceActions({
  place,
  onOpenChange,
  onDetails,
  onMove,
  onRemove,
}: {
  place: TripPlaceDTO | null;
  onOpenChange: (open: boolean) => void;
  onDetails: (p: TripPlaceDTO) => void;
  onMove: (p: TripPlaceDTO) => void;
  onRemove: (p: TripPlaceDTO) => void;
}) {
  return (
    <Dialog open={Boolean(place)} onOpenChange={onOpenChange}>
      {place && (
        <SheetContent side="bottom" className="sm:max-w-sm">
          <DialogTitle className="mb-3 truncate text-lg font-bold">{place.name}</DialogTitle>
          <div className="space-y-1">
            <ActionButton onClick={() => onDetails(place)}>Open details</ActionButton>
            <ActionButton onClick={() => onMove(place)}>Move or copy to…</ActionButton>
            {place.googleMapsUri && (
              <a
                href={place.googleMapsUri}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl px-3 py-3 font-medium hover:bg-muted"
              >
                Open in Google Maps
              </a>
            )}
            <ActionButton destructive onClick={() => onRemove(place)}>
              Remove from trip
            </ActionButton>
          </div>
        </SheetContent>
      )}
    </Dialog>
  );
}

function ActionButton({
  children,
  onClick,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full rounded-2xl px-3 py-3 text-left font-medium hover:bg-muted",
        destructive && "text-destructive",
      )}
    >
      {children}
    </button>
  );
}

function withUnlisted(lists: TripListDTO[], unlisted: TripPlaceDTO[]): TripListDTO[] {
  if (unlisted.length === 0) return lists;
  return [
    ...lists,
    {
      id: UNLISTED,
      name: "Unlisted",
      kind: "custom",
      color: "slate",
      icon: "map-pin",
      position: 999,
      hiddenOnMap: false,
      version: 1,
      places: unlisted,
    },
  ];
}
