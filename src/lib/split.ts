import { allocate } from "./money";

export type SplitMode = "equal" | "exact" | "shares" | "percent" | "none";

export type Participant = {
  userId: string;
  /** Used by the shares and percent modes. */
  weight?: number;
  /** Used by the exact mode, in minor units. */
  exactCents?: number;
};

export type Share = { userId: string; amountCents: number };

export class SplitError extends Error {}

/**
 * Works out who owes what for one expense.
 *
 * - `equal` divides evenly, giving away leftover cents deterministically
 * - `shares` divides in proportion to weights (2 shares vs 1 share)
 * - `percent` treats weights as percentages and must add up to 100
 * - `exact` uses the amounts given and must add up to the total
 * - `none` is a personal expense: the payer carries all of it
 */
export function computeShares(
  totalCents: number,
  mode: SplitMode,
  participants: Participant[],
  payerId: string | null,
): Share[] {
  if (mode === "none") return payerId ? [{ userId: payerId, amountCents: totalCents }] : [];
  if (participants.length === 0) {
    if (!payerId) return [];
    return [{ userId: payerId, amountCents: totalCents }];
  }

  switch (mode) {
    case "equal": {
      const parts = allocate(
        totalCents,
        participants.map(() => 1),
      );
      return participants.map((p, i) => ({ userId: p.userId, amountCents: parts[i] ?? 0 }));
    }
    case "shares": {
      const parts = allocate(
        totalCents,
        participants.map((p) => p.weight ?? 1),
      );
      return participants.map((p, i) => ({ userId: p.userId, amountCents: parts[i] ?? 0 }));
    }
    case "percent": {
      const sum = participants.reduce((a, p) => a + (p.weight ?? 0), 0);
      if (Math.abs(sum - 100) > 0.01)
        throw new SplitError(`Percentages add up to ${sum}%, not 100%`);
      const parts = allocate(
        totalCents,
        participants.map((p) => p.weight ?? 0),
      );
      return participants.map((p, i) => ({ userId: p.userId, amountCents: parts[i] ?? 0 }));
    }
    case "exact": {
      const sum = participants.reduce((a, p) => a + (p.exactCents ?? 0), 0);
      if (sum !== totalCents) throw new SplitError("The amounts entered don't add up to the total");
      return participants.map((p) => ({ userId: p.userId, amountCents: p.exactCents ?? 0 }));
    }
  }
}

export type ExpenseForBalance = {
  /** Amount in the trip's currency, minor units. */
  amountCents: number;
  paidBy: string | null;
  shares: Share[];
};

export type SettlementForBalance = { fromUserId: string; toUserId: string; amountCents: number };

/**
 * Net position per person in minor units: positive means the trip owes them, negative
 * means they owe the trip.
 */
export function computeBalances(
  expenses: ExpenseForBalance[],
  settlements: SettlementForBalance[] = [],
): Map<string, number> {
  const balances = new Map<string, number>();
  const add = (userId: string, cents: number) =>
    balances.set(userId, (balances.get(userId) ?? 0) + cents);

  for (const expense of expenses) {
    if (expense.paidBy) add(expense.paidBy, expense.amountCents);
    for (const share of expense.shares) add(share.userId, -share.amountCents);
  }
  // Paying someone back reduces what you owe and what they are owed.
  for (const s of settlements) {
    add(s.fromUserId, s.amountCents);
    add(s.toUserId, -s.amountCents);
  }
  for (const [userId, cents] of balances) if (cents === 0) balances.delete(userId);
  return balances;
}

export type Transfer = { fromUserId: string; toUserId: string; amountCents: number };

/**
 * Turns balances into the shortest list of payments that clears them: biggest debtor pays
 * the biggest creditor, repeatedly. Never more than (people - 1) transfers.
 */
export function settleUp(balances: Map<string, number>): Transfer[] {
  const debtors = [...balances.entries()]
    .filter(([, c]) => c < 0)
    .map(([userId, c]) => ({ userId, cents: -c }));
  const creditors = [...balances.entries()]
    .filter(([, c]) => c > 0)
    .map(([userId, c]) => ({ userId, cents: c }));
  debtors.sort((a, b) => b.cents - a.cents || a.userId.localeCompare(b.userId));
  creditors.sort((a, b) => b.cents - a.cents || a.userId.localeCompare(b.userId));

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!;
    const creditor = creditors[j]!;
    const amount = Math.min(debtor.cents, creditor.cents);
    if (amount > 0)
      transfers.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amountCents: amount });
    debtor.cents -= amount;
    creditor.cents -= amount;
    if (debtor.cents === 0) i += 1;
    if (creditor.cents === 0) j += 1;
  }
  return transfers;
}

export type CategoryTotal = { key: string; cents: number };

export function totalsBy<T>(
  items: T[],
  keyOf: (item: T) => string,
  centsOf: (item: T) => number,
): CategoryTotal[] {
  const map = new Map<string, number>();
  for (const item of items) map.set(keyOf(item), (map.get(keyOf(item)) ?? 0) + centsOf(item));
  return [...map.entries()]
    .map(([key, cents]) => ({ key, cents }))
    .sort((a, b) => b.cents - a.cents);
}
