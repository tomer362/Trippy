"use client";
import { ArrowLeft, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { DestinationPicker } from "@/components/destinations/destination-picker";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import type { DestinationDTO, TripKind } from "@/lib/types";
import { createTrip } from "@/server/actions/trips";
import { DateRangeField, type DateRangeValue } from "./date-range-field";

type Step = "kind" | "destinations" | "dates" | "name";
const STEPS: Step[] = ["kind", "destinations", "dates", "name"];

const KINDS: Array<{ kind: TripKind; emoji: string; title: string; text: string }> = [
  {
    kind: "plan",
    emoji: "🧳",
    title: "Plan your trip",
    text: "Choose places and build itineraries",
  },
  {
    kind: "guide",
    emoji: "🧭",
    title: "Write a travel guide",
    text: "Share tips and inspire others",
  },
  {
    kind: "journal",
    emoji: "📔",
    title: "Start a trip journal",
    text: "Save memories, notes, and photos",
  },
];

type Draft = {
  kind: TripKind | null;
  destinations: DestinationDTO[];
  dates: DateRangeValue;
  name: string;
};
const EMPTY: Draft = {
  kind: null,
  destinations: [],
  dates: { startDate: null, endDate: null, dayCount: 3 },
  name: "",
};
const KEY = "trippy:new-trip";

function suggestName(destinations: DestinationDTO[]) {
  if (destinations.length === 0) return "";
  const names = destinations.map((d) => d.name);
  if (names.length === 1) return `Trip to ${names[0]}`;
  if (names.length === 2) return `Trip to ${names[0]} and ${names[1]}`;
  return `Trip to ${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function NewTripWizard({
  initialKind,
  initialDestination,
}: {
  initialKind?: TripKind;
  initialDestination?: DestinationDTO | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => ({
    ...EMPTY,
    kind: initialKind ?? null,
    destinations: initialDestination ? [initialDestination] : [],
  }));
  const [step, setStep] = useState<Step>(
    initialKind || initialDestination ? "destinations" : "kind",
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { draft: Draft; step: Step };
        setDraft(saved.draft);
        setStep(saved.step);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ draft, step }));
    } catch {}
  }, [draft, step]);

  const index = STEPS.indexOf(step);
  const progress = ((index + 1) / STEPS.length) * 100;

  function next() {
    const n = STEPS[index + 1];
    if (n === "name" && !draft.name) setDraft((d) => ({ ...d, name: suggestName(d.destinations) }));
    if (n) setStep(n);
  }
  function back() {
    const p = STEPS[index - 1];
    if (p) setStep(p);
    else router.push("/trips");
  }

  function submit() {
    startTransition(async () => {
      const res = await createTrip({
        kind: draft.kind ?? "plan",
        name: draft.name.trim() || suggestName(draft.destinations),
        destinationIds: draft.destinations.map((d) => d.id).filter((x): x is string => Boolean(x)),
        startDate: draft.dates.startDate,
        endDate: draft.dates.endDate,
        dayCount: draft.dates.dayCount,
        currency: "USD",
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      try {
        sessionStorage.removeItem(KEY);
      } catch {}
      router.push(`/t/${res.data.id}`);
    });
  }

  const canContinue =
    step === "destinations"
      ? draft.destinations.length > 0
      : step === "dates"
        ? true
        : step === "name"
          ? draft.name.trim().length > 0
          : false;

  return (
    <div className="sunset-bg flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 pb-32 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="mb-8 flex items-center gap-4">
          {step === "kind" ? (
            <Link
              href="/trips"
              className="rounded-full bg-white/80 p-3 shadow-sm dark:bg-white/10"
              aria-label="Close"
            >
              <X className="size-5" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={back}
              className="rounded-full bg-white/80 p-3 shadow-sm dark:bg-white/10"
              aria-label="Back"
            >
              <ArrowLeft className="size-5" />
            </button>
          )}
          {step !== "kind" && (
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/60 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-foreground transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {step === "kind" && (
          <div className="my-auto space-y-4">
            {KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                onClick={() => {
                  setDraft((d) => ({ ...d, kind: k.kind }));
                  setStep("destinations");
                }}
                className="flex w-full items-center gap-5 rounded-[2rem] border border-white/70 bg-white/60 p-6 text-left shadow-sm backdrop-blur transition hover:bg-white/80 dark:border-white/10 dark:bg-white/5"
              >
                <span className="text-5xl">{k.emoji}</span>
                <span>
                  <span className="block text-2xl font-extrabold tracking-tight">{k.title}</span>
                  <span className="block text-muted-foreground">{k.text}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {step === "destinations" && (
          <section className="space-y-6">
            <h1 className="text-4xl font-extrabold tracking-tight">Where are you going?</h1>
            <DestinationPicker
              value={draft.destinations}
              onChange={(destinations) => setDraft((d) => ({ ...d, destinations }))}
            />
          </section>
        )}

        {step === "dates" && (
          <section className="space-y-6">
            <h1 className="text-4xl font-extrabold tracking-tight">When are you going?</h1>
            <DateRangeField
              value={draft.dates}
              onChange={(dates) => setDraft((d) => ({ ...d, dates }))}
            />
          </section>
        )}

        {step === "name" && (
          <section className="space-y-6">
            <h1 className="text-4xl font-extrabold tracking-tight">Name your trip</h1>
            <div className="space-y-1">
              <Label htmlFor="trip-name">Trip name</Label>
              <Input
                id="trip-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder={suggestName(draft.destinations)}
                maxLength={120}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {draft.destinations.map((d) => d.name).join(" · ")} ·{" "}
              {draft.dates.startDate && draft.dates.endDate
                ? `${draft.dates.startDate} → ${draft.dates.endDate}`
                : `${draft.dates.dayCount} days`}
            </p>
          </section>
        )}
      </div>

      {step !== "kind" && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border/50 bg-background/90 p-4 backdrop-blur safe-pb">
          <div className="mx-auto max-w-2xl">
            <Button
              size="lg"
              className="w-full"
              disabled={!canContinue || pending}
              onClick={step === "name" ? submit : next}
            >
              {pending ? <Spinner /> : step === "name" ? "Create trip" : "Continue"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
