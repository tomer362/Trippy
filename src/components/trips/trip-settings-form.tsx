"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DestinationPicker } from "@/components/destinations/destination-picker";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import type { DestinationDTO, TravelMode, TripKind, TripVisibility } from "@/lib/types";
import {
  archiveTrip,
  deleteTrip,
  setTripDestinations,
  updateTrip,
  updateTripDates,
} from "@/server/actions/trips";
import type { InviteDTO } from "@/server/queries/social";
import type { TripMemberInfo } from "@/server/queries/trips";
import { DateRangeField, type DateRangeValue } from "./date-range-field";
import { MembersPanel } from "./members-panel";

const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "ILS",
  "JPY",
  "AUD",
  "CAD",
  "CHF",
  "THB",
  "MXN",
  "INR",
  "BRL",
  "NZD",
  "SGD",
  "AED",
  "TRY",
];

const VISIBILITY: Array<{ value: TripVisibility; label: string; text: string }> = [
  { value: "private", label: "Private", text: "Only trip mates can see it." },
  {
    value: "link",
    label: "Anyone with the link",
    text: "People with the link can view, not edit.",
  },
  { value: "friends", label: "Friends", text: "Friends of any trip mate can view." },
  { value: "public", label: "Public", text: "Listed on your profile and destination pages." },
];

export function TripSettingsForm({
  trip,
  destinations: initialDestinations,
  members,
  invites,
  canManage,
  currentUserId,
  emailEnabled,
}: {
  trip: {
    id: string;
    name: string;
    description: string | null;
    kind: TripKind;
    visibility: TripVisibility;
    currency: string;
    defaultTravelMode: TravelMode;
    startDate: string | null;
    endDate: string | null;
    dayCount: number;
    archived: boolean;
  };
  destinations: DestinationDTO[];
  members: TripMemberInfo[];
  invites: InviteDTO[];
  canManage: boolean;
  currentUserId: string;
  emailEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(trip.name);
  const [description, setDescription] = useState(trip.description ?? "");
  const [currency, setCurrency] = useState(trip.currency);
  const [mode, setMode] = useState<TravelMode>(trip.defaultTravelMode);
  const [visibility, setVisibility] = useState<TripVisibility>(trip.visibility);
  const [kind, setKind] = useState<TripKind>(trip.kind);
  const [dates, setDates] = useState<DateRangeValue>({
    startDate: trip.startDate,
    endDate: trip.endDate,
    dayCount: trip.dayCount,
  });
  const [destinations, setDestinations] = useState(initialDestinations);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Failed");
      else {
        toast.success(success);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h3 className="font-bold">Basics</h3>
        <div className="space-y-1">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this trip about?"
            maxLength={2000}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="currency">Currency</Label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-11 w-full rounded-2xl border border-border bg-background px-3"
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="mode">Default travel mode</Label>
            <select
              id="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as TravelMode)}
              className="h-11 w-full rounded-2xl border border-border bg-background px-3"
            >
              <option value="drive">Driving</option>
              <option value="walk">Walking</option>
              <option value="transit">Public transit</option>
              <option value="bicycle">Cycling</option>
            </select>
          </div>
        </div>
        <Button
          disabled={pending}
          onClick={() =>
            run(
              () =>
                updateTrip({
                  tripId: trip.id,
                  name: name.trim(),
                  description: description.trim() || null,
                  currency,
                  defaultTravelMode: mode,
                }),
              "Saved",
            )
          }
        >
          Save basics
        </Button>
      </section>

      <section className="space-y-4">
        <h3 className="font-bold">Dates</h3>
        <DateRangeField value={dates} onChange={setDates} idPrefix="settings" />
        <p className="text-sm text-muted-foreground">
          Changing dates keeps every day's plan in place; only the calendar dates shift. Removed
          days move their places to an “Unscheduled” list.
        </p>
        <Button
          disabled={pending}
          onClick={() => run(() => updateTripDates({ tripId: trip.id, ...dates }), "Dates updated")}
        >
          Save dates
        </Button>
      </section>

      <section className="space-y-4">
        <h3 className="font-bold">Destinations</h3>
        <DestinationPicker value={destinations} onChange={setDestinations} />
        <Button
          disabled={pending || destinations.length === 0}
          onClick={() =>
            run(
              () =>
                setTripDestinations({
                  tripId: trip.id,
                  destinationIds: destinations.map((d) => d.id!).filter(Boolean),
                }),
              "Destinations updated",
            )
          }
        >
          Save destinations
        </Button>
      </section>

      <MembersPanel
        tripId={trip.id}
        tripName={trip.name}
        members={members}
        invites={invites}
        canManage={canManage}
        canEdit
        currentUserId={currentUserId}
        emailEnabled={emailEnabled}
      />

      {canManage && (
        <section className="space-y-4">
          <h3 className="font-bold">Visibility & type</h3>
          <div className="grid gap-2">
            {VISIBILITY.map((v) => (
              <label
                key={v.value}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 ${visibility === v.value ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <input
                  type="radio"
                  name="visibility"
                  className="mt-1"
                  checked={visibility === v.value}
                  onChange={() => setVisibility(v.value)}
                />
                <span>
                  <span className="block font-semibold">{v.label}</span>
                  <span className="block text-sm text-muted-foreground">{v.text}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="kind">Document type</Label>
            <select
              id="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as TripKind)}
              className="h-11 w-full rounded-2xl border border-border bg-background px-3"
            >
              <option value="plan">Trip plan</option>
              <option value="guide">Travel guide</option>
              <option value="journal">Trip journal</option>
            </select>
          </div>
          <Button
            disabled={pending}
            onClick={() => run(() => updateTrip({ tripId: trip.id, visibility, kind }), "Saved")}
          >
            Save visibility
          </Button>
        </section>
      )}

      {canManage && (
        <section className="space-y-3 rounded-3xl border border-destructive/30 p-4">
          <h3 className="font-bold text-destructive">Danger zone</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(
                  () => archiveTrip({ tripId: trip.id, archived: !trip.archived }),
                  trip.archived ? "Trip restored" : "Trip archived",
                )
              }
            >
              {trip.archived ? "Unarchive trip" : "Archive trip"}
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Delete “${trip.name}” for everyone? This cannot be undone.`)) return;
                start(async () => {
                  const res = await deleteTrip({ tripId: trip.id });
                  if (!res.ok) toast.error(res.error);
                  else router.push("/trips");
                });
              }}
            >
              Delete trip
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
