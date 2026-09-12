"use client";
import { Bed, ExternalLink, MoonStar, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { SplitView } from "@/components/layout/split-view";
import { TripMap } from "@/components/map/trip-map";
import type { MapMarker } from "@/components/map/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { MARKER_COLORS } from "@/lib/colors";
import { formatDateRange } from "@/lib/days";
import type { BBox } from "@/server/db/schema/geo";
import type { AttachmentDTO, LodgingDTO } from "@/server/queries/bookings";
import { LodgingForm } from "./lodging-form";

export function LodgingPanel({
  tripId,
  currency,
  canEdit,
  tripStart,
  lodgings,
  attachments,
  blobEnabled,
  mapsApiKey,
  mapId,
  tripBBox,
}: {
  tripId: string;
  currency: string;
  canEdit: boolean;
  tripStart: string | null;
  lodgings: LodgingDTO[];
  attachments: AttachmentDTO[];
  blobEnabled: boolean;
  mapsApiKey: string | null;
  mapId: string | null;
  tripBBox: BBox | null;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [editing, setEditing] = useState<LodgingDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const refresh = useCallback(() => start(() => router.refresh()), [router]);

  const markers: MapMarker[] = useMemo(
    () =>
      lodgings
        .filter((l) => l.lat !== null && l.lng !== null)
        .map((l) => ({
          id: l.id,
          lat: l.lat!,
          lng: l.lng!,
          title: l.name,
          colorHex: MARKER_COLORS.indigo,
          variant: "lodging" as const,
        })),
    [lodgings],
  );

  const listPane = (
    <div className="space-y-3 p-3 pb-32 lg:pb-6">
      {canEdit && (
        <Button className="w-full" onClick={() => setCreating(true)}>
          <Plus /> Add lodging
        </Button>
      )}
      {lodgings.length === 0 ? (
        <EmptyState
          icon={<Bed />}
          title="No lodging yet"
          description="Add where you're sleeping and it will appear on every day of your itinerary it covers."
        />
      ) : (
        <ul className="space-y-2">
          {lodgings.map((l) => (
            <li key={l.id} className="rounded-3xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold">{l.name}</p>
                  {l.address && (
                    <p className="truncate text-sm text-muted-foreground">{l.address}</p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="font-medium">{formatDateRange(l.checkIn, l.checkOut)}</span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <MoonStar className="size-3.5" /> {l.nights} night{l.nights === 1 ? "" : "s"}
                    </span>
                    {l.price && (
                      <span className="text-muted-foreground">
                        {l.price} {l.currency ?? currency}
                      </span>
                    )}
                  </p>
                  {(l.checkInTime || l.checkOutTime) && (
                    <p className="text-xs text-muted-foreground">
                      {l.checkInTime && `In from ${l.checkInTime.slice(0, 5)}`}
                      {l.checkInTime && l.checkOutTime && " · "}
                      {l.checkOutTime && `Out by ${l.checkOutTime.slice(0, 5)}`}
                    </p>
                  )}
                  {l.confirmationNo && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Confirmation {l.confirmationNo}
                    </p>
                  )}
                  {l.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{l.notes}</p>}
                </div>
                {canEdit && (
                  <Button variant="outline" size="sm" onClick={() => setEditing(l)}>
                    Edit
                  </Button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {l.bookingUrl && (
                  <Button asChild variant="ghost" size="sm">
                    <a href={l.bookingUrl} target="_blank" rel="noreferrer">
                      <ExternalLink /> Booking
                    </a>
                  </Button>
                )}
                <Button asChild variant="ghost" size="sm">
                  <a
                    href={`https://www.google.com/travel/hotels?q=${encodeURIComponent(l.name)}&checkin=${l.checkIn}&checkout=${l.checkOut}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink /> Compare prices
                  </a>
                </Button>
              </div>
              {attachments.filter((a) => a.entityId === l.id).length > 0 && (
                <ul className="mt-2 space-y-1">
                  {attachments
                    .filter((a) => a.entityId === l.id)
                    .map((a) => (
                      <li key={a.id}>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm underline"
                        >
                          {a.filename}
                        </a>
                      </li>
                    ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <>
      <SplitView
        list={listPane}
        map={
          <TripMap
            apiKey={mapsApiKey}
            mapId={mapId}
            markers={markers}
            view={{ bbox: tripBBox }}
            fitKey={`lodging:${markers.length}`}
            className="size-full"
          />
        }
      />
      <LodgingForm
        open={creating || editing !== null}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
        key={editing?.id ?? "new"}
        tripId={tripId}
        currency={currency}
        tripStart={tripStart}
        bbox={tripBBox}
        lodging={editing}
        attachments={attachments.filter((a) => a.entityId === (editing?.id ?? ""))}
        blobEnabled={blobEnabled}
        onDone={refresh}
      />
    </>
  );
}
