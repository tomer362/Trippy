"use client";
import { ClipboardPaste, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { AttachmentUpload } from "@/components/uploads/attachment-upload";
import { parseConfirmation } from "@/lib/parse-confirmation";
import { addReservation, removeReservation, updateReservation } from "@/server/actions/bookings";
import type { AttachmentDTO, ReservationDTO } from "@/server/queries/bookings";

const KINDS = [
  { value: "flight", label: "Flight" },
  { value: "train", label: "Train" },
  { value: "bus", label: "Bus" },
  { value: "ferry", label: "Ferry" },
  { value: "car", label: "Car rental" },
  { value: "restaurant", label: "Restaurant" },
  { value: "activity", label: "Activity" },
  { value: "other", label: "Other" },
] as const;

type Kind = (typeof KINDS)[number]["value"];

type Draft = {
  kind: Kind;
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  confirmationNo: string;
  price: string;
  notes: string;
  carrier: string;
  number: string;
  fromCode: string;
  toCode: string;
  partySize: string;
};

function toLocalIso(date: string, time: string): string | null {
  if (!date) return null;
  const t = time || "00:00";
  const local = new Date(`${date}T${t}:00`);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

function draftFrom(reservation: ReservationDTO | null): Draft {
  const split = (iso: string | null) => {
    if (!iso) return { date: "", time: "" };
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  };
  const s = split(reservation?.startAt ?? null);
  const e = split(reservation?.endAt ?? null);
  return {
    kind: reservation?.kind ?? "flight",
    title: reservation?.title ?? "",
    startDate: s.date,
    startTime: s.time,
    endDate: e.date,
    endTime: e.time,
    confirmationNo: reservation?.confirmationNo ?? "",
    price: reservation?.price ?? "",
    notes: reservation?.notes ?? "",
    carrier: String(reservation?.details.carrier ?? ""),
    number: String(reservation?.details.number ?? ""),
    fromCode: String(reservation?.details.fromCode ?? ""),
    toCode: String(reservation?.details.toCode ?? ""),
    partySize: reservation?.details.partySize ? String(reservation.details.partySize) : "",
  };
}

export function ReservationForm({
  open,
  onOpenChange,
  tripId,
  currency,
  reservation,
  attachments,
  blobEnabled,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  currency: string;
  reservation: ReservationDTO | null;
  attachments: AttachmentDTO[];
  blobEnabled: boolean;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(reservation));
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const isTransport = ["flight", "train", "bus", "ferry"].includes(draft.kind);

  function applyParsed() {
    const parsed = parseConfirmation(pasted);
    setDraft((d) => ({
      ...d,
      kind: parsed.kind,
      title: parsed.title || d.title,
      startDate: parsed.startDate ?? d.startDate,
      startTime: parsed.startTime ?? d.startTime,
      endDate: parsed.endDate ?? d.endDate,
      endTime: parsed.endTime ?? d.endTime,
      confirmationNo: parsed.confirmationNo ?? d.confirmationNo,
      price: parsed.price ?? d.price,
      carrier: parsed.details.carrier ?? d.carrier,
      number: parsed.details.number ?? d.number,
      fromCode: parsed.details.fromCode ?? d.fromCode,
      toCode: parsed.details.toCode ?? d.toCode,
      partySize: parsed.details.partySize ? String(parsed.details.partySize) : d.partySize,
    }));
    setWarnings(parsed.warnings);
    setPasting(false);
    toast.success("Filled in what we could read. Check the details before saving.");
  }

  function save() {
    const payload = {
      tripId,
      kind: draft.kind,
      title: draft.title.trim(),
      startAt: toLocalIso(draft.startDate, draft.startTime),
      endAt: toLocalIso(draft.endDate, draft.endTime),
      confirmationNo: draft.confirmationNo.trim() || null,
      price: draft.price.trim() || null,
      currency: draft.price.trim() ? currency : null,
      notes: draft.notes.trim() || null,
      details: {
        ...(draft.carrier ? { carrier: draft.carrier } : {}),
        ...(draft.number ? { number: draft.number } : {}),
        ...(draft.fromCode ? { fromCode: draft.fromCode } : {}),
        ...(draft.toCode ? { toCode: draft.toCode } : {}),
        ...(draft.partySize ? { partySize: Number(draft.partySize) } : {}),
      },
    };
    start(async () => {
      const res = reservation
        ? await updateReservation({ id: reservation.id, ...payload })
        : await addReservation(payload);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(reservation ? "Booking updated" : "Booking added");
        onOpenChange(false);
        onDone();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogTitle className="mb-4 text-lg font-bold">
          {reservation ? "Edit booking" : "Add a booking"}
        </DialogTitle>

        {pasting ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paste a confirmation email. We read the dates, times, codes and prices we recognise,
              and you correct the rest.
            </p>
            <Textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={8}
              placeholder="Paste the confirmation text here"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPasting(false)}>
                Cancel
              </Button>
              <Button className="flex-1" disabled={!pasted.trim()} onClick={applyParsed}>
                <Sparkles /> Read it
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {!reservation && (
              <Button variant="outline" className="w-full" onClick={() => setPasting(true)}>
                <ClipboardPaste /> Paste a confirmation
              </Button>
            )}
            {warnings.length > 0 && (
              <ul className="rounded-2xl bg-amber-100 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="res-kind">Type</Label>
                <select
                  id="res-kind"
                  value={draft.kind}
                  onChange={(e) => set("kind", e.target.value as Kind)}
                  className="h-11 w-full rounded-2xl border border-border bg-background px-3"
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="res-confirmation">Confirmation</Label>
                <Input
                  id="res-confirmation"
                  value={draft.confirmationNo}
                  onChange={(e) => set("confirmationNo", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="res-title">Title</Label>
              <Input
                id="res-title"
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Flight LH1425 FRA → NCE"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="res-start-date">Starts</Label>
                <Input
                  id="res-start-date"
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="res-start-time">At</Label>
                <Input
                  id="res-start-time"
                  type="time"
                  value={draft.startTime}
                  onChange={(e) => set("startTime", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="res-end-date">Ends</Label>
                <Input
                  id="res-end-date"
                  type="date"
                  value={draft.endDate}
                  onChange={(e) => set("endDate", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="res-end-time">At</Label>
                <Input
                  id="res-end-time"
                  type="time"
                  value={draft.endTime}
                  onChange={(e) => set("endTime", e.target.value)}
                />
              </div>
            </div>
            {isTransport && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="res-number">Service number</Label>
                  <Input
                    id="res-number"
                    value={draft.number}
                    onChange={(e) => set("number", e.target.value)}
                    placeholder="LH1425"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="res-carrier">Operator</Label>
                  <Input
                    id="res-carrier"
                    value={draft.carrier}
                    onChange={(e) => set("carrier", e.target.value)}
                    placeholder="Lufthansa"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="res-from">From</Label>
                  <Input
                    id="res-from"
                    value={draft.fromCode}
                    onChange={(e) => set("fromCode", e.target.value.toUpperCase())}
                    placeholder="FRA"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="res-to">To</Label>
                  <Input
                    id="res-to"
                    value={draft.toCode}
                    onChange={(e) => set("toCode", e.target.value.toUpperCase())}
                    placeholder="NCE"
                  />
                </div>
              </div>
            )}
            {draft.kind === "restaurant" && (
              <div className="space-y-1">
                <Label htmlFor="res-party">Party size</Label>
                <Input
                  id="res-party"
                  inputMode="numeric"
                  value={draft.partySize}
                  onChange={(e) => set("partySize", e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="res-price">Price ({currency})</Label>
              <Input
                id="res-price"
                inputMode="decimal"
                value={draft.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="res-notes">Notes</Label>
              <Textarea
                id="res-notes"
                value={draft.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>

            {reservation && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-sm font-semibold">Tickets and documents</p>
                <AttachmentUpload
                  tripId={tripId}
                  entityType="reservation"
                  entityId={reservation.id}
                  attachments={attachments}
                  canEdit
                  enabled={blobEnabled}
                  onChanged={onDone}
                />
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {reservation && (
                <Button
                  variant="outline"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Remove ${reservation.title}?`)) return;
                    start(async () => {
                      const res = await removeReservation({ tripId, id: reservation.id });
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
              <Button className="flex-1" disabled={pending || !draft.title.trim()} onClick={save}>
                {pending ? <Spinner /> : reservation ? "Save changes" : "Add booking"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Dialog>
  );
}
