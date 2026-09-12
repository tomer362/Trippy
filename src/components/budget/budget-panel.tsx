"use client";
import { ArrowRight, Download, Plus, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { formatDayLabel } from "@/lib/days";
import { formatMoney, fromCents } from "@/lib/money";
import { totalsBy } from "@/lib/split";
import { recordSettlement, setBudget } from "@/server/actions/budget";
import type { BudgetData, ExpenseDTO } from "@/server/queries/budget";
import type { TripMemberInfo } from "@/server/queries/trips";
import { CATEGORIES, ExpenseForm } from "./expense-form";
import { BudgetMeter, CategoryBars, DayColumns, PersonTotals } from "./spend-charts";

const CATEGORY_LABEL = new Map(CATEGORIES.map((c) => [c.value as string, c.label]));

export function BudgetPanel({
  tripId,
  canEdit,
  currentUserId,
  members,
  days,
  data,
}: {
  tripId: string;
  canEdit: boolean;
  currentUserId: string;
  members: TripMemberInfo[];
  days: Array<{ dayIndex: number; date: string | null }>;
  data: BudgetData;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [editing, setEditing] = useState<ExpenseDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [groupBudget, setGroupBudget] = useState(
    data.groupBudgetCents !== null ? fromCents(data.groupBudgetCents) : "",
  );
  const refresh = useCallback(() => start(() => router.refresh()), [router]);

  const categorySlices = useMemo(
    () =>
      totalsBy(
        data.expenses.filter((e) => e.tripAmountCents !== null),
        (e) => e.category,
        (e) => e.tripAmountCents ?? 0,
      ).map((t) => ({ key: t.key, label: CATEGORY_LABEL.get(t.key) ?? t.key, cents: t.cents })),
    [data.expenses],
  );

  const daySlices = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const e of data.expenses) {
      if (!e.occurredOn || e.tripAmountCents === null) continue;
      byDate.set(e.occurredOn, (byDate.get(e.occurredOn) ?? 0) + e.tripAmountCents);
    }
    const dated = days.filter((d) => d.date);
    const source = dated.length > 0 ? dated.map((d) => d.date!) : [...byDate.keys()].sort();
    return source.map((date) => ({
      key: date,
      label: formatDayLabel({ dayIndex: 0, date }),
      cents: byDate.get(date) ?? 0,
    }));
  }, [data.expenses, days]);

  const personTotals = useMemo(() => {
    const byPayer = new Map<string, number>();
    for (const e of data.expenses) {
      if (!e.paidBy || e.tripAmountCents === null) continue;
      byPayer.set(e.paidBy, (byPayer.get(e.paidBy) ?? 0) + e.tripAmountCents);
    }
    return members
      .map((m) => ({
        userId: m.userId,
        name: m.userId === currentUserId ? "You" : m.name,
        cents: byPayer.get(m.userId) ?? 0,
      }))
      .filter((p) => p.cents > 0);
  }, [data.expenses, members, currentUserId]);

  const myShare = useMemo(() => {
    let cents = 0;
    for (const e of data.expenses) {
      const share = e.shares.find((s) => s.userId === currentUserId);
      if (!share) continue;
      const factor =
        e.amountCents === 0 || e.tripAmountCents === null ? 1 : e.tripAmountCents / e.amountCents;
      cents += Math.round(share.amountCents * factor);
    }
    return cents;
  }, [data.expenses, currentUserId]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Budget</h2>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/trips/${tripId}/export/expenses`} download>
              <Download /> CSV
            </a>
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> Add expense
            </Button>
          )}
        </div>
      </div>

      {data.unconvertedCurrencies.length > 0 && (
        <p className="mb-3 rounded-2xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          No exchange rate yet for {data.unconvertedCurrencies.join(", ")}, so those expenses are
          left out of the totals.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <BudgetMeter
          spentCents={data.totalCents}
          budgetCents={data.groupBudgetCents}
          currency={data.currency}
          label="Trip spend"
        />
        <BudgetMeter
          spentCents={myShare}
          budgetCents={data.personalBudgetCents}
          currency={data.currency}
          label="Your share"
        />
      </div>

      {canEdit && (
        <div className="mt-3 flex items-end gap-2 rounded-3xl border border-border bg-card p-4">
          <div className="flex-1 space-y-1">
            <Label htmlFor="group-budget">Trip budget ({data.currency})</Label>
            <Input
              id="group-budget"
              inputMode="decimal"
              value={groupBudget}
              onChange={(e) => setGroupBudget(e.target.value)}
              placeholder="No budget set"
            />
          </div>
          <Button
            variant="outline"
            onClick={() =>
              start(async () => {
                const res = await setBudget({
                  tripId,
                  amount: groupBudget.trim() || null,
                  currency: data.currency,
                  personal: false,
                });
                if (!res.ok) toast.error(res.error);
                else {
                  toast.success("Budget saved");
                  refresh();
                }
              })
            }
          >
            Save
          </Button>
        </div>
      )}

      {data.expenses.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Wallet />}
          title="No expenses yet"
          description="Log what you spend and Trippy works out who owes whom."
          action={
            canEdit ? (
              <Button onClick={() => setCreating(true)}>Add the first expense</Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="mt-6 grid gap-3">
            <CategoryBars
              slices={categorySlices}
              currency={data.currency}
              title="Spend by category"
            />
            <DayColumns slices={daySlices} currency={data.currency} title="Spend by day" />
          </div>

          <section className="mt-6">
            <h3 className="mb-2 font-bold">Who paid</h3>
            <PersonTotals people={personTotals} currency={data.currency} />
          </section>

          <section className="mt-6">
            <h3 className="mb-2 font-bold">Who owes whom</h3>
            {data.transfers.length === 0 ? (
              <p className="rounded-3xl border border-border bg-card p-4 text-sm text-muted-foreground">
                Everyone is square.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.transfers.map((t) => (
                  <li
                    key={`${t.fromUserId}-${t.toUserId}`}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-semibold">
                        {t.fromUserId === currentUserId ? "You" : t.fromName}
                      </span>
                      <ArrowRight className="mx-1.5 inline size-3.5 text-muted-foreground" />
                      <span className="font-semibold">
                        {t.toUserId === currentUserId ? "you" : t.toName}
                      </span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">
                      {formatMoney(t.amountCents, data.currency)}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        start(async () => {
                          const res = await recordSettlement({
                            tripId,
                            fromUserId: t.fromUserId,
                            toUserId: t.toUserId,
                            amount: fromCents(t.amountCents),
                            currency: data.currency,
                            note: "Settled up",
                          });
                          if (!res.ok) toast.error(res.error);
                          else {
                            toast.success("Marked as settled");
                            refresh();
                          }
                        })
                      }
                    >
                      Settle
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6">
            <h3 className="mb-2 font-bold">Expenses</h3>
            <ul className="divide-y divide-border rounded-3xl border border-border">
              {data.expenses.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setEditing(e)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left enabled:hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{e.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {CATEGORY_LABEL.get(e.category) ?? e.category}
                        {e.paidByName &&
                          ` · ${e.paidBy === currentUserId ? "you" : e.paidByName} paid`}
                        {e.occurredOn && ` · ${e.occurredOn}`}
                        {e.splitMode === "none" && " · personal"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-bold tabular-nums">
                        {formatMoney(e.amountCents, e.currency)}
                      </span>
                      {e.currency !== data.currency && e.tripAmountCents !== null && (
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          ≈ {formatMoney(e.tripAmountCents, data.currency)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {data.settlements.length > 0 && (
            <section className="mt-6">
              <h3 className="mb-2 font-bold">Payments</h3>
              <ul className="divide-y divide-border rounded-3xl border border-border text-sm">
                {data.settlements.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar name={s.fromName ?? "Trip mate"} size={24} />
                    <span className="min-w-0 flex-1 truncate">
                      {s.fromName ?? "Trip mate"} paid {s.toName ?? "trip mate"}
                      <span className="block text-xs text-muted-foreground">
                        {new Date(s.settledAt).toLocaleDateString()}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatMoney(s.amountCents, s.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <ExpenseForm
        key={editing?.id ?? "new"}
        open={creating || editing !== null}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
        tripId={tripId}
        currency={data.currency}
        members={members}
        expense={editing}
        currentUserId={currentUserId}
        onDone={refresh}
      />
    </main>
  );
}
