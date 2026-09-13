"use client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Search, Star, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/misc";
import { PLACE_CATEGORIES } from "@/lib/place-categories";
import { cn } from "@/lib/utils";
import { addPlaceToTrip } from "@/server/actions/places";
import type { BBox } from "@/server/db/schema/geo";
import { PlacePhoto } from "./place-photo";

type Suggestion = { placeId: string; mainText: string; secondaryText: string; types: string[] };
type SearchResult = {
  placeId: string;
  name: string;
  address: string | null;
  type: string | null;
  rating: number | null;
  ratingCount: number | null;
  priceLevel: string | null;
  photo: string | null;
};

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function PlaceSearchSheet({
  open,
  onOpenChange,
  tripId,
  bbox,
  near,
  listId,
  dayId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  bbox: BBox | null;
  near: string;
  listId?: string | null;
  dayId?: string;
  onAdded?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const debounced = useDebounced(query, 280);
  // A session ends when the Details call for the picked place carries this token, so a new
  // one is minted after every pick — reusing it would bill the next search as the same session.
  const [session, setSession] = useState(() => crypto.randomUUID());
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [added, setAdded] = useState<Set<string>>(new Set());
  const bboxParam = bbox ? bbox.join(",") : "";

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
    else {
      setQuery("");
      setCategory(null);
      setAdded(new Set());
      setSession(crypto.randomUUID());
    }
  }, [open]);

  const suggestions = useQuery({
    queryKey: ["place-autocomplete", debounced, bboxParam],
    queryFn: async (): Promise<Suggestion[]> => {
      const res = await fetch(
        `/api/places/autocomplete?q=${encodeURIComponent(debounced)}&session=${session}&bbox=${bboxParam}`,
      );
      if (!res.ok) return [];
      return ((await res.json()) as { suggestions: Suggestion[] }).suggestions;
    },
    enabled: open && debounced.trim().length >= 2 && !category,
    staleTime: 60_000,
  });

  const browse = useQuery({
    queryKey: ["place-search", category, bboxParam, near],
    queryFn: async (): Promise<SearchResult[]> => {
      const res = await fetch(
        `/api/places/search?category=${category}&bbox=${bboxParam}&near=${encodeURIComponent(near)}`,
      );
      if (!res.ok) return [];
      return ((await res.json()) as { results: SearchResult[] }).results;
    },
    enabled: open && Boolean(category),
    staleTime: 300_000,
  });

  function add(googlePlaceId: string, name: string) {
    start(async () => {
      const res = await addPlaceToTrip({
        tripId,
        googlePlaceId,
        listId: listId ?? undefined,
        dayId,
        sessionToken: session,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSession(crypto.randomUUID());
      setAdded((prev) => new Set(prev).add(googlePlaceId));
      toast.success(`Added ${name}`);
      onAdded?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="full"
        className="flex flex-col bg-background p-0 sm:inset-auto sm:left-1/2 sm:top-[6vh] sm:h-[86vh] sm:w-full sm:max-w-2xl sm:-translate-x-1/2 sm:rounded-3xl sm:border"
      >
        <DialogTitle className="sr-only">Add a place</DialogTitle>
        <div className="safe-pt flex items-center gap-2 px-3 pb-2 pt-3">
          <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl bg-muted px-3">
            <Search className="size-5 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCategory(null);
              }}
              placeholder={near ? `Search places in ${near}` : "Search for a place"}
              className="h-full flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              enterKeyHint="search"
              aria-label="Search for a place"
            />
            {suggestions.isFetching && (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-2 hover:bg-muted"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="scrollbar-none flex gap-2 overflow-x-auto px-3 pb-2">
          {PLACE_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setCategory(category === c.key ? null : c.key);
                setQuery("");
              }}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold",
                category === c.key ? "bg-foreground text-background" : "bg-muted hover:bg-muted/70",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-8">
          {category ? (
            browse.isLoading ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {(browse.data ?? []).map((r) => (
                  <li key={r.placeId} className="flex gap-3 rounded-2xl border border-border p-2">
                    <PlacePhoto
                      name={r.photo}
                      alt=""
                      className="size-20 shrink-0 rounded-xl"
                      width={200}
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="truncate font-semibold">{r.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.type ?? r.address}
                      </p>
                      <p className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
                        {r.rating && (
                          <span className="inline-flex items-center gap-1">
                            <Star className="size-3 fill-amber-400 text-amber-400" />{" "}
                            {r.rating.toFixed(1)}
                            {r.ratingCount ? ` (${r.ratingCount})` : ""}
                          </span>
                        )}
                        {r.priceLevel && <span>{r.priceLevel}</span>}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={pending || added.has(r.placeId)}
                      onClick={() => add(r.placeId, r.name)}
                      className="self-center rounded-full bg-primary p-2 text-primary-foreground disabled:opacity-50"
                      aria-label={`Add ${r.name}`}
                    >
                      <Plus className="size-4" />
                    </button>
                  </li>
                ))}
                {browse.data?.length === 0 && (
                  <li className="py-8 text-center text-muted-foreground">No results here.</li>
                )}
              </ul>
            )
          ) : (
            <ul>
              {(suggestions.data ?? []).map((s) => (
                <li key={s.placeId}>
                  <button
                    type="button"
                    disabled={pending || added.has(s.placeId)}
                    onClick={() => add(s.placeId, s.mainText)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left hover:bg-muted disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{s.mainText}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {s.secondaryText}
                      </span>
                    </span>
                    <Plus className="size-5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
              {debounced.length >= 2 &&
                suggestions.data?.length === 0 &&
                !suggestions.isFetching && (
                  <li className="py-8 text-center text-muted-foreground">
                    Nothing found. Try a different search.
                  </li>
                )}
              {debounced.length < 2 && (
                <li className="px-3 py-8 text-center text-muted-foreground">
                  Search by name, or pick a category above.
                </li>
              )}
            </ul>
          )}
        </div>
      </SheetContent>
    </Dialog>
  );
}
