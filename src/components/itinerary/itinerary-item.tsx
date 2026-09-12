"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  Clock,
  Coffee,
  GripVertical,
  ListChecks,
  MoreHorizontal,
  StickyNote,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { colorHex } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { ItineraryItemDTO } from "@/server/queries/itinerary";

export function ItineraryItemRow({
  item,
  stopNumber,
  dayColorHex,
  canEdit,
  compact,
  onOpen,
  onRemove,
  onSetTime,
  onEditText,
  onToggleDone,
  onHover,
}: {
  item: ItineraryItemDTO;
  stopNumber: number | null;
  dayColorHex: string;
  canEdit: boolean;
  compact: boolean;
  onOpen: (item: ItineraryItemDTO) => void;
  onRemove: (item: ItineraryItemDTO) => void;
  onSetTime: (item: ItineraryItemDTO, startTime: string | null) => void;
  onEditText: (item: ItineraryItemDTO, text: string) => void;
  onToggleDone: (item: ItineraryItemDTO, done: boolean) => void;
  onHover?: (id: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  });
  const style = { transform: CSS.Translate.toString(transform), transition };
  const time = item.startTime?.slice(0, 5) ?? "";

  if (item.place) {
    return (
      <li
        ref={setNodeRef}
        style={style}
        className={cn(
          "group flex items-start gap-2 rounded-2xl border border-transparent bg-card px-2 py-2 hover:border-border",
          isDragging && "z-10 shadow-lg",
        )}
        onMouseEnter={() => onHover?.(item.id)}
        onMouseLeave={() => onHover?.(null)}
      >
        {canEdit && (
          <button
            type="button"
            className="mt-1 cursor-grab touch-none rounded-lg p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
            aria-label={`Reorder ${item.place.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        )}
        <span
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
          style={{ backgroundColor: colorHex(item.place.colorHint ?? undefined) || dayColorHex }}
        >
          {item.place.visited ? <Check className="size-3" strokeWidth={4} /> : stopNumber}
        </span>
        <button type="button" onClick={() => onOpen(item)} className="min-w-0 flex-1 text-left">
          <span className="block truncate font-semibold">{item.place.name}</span>
          {!compact && (
            <span className="block truncate text-xs text-muted-foreground">
              {item.place.primaryType?.replace(/_/g, " ") ?? item.place.address}
            </span>
          )}
          {!compact && item.place.notes && (
            <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
              {item.place.notes}
            </span>
          )}
        </button>
        <span className="flex shrink-0 items-center gap-1">
          {canEdit ? (
            <label className="relative inline-flex items-center">
              <span className="sr-only">Start time for {item.place.name}</span>
              <input
                type="time"
                value={time}
                onChange={(e) => onSetTime(item, e.target.value || null)}
                className={cn(
                  "w-[5.5rem] rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-right text-xs tabular-nums hover:border-border focus:border-border focus:outline-none",
                  !time &&
                    "text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100",
                )}
              />
            </label>
          ) : (
            time && <span className="text-xs tabular-nums text-muted-foreground">{time}</span>
          )}
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="rounded-lg p-1.5 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Actions for ${item.place.name}`}
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onOpen(item)}>Open details</DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={() => onRemove(item)}>
                  Remove from day
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </span>
      </li>
    );
  }

  const Icon = item.kind === "checklist" ? ListChecks : item.kind === "break" ? Coffee : StickyNote;
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 rounded-2xl px-2 py-1.5",
        isDragging && "z-10 bg-card shadow-lg",
      )}
    >
      {canEdit && (
        <button
          type="button"
          className="cursor-grab touch-none rounded-lg p-1 text-muted-foreground opacity-0 group-hover:opacity-100 active:cursor-grabbing"
          aria-label="Reorder item"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      {item.kind === "checklist" ? (
        <input
          type="checkbox"
          checked={item.done}
          onChange={(e) => onToggleDone(item, e.target.checked)}
          disabled={!canEdit}
          className="size-4"
          aria-label={item.text ?? "Task"}
        />
      ) : (
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      )}
      {canEdit ? (
        <input
          defaultValue={item.text ?? ""}
          onBlur={(e) => e.target.value !== (item.text ?? "") && onEditText(item, e.target.value)}
          placeholder={
            item.kind === "break"
              ? "Break, lunch, rest…"
              : item.kind === "checklist"
                ? "Something to do"
                : "Note"
          }
          className={cn(
            "min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-border focus:border-border focus:outline-none",
            item.done && "line-through opacity-60",
          )}
        />
      ) : (
        <span className={cn("min-w-0 flex-1 text-sm", item.done && "line-through opacity-60")}>
          {item.text}
        </span>
      )}
      {item.startTime && <Clock className="size-3.5 text-muted-foreground" />}
      {canEdit && (
        <button
          type="button"
          onClick={() => onRemove(item)}
          className="rounded-lg p-1.5 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100"
          aria-label="Remove item"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </li>
  );
}
