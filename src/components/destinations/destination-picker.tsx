"use client";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import type { DestinationDTO } from "@/lib/types";
import { DestinationCard } from "./destination-card";
import { DestinationSearchSheet } from "./destination-search";

export function DestinationPicker({
  value,
  onChange,
  max = 12,
}: {
  value: DestinationDTO[];
  onChange: (next: DestinationDTO[]) => void;
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  const ids = value.map((d) => d.id).filter((x): x is string => Boolean(x));
  return (
    <div className="space-y-4">
      {value.length === 0 ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-14 w-full items-center gap-3 rounded-full border border-white/70 bg-white/60 px-5 text-left text-lg text-muted-foreground shadow-sm backdrop-blur hover:bg-white/80 dark:border-white/10 dark:bg-white/5"
        >
          <Search className="size-5" />
          e.g. Paris, Tokyo, Hawaii
        </button>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {value.map((d) => (
            <DestinationCard
              key={d.id ?? d.name}
              destination={d}
              onRemove={() => onChange(value.filter((x) => x !== d))}
            />
          ))}
        </div>
      )}
      {value.length > 0 && value.length < max && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mx-auto flex items-center gap-2 rounded-full px-4 py-2 font-semibold text-muted-foreground hover:bg-white/50 hover:text-foreground"
        >
          <Plus className="size-5" /> Add more
        </button>
      )}
      <DestinationSearchSheet
        open={open}
        onOpenChange={setOpen}
        excludeIds={ids}
        onSelect={(d) => {
          if (value.some((v) => v.id && v.id === d.id)) return;
          onChange([...value, d]);
        }}
      />
    </div>
  );
}
