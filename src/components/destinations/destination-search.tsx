"use client";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { type DestinationDTO, KIND_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

async function search(q: string, session: string): Promise<DestinationDTO[]> {
  const res = await fetch(`/api/destinations/search?q=${encodeURIComponent(q)}&session=${session}`);
  if (!res.ok) throw new Error("search failed");
  return ((await res.json()) as { results: DestinationDTO[] }).results;
}

export function DestinationSearchSheet({
  open,
  onOpenChange,
  onSelect,
  excludeIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (d: DestinationDTO) => void;
  excludeIds: string[];
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 250);
  const session = useMemo(() => crypto.randomUUID(), []);
  const [promoting, setPromoting] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["destination-search", debounced],
    queryFn: () => search(debounced, session),
    enabled: open,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setQuery("");
  }, [open]);

  const results = (data ?? []).filter((d) => !d.id || !excludeIds.includes(d.id));

  async function choose(d: DestinationDTO) {
    if (d.provisional && d.googlePlaceId) {
      setPromoting(d.googlePlaceId);
      try {
        const res = await fetch("/api/destinations/promote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeId: d.googlePlaceId, session }),
        });
        if (!res.ok) throw new Error();
        const { destination } = (await res.json()) as { destination: DestinationDTO };
        onSelect(destination);
      } catch {
        toast.error("Couldn't load that place. Try another result.");
      } finally {
        setPromoting(null);
      }
    } else {
      onSelect(d);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="full"
        className="flex flex-col bg-background p-0 sm:inset-auto sm:left-1/2 sm:top-[8vh] sm:h-[80vh] sm:w-full sm:max-w-xl sm:-translate-x-1/2 sm:rounded-3xl sm:border"
      >
        <DialogTitle className="sr-only">Search destinations</DialogTitle>
        <div className="safe-pt flex items-center gap-2 px-3 pb-3 pt-3">
          <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl bg-muted px-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full p-2 hover:bg-background"
              aria-label="Back"
            >
              <ArrowLeft className="size-5" />
            </button>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Paris, Tokyo, Hawaii"
              className="h-full flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground"
              autoComplete="off"
              autoCorrect="off"
              enterKeyHint="search"
              aria-label="Search destinations"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-full p-2 hover:bg-background"
                aria-label="Clear"
              >
                <X className="size-5" />
              </button>
            ) : isFetching ? (
              <Loader2 className="mr-2 size-5 animate-spin text-muted-foreground" />
            ) : null}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-6">
          {!query && <p className="px-3 pb-2 pt-1 text-sm font-bold">Popular destinations</p>}
          {results.length === 0 && !isFetching && query && (
            <p className="px-3 py-8 text-center text-muted-foreground">
              No destinations found for “{query}”.
            </p>
          )}
          <ul>
            {results.map((d) => (
              <li key={d.id ?? d.googlePlaceId ?? d.name}>
                <button
                  type="button"
                  onClick={() => choose(d)}
                  disabled={promoting !== null}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left hover:bg-muted disabled:opacity-60",
                    promoting === d.googlePlaceId && "animate-pulse",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-lg">{d.name}</span>
                    {d.subtitle && (
                      <span className="block truncate text-sm text-muted-foreground">
                        {d.subtitle}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                    {KIND_LABEL[d.kind]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Dialog>
  );
}
