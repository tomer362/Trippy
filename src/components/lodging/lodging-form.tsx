"use client";
import { ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { AttachmentUpload } from "@/components/uploads/attachment-upload";
import { addLodging, removeLodging, updateLodging } from "@/server/actions/bookings";
import type { BBox } from "@/server/db/schema/geo";
import type { AttachmentDTO, LodgingDTO } from "@/server/queries/bookings";
import { HotelSearchField } from "./hotel-search-field";

export type LodgingDraft = {
  googlePlaceId?: string;
  name: string;
  address: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  confirmationNo: string;
  price: string;
  bookingUrl: string;
  notes: string;
};

function draftFrom(lodging: LodgingDTO | null, tripStart: string | null): LodgingDraft {
  const today = new Date().toISOString().slice(0, 10);
  const start = tripStart ?? today;
  const next = new Date(`${start}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    name: lodging?.name ?? "",
    address: lodging?.address ?? "",
    checkIn: lodging?.checkIn ?? start,
    checkOut: lodging?.checkOut ?? next.toISOString().slice(0, 10),
    checkInTime: lodging?.checkInTime ?? "",
    checkOutTime: lodging?.checkOutTime ?? "",
    confirmationNo: lodging?.confirmationNo ?? "",
    price: lodging?.price ?? "",
    bookingUrl: lodging?.bookingUrl ?? "",
    notes: lodging?.notes ?? "",
  };
}

export function LodgingForm({
  open,
  onOpenChange,
  tripId,
  currency,
  tripStart,
  bbox,
  lodging,
  attachments,
  blobEnabled,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  currency: string;
  tripStart: string | null;
  bbox: BBox | null;
  lodging: LodgingDTO | null;
  attachments: AttachmentDTO[];
  blobEnabled: boolean;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<LodgingDraft>(() => draftFrom(lodging, tripStart));
  const [pending, start] = useTransition();
  const set = <K extends keyof LodgingDraft>(key: K, value: LodgingDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function save() {
    const payload = {
      tripId,
      googlePlaceId: draft.googlePlaceId,
      name: draft.name.trim(),
      address: draft.address.trim() || null,
      checkIn: draft.checkIn,
      checkOut: draft.checkOut,
      checkInTime: draft.checkInTime || null,
      checkOutTime: draft.checkOutTime || null,
      confirmationNo: draft.confirmationNo.trim() || null,
      price: draft.price.trim() || null,
      currency: draft.price.trim() ? currency : null,
      bookingUrl: draft.bookingUrl.trim() || null,
      notes: draft.notes.trim() || null,
    };
    start(async () => {
      const res = lodging
        ? await updateLodging({ id: lodging.id, ...payload })
        : await addLodging(payload);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(lodging ? "Lodging updated" : "Lodging added");
        onOpenChange(false);
        onDone();
      }
    });
  }

  const bookingSearch = draft.name
    ? `https://www.google.com/travel/hotels?q=${encodeURIComponent(draft.name)}&checkin=${draft.checkIn}&checkout=${draft.checkOut}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogTitle className="mb-4 text-lg font-bold">
          {lodging ? "Edit lodging" : "Add lodging"}
        </DialogTitle>
        <div className="space-y-3">
          <HotelSearchField
            value={draft.name}
            bbox={bbox}
            onTypeName={(name) => setDraft((d) => ({ ...d, name, googlePlaceId: undefined }))}
            onPick={({ googlePlaceId, name, address, sessionToken }) =>
              setDraft((d) => ({ ...d, googlePlaceId, name, address, sessionToken }))
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="check-in">Check-in</Label>
              <Input
                id="check-in"
                type="date"
                value={draft.checkIn}
                onChange={(e) => set("checkIn", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="check-out">Check-out</Label>
              <Input
                id="check-out"
                type="date"
                min={draft.checkIn}
                value={draft.checkOut}
                onChange={(e) => set("checkOut", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="check-in-time">Check-in time</Label>
              <Input
                id="check-in-time"
                type="time"
                value={draft.checkInTime}
                onChange={(e) => set("checkInTime", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="check-out-time">Check-out time</Label>
              <Input
                id="check-out-time"
                type="time"
                value={draft.checkOutTime}
                onChange={(e) => set("checkOutTime", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="confirmation">Confirmation</Label>
              <Input
                id="confirmation"
                value={draft.confirmationNo}
                onChange={(e) => set("confirmationNo", e.target.value)}
                placeholder="Booking code"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lodging-price">Total ({currency})</Label>
              <Input
                id="lodging-price"
                inputMode="decimal"
                value={draft.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="booking-url">Booking link</Label>
            <Input
              id="booking-url"
              type="url"
              value={draft.bookingUrl}
              onChange={(e) => set("bookingUrl", e.target.value)}
              placeholder="https://"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lodging-notes">Notes</Label>
            <Textarea
              id="lodging-notes"
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Door code, breakfast times, how to get there…"
            />
          </div>

          {bookingSearch && (
            <Button asChild variant="ghost" size="sm">
              <a href={bookingSearch} target="_blank" rel="noreferrer">
                <ExternalLink /> Compare prices for these dates
              </a>
            </Button>
          )}

          {lodging && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-sm font-semibold">Attachments</p>
              <AttachmentUpload
                tripId={tripId}
                entityType="lodging"
                entityId={lodging.id}
                attachments={attachments}
                canEdit
                enabled={blobEnabled}
                onChanged={onDone}
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {lodging && (
              <Button
                variant="outline"
                className="text-destructive"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Remove ${lodging.name}?`)) return;
                  start(async () => {
                    const res = await removeLodging({ tripId, id: lodging.id });
                    if (!res.ok) toast.error(res.error);
                    else {
                      onOpenChange(false);
                      onDone();
                    }
                  });
                }}
              >
                Remove
              </Button>
            )}
            <Button className="flex-1" disabled={pending || !draft.name.trim()} onClick={save}>
              {pending ? <Spinner /> : lodging ? "Save changes" : "Add lodging"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Dialog>
  );
}
