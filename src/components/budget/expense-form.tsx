"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { fromCents, toCents } from "@/lib/money";
import { addExpense, removeExpense, updateExpense } from "@/server/actions/budget";
import type { ExpenseDTO } from "@/server/queries/budget";
import type { TripMemberInfo } from "@/server/queries/trips";

export const CATEGORIES = [
  { value: "flights", label: "Flights" },
  { value: "lodging", label: "Lodging" },
  { value: "transport", label: "Transport" },
  { value: "food", label: "Food & drink" },
  { value: "activities", label: "Activities" },
  { value: "shopping", label: "Shopping" },
  { value: "fees", label: "Fees" },
  { value: "other", label: "Other" },
] as const;

const SPLIT_MODES = [
  { value: "equal", label: "Split equally" },
  { value: "shares", label: "By shares" },
  { value: "percent", label: "By percentage" },
  { value: "exact", label: "Exact amounts" },
  { value: "none", label: "Just me" },
] as const;

type SplitMode = (typeof SPLIT_MODES)[number]["value"];

export function ExpenseForm({
  open,
  onOpenChange,
  tripId,
  currency,
  members,
  expense,
  currentUserId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  currency: string;
  members: TripMemberInfo[];
  expense: ExpenseDTO | null;
  currentUserId: string;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(expense?.title ?? "");
  const [amount, setAmount] = useState(expense ? fromCents(expense.amountCents) : "");
  const [expenseCurrency, setExpenseCurrency] = useState(expense?.currency ?? currency);
  const [category, setCategory] = useState<string>(expense?.category ?? "other");
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? currentUserId);
  const [occurredOn, setOccurredOn] = useState(
    expense?.occurredOn ?? new Date().toISOString().slice(0, 10),
  );
  const [splitMode, setSplitMode] = useState<SplitMode>(
    (expense?.splitMode as SplitMode) ?? "equal",
  );
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [involved, setInvolved] = useState<Set<string>>(
    () =>
      new Set(
        expense && expense.shares.length > 0
          ? expense.shares.map((s) => s.userId)
          : members.map((m) => m.userId),
      ),
  );
  const [weights, setWeights] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const m of members) {
      const share = expense?.shares.find((s) => s.userId === m.userId);
      out[m.userId] =
        expense?.splitMode === "exact"
          ? fromCents(share?.amountCents ?? 0)
          : String(share?.weight ?? 1);
    }
    return out;
  });
  const [pending, start] = useTransition();

  const totalCents = toCents(amount);
  const participants = members.filter((m) => involved.has(m.userId));
  const exactSum =
    splitMode === "exact"
      ? participants.reduce((sum, m) => sum + toCents(weights[m.userId] ?? "0"), 0)
      : 0;
  const percentSum =
    splitMode === "percent"
      ? participants.reduce((sum, m) => sum + Number(weights[m.userId] ?? 0), 0)
      : 0;

  const problem =
    splitMode === "exact" && exactSum !== totalCents
      ? `Amounts add up to ${fromCents(exactSum)}, not ${fromCents(totalCents)}`
      : splitMode === "percent" && Math.abs(percentSum - 100) > 0.01
        ? `Percentages add up to ${percentSum}%, not 100%`
        : participants.length === 0 && splitMode !== "none"
          ? "Pick at least one person"
          : null;

  function save() {
    const payload = {
      tripId,
      title: title.trim(),
      amount: fromCents(totalCents),
      currency: expenseCurrency,
      category: category as "other",
      paidBy,
      occurredOn: occurredOn || null,
      splitMode,
      notes: notes.trim() || null,
      participants:
        splitMode === "none"
          ? []
          : participants.map((m) => ({
              userId: m.userId,
              weight:
                splitMode === "shares" || splitMode === "percent"
                  ? Number(weights[m.userId] ?? 1)
                  : undefined,
              exact:
                splitMode === "exact" ? fromCents(toCents(weights[m.userId] ?? "0")) : undefined,
            })),
    };
    start(async () => {
      const res = expense
        ? await updateExpense({ id: expense.id, ...payload })
        : await addExpense(payload);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(expense ? "Expense updated" : "Expense added");
        onOpenChange(false);
        onDone();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogTitle className="mb-4 text-lg font-bold">
          {expense ? "Edit expense" : "Add an expense"}
        </DialogTitle>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="exp-title">What was it?</Label>
            <Input
              id="exp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Dinner at the harbour"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="exp-amount">Amount</Label>
              <Input
                id="exp-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-currency">Currency</Label>
              <Input
                id="exp-currency"
                value={expenseCurrency}
                onChange={(e) => setExpenseCurrency(e.target.value.toUpperCase().slice(0, 3))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="exp-category">Category</Label>
              <select
                id="exp-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-11 w-full rounded-2xl border border-border bg-background px-3"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-date">Date</Label>
              <Input
                id="exp-date"
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="exp-payer">Paid by</Label>
            <select
              id="exp-payer"
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              className="h-11 w-full rounded-2xl border border-border bg-background px-3"
            >
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                  {m.userId === currentUserId ? " (you)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="exp-split">Split</Label>
            <select
              id="exp-split"
              value={splitMode}
              onChange={(e) => setSplitMode(e.target.value as SplitMode)}
              className="h-11 w-full rounded-2xl border border-border bg-background px-3"
            >
              {SPLIT_MODES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {splitMode !== "none" && (
            <ul className="space-y-1 rounded-2xl border border-border p-2">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`inv-${m.userId}`}
                    checked={involved.has(m.userId)}
                    onChange={(e) =>
                      setInvolved((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(m.userId);
                        else next.delete(m.userId);
                        return next;
                      })
                    }
                    className="size-4"
                  />
                  <label htmlFor={`inv-${m.userId}`} className="min-w-0 flex-1 truncate text-sm">
                    {m.name}
                  </label>
                  {involved.has(m.userId) &&
                    (splitMode === "shares" ||
                      splitMode === "percent" ||
                      splitMode === "exact") && (
                      <Input
                        aria-label={`${splitMode === "exact" ? "Amount" : splitMode === "percent" ? "Percent" : "Shares"} for ${m.name}`}
                        inputMode="decimal"
                        value={weights[m.userId] ?? ""}
                        onChange={(e) =>
                          setWeights((prev) => ({ ...prev, [m.userId]: e.target.value }))
                        }
                        className="h-9 w-24 text-right"
                      />
                    )}
                </li>
              ))}
            </ul>
          )}

          {problem && (
            <p className="rounded-2xl bg-amber-100 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {problem}
            </p>
          )}

          <div className="space-y-1">
            <Label htmlFor="exp-notes">Notes</Label>
            <Textarea
              id="exp-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex gap-2 pt-1">
            {expense && (
              <Button
                variant="outline"
                className="text-destructive"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Remove "${expense.title}"?`)) return;
                  start(async () => {
                    const res = await removeExpense({ tripId, id: expense.id });
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
            <Button
              className="flex-1"
              disabled={pending || !title.trim() || totalCents <= 0 || problem !== null}
              onClick={save}
            >
              {pending ? <Spinner /> : expense ? "Save changes" : "Add expense"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Dialog>
  );
}
