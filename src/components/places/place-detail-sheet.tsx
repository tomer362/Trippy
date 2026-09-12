"use client";
import { useQuery } from "@tanstack/react-query";
import { Clock, ExternalLink, Globe, Phone, Star, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { updateTripPlace } from "@/server/actions/places";
import type { TripPlaceDTO } from "@/server/queries/places";
import { PlacePhoto } from "./place-photo";

type Details = {
  name: string | null;
  address: string | null;
  type: string | null;
  googleMapsUri: string | null;
  website: string | null;
  phone: string | null;
  rating: number | null;
  ratingCount: number | null;
  priceLevel: string | null;
  openNow: boolean | null;
  weekdayHours: string[] | null;
  summary: string | null;
  photos: Array<{ name: string; attribution: string | null }>;
  reviews: Array<{
    rating: number;
    text: string | null;
    author: string | null;
    when: string | null;
  }>;
};

export function PlaceDetailSheet({
  place,
  tripId,
  currency,
  canEdit,
  onOpenChange,
}: {
  place: TripPlaceDTO | null;
  tripId: string;
  currency: string;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const open = Boolean(place);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {place && (
        <PlaceDetailBody
          key={place.id}
          place={place}
          tripId={tripId}
          currency={currency}
          canEdit={canEdit}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function PlaceDetailBody({
  place,
  tripId,
  currency,
  canEdit,
  onClose,
}: {
  place: TripPlaceDTO;
  tripId: string;
  currency: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(place.notes ?? "");
  const [cost, setCost] = useState(place.cost ?? "");
  const [visited, setVisited] = useState(place.visited);
  const [showHours, setShowHours] = useState(false);
  const [pending, start] = useTransition();

  const details = useQuery({
    queryKey: ["place-details", place.googlePlaceId],
    queryFn: async (): Promise<Details | null> => {
      const res = await fetch(`/api/places/details?placeId=${place.googlePlaceId}&rich=1`);
      if (!res.ok) return null;
      return (await res.json()) as Details;
    },
    enabled: Boolean(place.googlePlaceId),
    staleTime: 120_000,
  });

  const d = details.data;

  function save() {
    start(async () => {
      const res = await updateTripPlace({
        tripId,
        id: place.id,
        notes: notes.trim() || null,
        cost: cost.trim() || null,
        currency: cost.trim() ? currency : null,
        visited,
      });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Saved");
        onClose();
      }
    });
  }

  return (
    <SheetContent side="bottom" className="max-h-[92dvh] sm:max-w-lg">
      <DialogTitle className="sr-only">{place.name}</DialogTitle>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-xl font-bold">{place.name}</h3>
          <p className="truncate text-sm text-muted-foreground">
            {d?.type ?? place.primaryType?.replace(/_/g, " ") ?? place.address}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 hover:bg-muted"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
      </div>

      {details.isLoading && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}

      {d && d.photos.length > 0 && (
        <div className="scrollbar-none -mx-1 mb-3 flex gap-2 overflow-x-auto px-1">
          {d.photos.slice(0, 6).map((p) => (
            <PlacePhoto
              key={p.name}
              name={p.name}
              alt=""
              className="h-32 w-44 shrink-0 rounded-2xl"
              width={420}
            />
          ))}
        </div>
      )}

      {d && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {d.rating && (
            <span className="inline-flex items-center gap-1 font-semibold">
              <Star className="size-4 fill-amber-400 text-amber-400" />
              {d.rating.toFixed(1)}
              <span className="font-normal text-muted-foreground">({d.ratingCount})</span>
            </span>
          )}
          {d.priceLevel && <span className="text-muted-foreground">{d.priceLevel}</span>}
          {d.openNow !== null && (
            <span className={d.openNow ? "font-semibold text-emerald-600" : "text-destructive"}>
              {d.openNow ? "Open now" : "Closed"}
            </span>
          )}
        </div>
      )}

      {d?.summary && <p className="mb-3 text-sm text-muted-foreground">{d.summary}</p>}
      {place.address && <p className="mb-3 text-sm">{place.address}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        {(d?.googleMapsUri ?? place.googleMapsUri) && (
          <Button asChild variant="outline" size="sm">
            <a href={d?.googleMapsUri ?? place.googleMapsUri!} target="_blank" rel="noreferrer">
              <ExternalLink /> Google Maps
            </a>
          </Button>
        )}
        {(d?.website ?? place.website) && (
          <Button asChild variant="outline" size="sm">
            <a href={d?.website ?? place.website!} target="_blank" rel="noreferrer">
              <Globe /> Website
            </a>
          </Button>
        )}
        {(d?.phone ?? place.phone) && (
          <Button asChild variant="outline" size="sm">
            <a href={`tel:${d?.phone ?? place.phone}`}>
              <Phone /> Call
            </a>
          </Button>
        )}
        {d?.weekdayHours && (
          <Button variant="outline" size="sm" onClick={() => setShowHours((s) => !s)}>
            <Clock /> Hours
          </Button>
        )}
      </div>

      {showHours && d?.weekdayHours && (
        <ul className="mb-4 rounded-2xl bg-muted p-3 text-sm">
          {d.weekdayHours.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="place-notes">Your notes</Label>
            <Textarea
              id="place-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Booking reference, what to order, why you saved it…"
            />
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="place-cost">Cost ({currency})</Label>
              <Input
                id="place-cost"
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <label className="flex h-11 items-center gap-2 rounded-2xl border border-border px-3">
              <input
                type="checkbox"
                checked={visited}
                onChange={(e) => setVisited(e.target.checked)}
                className="size-4"
              />
              <span className="font-medium">Visited</span>
            </label>
          </div>
          <Button className="w-full" disabled={pending} onClick={save}>
            {pending ? <Spinner /> : "Save"}
          </Button>
        </div>
      ) : (
        place.notes && <p className="rounded-2xl bg-muted p-3 text-sm">{place.notes}</p>
      )}

      {d && d.reviews.length > 0 && (
        <div className="mt-5 space-y-3">
          <p className="font-semibold">Recent reviews</p>
          {d.reviews.map((r, i) => (
            <div key={i} className="rounded-2xl border border-border p-3 text-sm">
              <p className="mb-1 flex items-center gap-2 font-semibold">
                <Star className="size-3.5 fill-amber-400 text-amber-400" />
                {r.rating} <span className="font-normal text-muted-foreground">{r.author}</span>
                <span className="ml-auto text-xs font-normal text-muted-foreground">{r.when}</span>
              </p>
              <p className="line-clamp-4 text-muted-foreground">{r.text}</p>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Ratings, hours and reviews come from Google and are shown live.
          </p>
        </div>
      )}
    </SheetContent>
  );
}
