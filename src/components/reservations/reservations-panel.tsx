"use client";
import { Bus, Car, FerrisWheel, Plane, Plus, Ship, Ticket, Train, Utensils } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { AttachmentUpload } from "@/components/uploads/attachment-upload";
import type { AttachmentDTO, ReservationDTO } from "@/server/queries/bookings";
import { ReservationForm } from "./reservation-form";

const KIND_ICON = {
  flight: Plane,
  train: Train,
  bus: Bus,
  ferry: Ship,
  car: Car,
  restaurant: Utensils,
  activity: FerrisWheel,
  other: Ticket,
} as const;

function formatWhen(iso: string | null) {
  if (!iso) return "No date yet";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReservationsPanel({
  tripId,
  currency,
  canEdit,
  reservations,
  attachments,
  blobEnabled,
}: {
  tripId: string;
  currency: string;
  canEdit: boolean;
  reservations: ReservationDTO[];
  attachments: AttachmentDTO[];
  blobEnabled: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [editing, setEditing] = useState<ReservationDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const refresh = useCallback(() => start(() => router.refresh()), [router]);
  const tripDocs = attachments.filter((a) => a.entityType === "trip");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Bookings & documents</h2>
        {canEdit && (
          <Button onClick={() => setCreating(true)}>
            <Plus /> Add booking
          </Button>
        )}
      </div>

      {reservations.length === 0 ? (
        <EmptyState
          icon={<Ticket />}
          title="No bookings yet"
          description="Add flights, trains, cars, restaurants and activities. Paste a confirmation email and we'll fill in what we can read."
        />
      ) : (
        <ul className="space-y-2">
          {reservations.map((r) => {
            const Icon = KIND_ICON[r.kind];
            const docs = attachments.filter((a) => a.entityId === r.id);
            return (
              <li key={r.id} className="rounded-3xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <span className="rounded-2xl bg-primary/10 p-2.5 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{r.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatWhen(r.startAt)}
                      {r.endAt && ` → ${formatWhen(r.endAt)}`}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {r.confirmationNo && <span>Confirmation {r.confirmationNo}</span>}
                      {r.details.number && <span>{String(r.details.number)}</span>}
                      {r.details.partySize && <span>Party of {String(r.details.partySize)}</span>}
                      {r.price && (
                        <span>
                          {r.price} {r.currency ?? currency}
                        </span>
                      )}
                    </p>
                    {r.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{r.notes}</p>}
                    {docs.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {docs.map((a) => (
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
                  </div>
                  {canEdit && (
                    <Button variant="outline" size="sm" onClick={() => setEditing(r)}>
                      Edit
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section className="mt-8">
        <h3 className="mb-2 font-bold">Trip documents</h3>
        <p className="mb-2 text-sm text-muted-foreground">
          Passports, insurance, anything the whole trip needs. Only trip mates can open these.
        </p>
        <AttachmentUpload
          tripId={tripId}
          entityType="trip"
          entityId={tripId}
          attachments={tripDocs}
          canEdit={canEdit}
          enabled={blobEnabled}
          onChanged={refresh}
        />
      </section>

      <ReservationForm
        key={editing?.id ?? "new"}
        open={creating || editing !== null}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
        tripId={tripId}
        currency={currency}
        reservation={editing}
        attachments={attachments.filter((a) => a.entityId === (editing?.id ?? ""))}
        blobEnabled={blobEnabled}
        onDone={refresh}
      />
    </main>
  );
}
