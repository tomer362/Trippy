"use client";
import { CalendarDays } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { dayCountBetween } from "@/lib/days";

export type DateRangeValue = { startDate: string | null; endDate: string | null; dayCount: number };

export function DateRangeField({
  value,
  onChange,
  idPrefix = "dates",
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  idPrefix?: string;
}) {
  const dated = Boolean(value.startDate || value.endDate);
  const nights =
    value.startDate && value.endDate && value.endDate >= value.startDate
      ? dayCountBetween(value.startDate, value.endDate)
      : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
        <div>
          <p className="font-semibold">I know my dates</p>
          <p className="text-sm text-muted-foreground">Turn off to plan by number of days.</p>
        </div>
        <Switch
          checked={dated}
          onCheckedChange={(on) =>
            onChange(
              on
                ? {
                    ...value,
                    startDate: value.startDate ?? today(),
                    endDate: value.endDate ?? addDaysISO(today(), value.dayCount - 1),
                  }
                : {
                    startDate: null,
                    endDate: null,
                    dayCount: Math.max(1, nights ?? value.dayCount),
                  },
            )
          }
          aria-label="I know my dates"
        />
      </div>
      {dated ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-start`}>Start</Label>
            <Input
              id={`${idPrefix}-start`}
              type="date"
              value={value.startDate ?? ""}
              onChange={(e) => {
                const startDate = e.target.value || null;
                const endDate =
                  value.endDate && startDate && value.endDate < startDate
                    ? startDate
                    : value.endDate;
                onChange({ ...value, startDate, endDate });
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-end`}>End</Label>
            <Input
              id={`${idPrefix}-end`}
              type="date"
              min={value.startDate ?? undefined}
              value={value.endDate ?? ""}
              onChange={(e) => onChange({ ...value, endDate: e.target.value || null })}
            />
          </div>
          {nights !== null && (
            <p className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" /> {nights} day{nights === 1 ? "" : "s"}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
          <Label htmlFor={`${idPrefix}-count`}>Number of days</Label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="size-9 rounded-full bg-muted font-bold hover:bg-muted/70"
              onClick={() => onChange({ ...value, dayCount: Math.max(1, value.dayCount - 1) })}
              aria-label="Fewer days"
            >
              −
            </button>
            <input
              id={`${idPrefix}-count`}
              type="number"
              min={1}
              max={60}
              value={value.dayCount}
              onChange={(e) =>
                onChange({
                  ...value,
                  dayCount: Math.min(60, Math.max(1, Number(e.target.value) || 1)),
                })
              }
              className="h-9 w-14 rounded-xl border border-border bg-background text-center font-semibold"
            />
            <button
              type="button"
              className="size-9 rounded-full bg-muted font-bold hover:bg-muted/70"
              onClick={() => onChange({ ...value, dayCount: Math.min(60, value.dayCount + 1) })}
              aria-label="More days"
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
