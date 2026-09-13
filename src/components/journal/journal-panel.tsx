"use client";
import { BookOpen, CalendarPlus, Plus, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { TripMap } from "@/components/map/trip-map";
import type { MapMarker } from "@/components/map/types";
import { RichNotes } from "@/components/notes/rich-notes";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { MARKER_COLORS } from "@/lib/colors";
import { formatDayLabel } from "@/lib/days";
import { useOnline } from "@/lib/use-online";
import {
  addJournalEntry,
  removeJournalEntry,
  removeJournalPhoto,
  seedJournalFromItinerary,
  setPhotoCaption,
  updateJournalEntry,
} from "@/server/actions/content";
import type { BBox } from "@/server/db/schema/geo";
import type { JournalEntryDTO } from "@/server/queries/content";
import { PhotoUploader } from "./photo-uploader";

const MOODS = ["🤩", "😊", "😌", "😮", "😴", "🥵", "🌧️"];

export function JournalPanel({
  tripId,
  canEdit: canEditProp,
  entries,
  blobEnabled,
  mapsApiKey,
  mapId,
  tripBBox,
}: {
  tripId: string;
  canEdit: boolean;
  entries: JournalEntryDTO[];
  blobEnabled: boolean;
  mapsApiKey: string | null;
  mapId: string | null;
  tripBBox: BBox | null;
}) {
  // Every write here is a server action, which throws with no connection — so the
  // controls go read-only rather than inviting an edit that cannot be sent.
  const online = useOnline();
  const canEdit = canEditProp && online;
  const router = useRouter();
  const [, start] = useTransition();
  const refresh = useCallback(() => start(() => router.refresh()), [router]);
  const [showMap, setShowMap] = useState(false);

  const photoMarkers: MapMarker[] = useMemo(
    () =>
      entries
        .flatMap((e) =>
          e.photos.filter((p) => p.lat !== null && p.lng !== null).map((p) => ({ p, e })),
        )
        .map(({ p, e }) => ({
          id: p.id,
          lat: p.lat!,
          lng: p.lng!,
          title: p.caption ?? e.title ?? "Photo",
          colorHex: MARKER_COLORS.violet,
          variant: "place" as const,
        })),
    [entries],
  );

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Failed");
      else {
        if (success) toast.success(success);
        refresh();
      }
    });
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Journal</h2>
          <p className="text-sm text-muted-foreground">
            What actually happened, with photos. Everyone on the trip can add to it.
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {entries.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  start(async () => {
                    const res = await seedJournalFromItinerary({ tripId });
                    if (!res.ok) toast.error(res.error);
                    else {
                      toast.success(
                        res.data.created > 0
                          ? `Added ${res.data.created} days`
                          : "No itinerary days with stops yet",
                      );
                      refresh();
                    }
                  })
                }
              >
                <Sparkles /> Build from itinerary
              </Button>
            )}
            <Button
              size="sm"
              onClick={() =>
                run(
                  () =>
                    addJournalEntry({
                      tripId,
                      date: new Date().toISOString().slice(0, 10),
                      title: "Today",
                    }),
                  "Entry added",
                )
              }
            >
              <Plus /> New entry
            </Button>
          </div>
        )}
      </div>

      {photoMarkers.length > 0 && (
        <div className="mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowMap((s) => !s)}
            aria-expanded={showMap}
          >
            {showMap ? "Hide" : "Show"} photo map ({photoMarkers.length})
          </Button>
          {showMap && (
            <div className="mt-2 h-64 overflow-hidden rounded-3xl border border-border">
              <TripMap
                apiKey={mapsApiKey}
                mapId={mapId}
                markers={photoMarkers}
                view={{ bbox: tripBBox }}
                fitKey={`journal:${photoMarkers.length}`}
                className="size-full"
              />
            </div>
          )}
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="Nothing written yet"
          description="Add an entry for a day, or build the journal from your itinerary and fill in the photos as you go."
        />
      ) : (
        <ol className="space-y-4">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-3xl border border-border bg-card p-4">
              <header className="mb-2 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {entry.dayIndex !== null && `Day ${entry.dayIndex + 1}`}
                    {entry.dayIndex !== null && entry.date && " · "}
                    {entry.date &&
                      formatDayLabel(
                        { dayIndex: entry.dayIndex ?? 0, date: entry.date },
                        { long: true },
                      )}
                  </p>
                  {canEdit ? (
                    <input
                      defaultValue={entry.title ?? ""}
                      onBlur={(e) =>
                        e.target.value !== (entry.title ?? "") &&
                        run(() =>
                          updateJournalEntry({
                            tripId,
                            id: entry.id,
                            title: e.target.value || null,
                          }),
                        )
                      }
                      placeholder="Title this entry"
                      className="w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-lg font-bold hover:border-border focus:border-border focus:outline-none"
                      aria-label="Entry title"
                    />
                  ) : (
                    entry.title && <p className="text-lg font-bold">{entry.title}</p>
                  )}
                </div>
                {entry.authorName && (
                  <Avatar src={entry.authorImage} name={entry.authorName} size={26} />
                )}
                {canEdit && (
                  <button
                    type="button"
                    aria-label="Delete entry"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                    onClick={() => {
                      if (confirm("Delete this entry and its photos?"))
                        run(() => removeJournalEntry({ tripId, id: entry.id }));
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </header>

              {canEdit && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {MOODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() =>
                        run(() =>
                          updateJournalEntry({
                            tripId,
                            id: entry.id,
                            mood: entry.mood === m ? null : m,
                          }),
                        )
                      }
                      className={`rounded-full border px-2 py-0.5 text-base ${entry.mood === m ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}
                      aria-label={`Mood ${m}`}
                      aria-pressed={entry.mood === m}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
              {!canEdit && entry.mood && <p className="mb-2 text-xl">{entry.mood}</p>}

              <RichNotes
                initialContent={entry.body}
                initialVersion={entry.version}
                canEdit={canEdit}
                placeholder="What happened today?"
                onSave={(body, expectedVersion) =>
                  updateJournalEntry({ tripId, id: entry.id, body, expectedVersion })
                }
              />

              {entry.photos.length > 0 && (
                <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {entry.photos.map((p) => (
                    <li
                      key={p.id}
                      className="group relative overflow-hidden rounded-2xl border border-border"
                    >
                      {/* biome-ignore lint/performance/noImgElement: stored photo served from the blob CDN */}
                      <img
                        src={p.url}
                        alt={p.caption ?? ""}
                        className="aspect-square w-full object-cover"
                        loading="lazy"
                      />
                      {canEdit && (
                        <>
                          <input
                            defaultValue={p.caption ?? ""}
                            onBlur={(e) =>
                              e.target.value !== (p.caption ?? "") &&
                              run(() =>
                                setPhotoCaption({
                                  tripId,
                                  id: p.id,
                                  caption: e.target.value || null,
                                }),
                              )
                            }
                            placeholder="Caption"
                            aria-label="Photo caption"
                            className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1 text-xs text-white placeholder:text-white/70 focus:outline-none"
                          />
                          <button
                            type="button"
                            aria-label="Remove photo"
                            onClick={() => run(() => removeJournalPhoto({ tripId, id: p.id }))}
                            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </>
                      )}
                      {!canEdit && p.caption && (
                        <p className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1 text-xs text-white">
                          {p.caption}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {canEdit && (
                <div className="mt-3 flex items-center gap-2">
                  <PhotoUploader
                    tripId={tripId}
                    entryId={entry.id}
                    enabled={blobEnabled}
                    onDone={refresh}
                  />
                  {entry.date === null && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        run(() =>
                          updateJournalEntry({
                            tripId,
                            id: entry.id,
                            date: new Date().toISOString().slice(0, 10),
                          }),
                        )
                      }
                    >
                      <CalendarPlus /> Date it today
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
