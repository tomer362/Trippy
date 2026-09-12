"use client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Input, Label } from "@/components/ui/input";
import type { BBox } from "@/server/db/schema/geo";

type Suggestion = { placeId: string; mainText: string; secondaryText: string };

/** Type-ahead for hotels that fills in the name, address and place id in one go. */
export function HotelSearchField({
  value,
  onPick,
  onTypeName,
  bbox,
  label = "Where are you staying?",
}: {
  value: string;
  onPick: (suggestion: { googlePlaceId: string; name: string; address: string }) => void;
  onTypeName: (name: string) => void;
  bbox: BBox | null;
  label?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState(value);
  const session = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 280);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ["hotel-autocomplete", debounced],
    queryFn: async (): Promise<Suggestion[]> => {
      const res = await fetch(
        `/api/places/autocomplete?q=${encodeURIComponent(debounced)}&session=${session}&bbox=${bbox ? bbox.join(",") : ""}`,
      );
      if (!res.ok) return [];
      return ((await res.json()) as { suggestions: Suggestion[] }).suggestions;
    },
    enabled: open && debounced.trim().length >= 2,
    staleTime: 60_000,
  });

  return (
    <div className="relative space-y-1">
      <Label htmlFor="hotel-search">{label}</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="hotel-search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onTypeName(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Hotel, apartment or address"
          className="pl-9"
          autoComplete="off"
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && (data?.length ?? 0) > 0 && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-2xl border border-border bg-card shadow-lg">
          {data!.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => {
                  onPick({ googlePlaceId: s.placeId, name: s.mainText, address: s.secondaryText });
                  setQuery(s.mainText);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left hover:bg-muted"
              >
                <span className="block truncate font-medium">{s.mainText}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {s.secondaryText}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
