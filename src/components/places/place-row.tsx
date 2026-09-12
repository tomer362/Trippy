"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Check, GripVertical, MoreHorizontal, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TripPlaceDTO } from "@/server/queries/places";

export type PlaceRowProps = {
  place: TripPlaceDTO;
  colorHex: string;
  canEdit: boolean;
  selected: boolean;
  selecting: boolean;
  dayLabel?: string | null;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onOpen: (place: TripPlaceDTO) => void;
  onMenu: (place: TripPlaceDTO, anchor: HTMLElement) => void;
  onHover?: (id: string | null) => void;
  index?: number;
};

export function PlaceRow({
  place,
  colorHex,
  canEdit,
  selected,
  selecting,
  dayLabel,
  onToggleSelect,
  onOpen,
  onMenu,
  onHover,
  index,
}: PlaceRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: place.id,
    disabled: !canEdit,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group flex items-center gap-2 rounded-2xl border border-transparent bg-card px-2 py-2 hover:border-border",
        isDragging && "z-10 opacity-80 shadow-lg",
        selected && "border-primary bg-primary/5",
      )}
      onMouseEnter={() => onHover?.(place.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      {canEdit && (
        <button
          type="button"
          className="cursor-grab touch-none rounded-lg p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
          aria-label={`Reorder ${place.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      {canEdit && (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggleSelect(place.id, (e.nativeEvent as MouseEvent).shiftKey)}
          className={cn(
            "size-4 shrink-0",
            !selecting && !selected && "opacity-0 group-hover:opacity-100",
          )}
          aria-label={`Select ${place.name}`}
        />
      )}
      <button
        type="button"
        onClick={() => onOpen(place)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
          style={{ backgroundColor: colorHex }}
          aria-hidden
        >
          {place.visited ? (
            <Check className="size-3" strokeWidth={4} />
          ) : index !== undefined ? (
            index + 1
          ) : (
            ""
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate font-semibold",
              place.visited && "text-muted-foreground line-through",
            )}
          >
            {place.name}
          </span>
          <span className="flex items-center gap-2 truncate text-xs text-muted-foreground">
            {place.primaryType && (
              <span className="truncate capitalize">{place.primaryType.replace(/_/g, " ")}</span>
            )}
            {place.notes && <StickyNote className="size-3 shrink-0" />}
            {dayLabel && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5">
                <CalendarDays className="size-3" />
                {dayLabel}
              </span>
            )}
            {place.cost && (
              <span className="shrink-0">
                {place.cost} {place.currency}
              </span>
            )}
          </span>
        </span>
      </button>
      {canEdit && (
        <button
          type="button"
          onClick={(e) => onMenu(place, e.currentTarget)}
          className="rounded-lg p-1.5 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Actions for ${place.name}`}
        >
          <MoreHorizontal className="size-4" />
        </button>
      )}
    </li>
  );
}
