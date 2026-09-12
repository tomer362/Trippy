"use client";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { COLOR_KEYS, colorHex, MARKER_COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { TripListDTO, TripPlaceDTO } from "@/server/queries/places";
import { ListIcon } from "./list-icon";
import { PlaceRow } from "./place-row";

export function ListSection({
  list,
  canEdit,
  selectedIds,
  selecting,
  dayLabelFor,
  onToggleSelect,
  onOpenPlace,
  onPlaceMenu,
  onHoverPlace,
  onAddPlace,
  onRename,
  onRecolor,
  onToggleMapVisibility,
  onSelectAll,
  onDelete,
  onCopyToTrip,
}: {
  list: TripListDTO;
  canEdit: boolean;
  selectedIds: Set<string>;
  selecting: boolean;
  dayLabelFor: (place: TripPlaceDTO) => string | null;
  onToggleSelect: (id: string, shift: boolean) => void;
  onOpenPlace: (p: TripPlaceDTO) => void;
  onPlaceMenu: (p: TripPlaceDTO, anchor: HTMLElement) => void;
  onHoverPlace?: (id: string | null) => void;
  onAddPlace: (listId: string) => void;
  onRename: (listId: string, name: string) => void;
  onRecolor: (listId: string, color: string) => void;
  onToggleMapVisibility: (listId: string, hidden: boolean) => void;
  onSelectAll: (listId: string) => void;
  onDelete: (listId: string) => void;
  onCopyToTrip: (listId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: `list:${list.id}` });
  const hex = colorHex(list.color);

  return (
    <section
      className={cn(
        "rounded-3xl border border-border bg-card/60 p-2",
        isOver && "ring-2 ring-primary",
      )}
    >
      <header className="flex items-center gap-2 px-1 py-1">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="rounded-lg p-1 hover:bg-muted"
          aria-label={collapsed ? "Expand list" : "Collapse list"}
        >
          <ChevronDown className={cn("size-4 transition-transform", collapsed && "-rotate-90")} />
        </button>
        <span
          className="flex size-7 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: hex }}
        >
          <ListIcon name={list.icon} className="size-4" />
        </span>
        {renaming ? (
          <input
            // biome-ignore lint/a11y/noAutofocus: the field only mounts after the user chooses Rename
            autoFocus
            defaultValue={list.name}
            onBlur={(e) => {
              setRenaming(false);
              if (e.target.value.trim() && e.target.value !== list.name)
                onRename(list.id, e.target.value.trim());
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setRenaming(false);
            }}
            className="flex-1 rounded-lg border border-border bg-background px-2 py-1 font-bold"
            aria-label="List name"
          />
        ) : (
          <h3 className="flex-1 truncate font-bold">
            {list.name}{" "}
            <span className="font-normal text-muted-foreground">({list.places.length})</span>
          </h3>
        )}
        {list.hiddenOnMap && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            hidden
          </span>
        )}
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => onAddPlace(list.id)}
              className="rounded-lg p-1.5 hover:bg-muted"
              aria-label={`Add a place to ${list.name}`}
            >
              <Plus className="size-4" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="rounded-lg p-1.5 hover:bg-muted"
                aria-label={`List options for ${list.name}`}
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onSelectAll(list.id)}>
                  Select all
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => onToggleMapVisibility(list.id, !list.hiddenOnMap)}
                >
                  {list.hiddenOnMap ? "Show on map" : "Hide on map"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onCopyToTrip(list.id)}>
                  Copy list to another trip…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="flex flex-wrap gap-1.5 p-2">
                  {COLOR_KEYS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onRecolor(list.id, c)}
                      className={cn(
                        "size-5 rounded-full ring-offset-2 ring-offset-card",
                        list.color === c && "ring-2 ring-foreground",
                      )}
                      style={{ backgroundColor: MARKER_COLORS[c] }}
                      aria-label={`Colour ${c}`}
                    />
                  ))}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => onDelete(list.id)}>
                  Delete list
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </header>

      {!collapsed && (
        <div ref={setNodeRef} className="min-h-4">
          <SortableContext
            items={list.places.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-0.5">
              {list.places.map((p, i) => (
                <PlaceRow
                  key={p.id}
                  place={p}
                  index={i}
                  colorHex={colorHex(p.color ?? list.color)}
                  canEdit={canEdit}
                  selected={selectedIds.has(p.id)}
                  selecting={selecting}
                  dayLabel={dayLabelFor(p)}
                  onToggleSelect={onToggleSelect}
                  onOpen={onOpenPlace}
                  onMenu={onPlaceMenu}
                  onHover={onHoverPlace}
                />
              ))}
            </ul>
          </SortableContext>
          {list.places.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              {canEdit ? "Drop places here, or add one with +" : "No places yet"}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
