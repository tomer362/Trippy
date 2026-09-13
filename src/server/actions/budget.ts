"use server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fromCents, toCents } from "@/lib/money";
import { computeShares, type Participant, SplitError } from "@/lib/split";
import { AccessDeniedError, requireTripAccess } from "@/server/authz";
import { db } from "@/server/db";
import {
  budgets,
  expenseShares,
  expenses,
  settlements,
  tripMembers,
  trips,
} from "@/server/db/schema";
import { assertInTrip } from "@/server/scope";
import { publishTripChange } from "@/server/services/realtime";
import { action } from "./_helpers";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const money = z.string().regex(/^\d{1,9}([.,]\d{1,2})?$/, "Enter an amount like 12.50");
const category = z.enum([
  "flights",
  "lodging",
  "transport",
  "food",
  "activities",
  "shopping",
  "fees",
  "other",
]);
const splitMode = z.enum(["equal", "exact", "shares", "percent", "none"]);

async function touch(tripId: string) {
  await db.update(trips).set({ updatedAt: new Date() }).where(eq(trips.id, tripId));
  revalidatePath(`/t/${tripId}/budget`);
}

const participantSchema = z.object({
  userId: z.string(),
  weight: z.number().min(0).max(10000).optional(),
  exact: money.optional(),
});

const expenseSchema = z.object({
  tripId: z.string(),
  title: z.string().trim().min(1, "Give the expense a name").max(200),
  amount: money,
  currency: z.string().length(3),
  category: category.default("other"),
  paidBy: z.string().nullable().optional(),
  occurredOn: isoDate.nullable().optional(),
  dayIndex: z.number().int().min(0).max(120).nullable().optional(),
  tripPlaceId: z.string().nullable().optional(),
  splitMode: splitMode.default("equal"),
  participants: z.array(participantSchema).max(50).default([]),
  notes: z.string().max(1000).nullable().optional(),
  receiptUrl: z.string().url().nullable().optional(),
});

async function writeShares(
  expenseId: string,
  totalCents: number,
  mode: z.infer<typeof splitMode>,
  participants: z.infer<typeof participantSchema>[],
  paidBy: string | null,
) {
  const mapped: Participant[] = participants.map((p) => ({
    userId: p.userId,
    weight: p.weight,
    exactCents: p.exact ? toCents(p.exact) : undefined,
  }));
  let shares: ReturnType<typeof computeShares>;
  try {
    shares = computeShares(totalCents, mode, mapped, paidBy);
  } catch (err) {
    throw err instanceof SplitError ? new Error(err.message) : err;
  }
  await db.delete(expenseShares).where(eq(expenseShares.expenseId, expenseId));
  if (mode === "none" || shares.length === 0) return;
  await db.insert(expenseShares).values(
    shares.map((s) => ({
      expenseId,
      userId: s.userId,
      amount: fromCents(s.amountCents),
      weight: mapped.find((m) => m.userId === s.userId)?.weight ?? null,
    })),
  );
}

/** Defaults an even split across every trip mate when the caller sends no participants. */
async function participantsOrMembers(
  tripId: string,
  participants: z.infer<typeof participantSchema>[],
) {
  if (participants.length > 0) return participants;
  const members = await db
    .select({ userId: tripMembers.userId })
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId));
  return members.map((m) => ({ userId: m.userId }));
}

export const addExpense = action(expenseSchema, async (input, userId) => {
  await requireTripAccess(input.tripId, userId, "edit");
  await assertInTrip(input.tripId, { tripPlace: input.tripPlaceId });
  const totalCents = toCents(input.amount);
  const participants =
    input.splitMode === "none" ? [] : await participantsOrMembers(input.tripId, input.participants);
  const [created] = await db
    .insert(expenses)
    .values({
      tripId: input.tripId,
      title: input.title,
      amount: fromCents(totalCents),
      currency: input.currency,
      category: input.category,
      paidBy: input.paidBy ?? userId,
      occurredOn: input.occurredOn ?? null,
      dayIndex: input.dayIndex ?? null,
      tripPlaceId: input.tripPlaceId ?? null,
      splitMode: input.splitMode,
      notes: input.notes ?? null,
      receiptUrl: input.receiptUrl ?? null,
      createdBy: userId,
    })
    .returning();
  await writeShares(created!.id, totalCents, input.splitMode, participants, input.paidBy ?? userId);
  await touch(input.tripId);
  await publishTripChange(input.tripId, { entity: "budget", id: created!.id, actorId: userId });
  return { id: created!.id };
});

export const updateExpense = action(
  expenseSchema.partial().extend({ tripId: z.string(), id: z.string() }),
  async ({ tripId, id, participants, ...patch }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await assertInTrip(tripId, { expense: id, tripPlace: patch.tripPlaceId });
    const [existing] = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.tripId, tripId)))
      .limit(1);
    if (!existing) throw new Error("Expense not found");
    const amount = patch.amount ? fromCents(toCents(patch.amount)) : existing.amount;
    await db
      .update(expenses)
      .set({
        ...patch,
        amount,
        version: sql`${expenses.version} + 1`,
      })
      .where(eq(expenses.id, id));
    const mode = patch.splitMode ?? existing.splitMode;
    const payer = patch.paidBy !== undefined ? patch.paidBy : existing.paidBy;
    const people = mode === "none" ? [] : await participantsOrMembers(tripId, participants ?? []);
    await writeShares(id, toCents(amount), mode, people, payer);
    await touch(tripId);
    await publishTripChange(tripId, { entity: "budget", id, actorId: userId });
    return null;
  },
);

export const removeExpense = action(
  z.object({ tripId: z.string(), id: z.string() }),
  async ({ tripId, id }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.tripId, tripId)));
    await touch(tripId);
    await publishTripChange(tripId, { entity: "budget", actorId: userId });
    return null;
  },
);

export const setBudget = action(
  z.object({
    tripId: z.string(),
    amount: money.nullable(),
    currency: z.string().length(3),
    personal: z.boolean().default(false),
  }),
  async ({ tripId, amount, currency, personal }, userId) => {
    const access = await requireTripAccess(tripId, userId, personal ? "view" : "edit");
    // A personal budget is a member's own note-to-self; a passer-by on a public trip has none.
    if (personal && !access.isMember) throw new AccessDeniedError();
    const scope = personal ? userId : null;
    const existing = await db
      .select({ id: budgets.id })
      .from(budgets)
      .where(
        and(
          eq(budgets.tripId, tripId),
          personal ? eq(budgets.userId, userId) : sql`${budgets.userId} IS NULL`,
        ),
      )
      .limit(1);
    if (amount === null) {
      if (existing[0]) await db.delete(budgets).where(eq(budgets.id, existing[0].id));
    } else if (existing[0]) {
      await db
        .update(budgets)
        .set({ amount: fromCents(toCents(amount)), currency })
        .where(eq(budgets.id, existing[0].id));
    } else {
      await db
        .insert(budgets)
        .values({ tripId, userId: scope, amount: fromCents(toCents(amount)), currency });
    }
    await touch(tripId);
    return null;
  },
);

/** Records a payment between two trip mates, which clears part of the balance. */
export const recordSettlement = action(
  z.object({
    tripId: z.string(),
    fromUserId: z.string(),
    toUserId: z.string(),
    amount: money,
    currency: z.string().length(3),
    note: z.string().max(200).nullable().optional(),
  }),
  async (input, userId) => {
    await requireTripAccess(input.tripId, userId, "edit");
    if (input.fromUserId === input.toUserId) throw new Error("Pick two different people");
    // Both sides have to be on the trip, or the ledger can be seeded with arbitrary user ids.
    const parties = await db
      .select({ userId: tripMembers.userId })
      .from(tripMembers)
      .where(
        and(
          eq(tripMembers.tripId, input.tripId),
          inArray(tripMembers.userId, [input.fromUserId, input.toUserId]),
        ),
      );
    if (parties.length !== 2) throw new Error("Both people must be on this trip");
    await db.insert(settlements).values({
      tripId: input.tripId,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      amount: fromCents(toCents(input.amount)),
      currency: input.currency,
      note: input.note ?? null,
    });
    await touch(input.tripId);
    await publishTripChange(input.tripId, { entity: "budget", actorId: userId });
    return null;
  },
);

export const removeSettlement = action(
  z.object({ tripId: z.string(), id: z.string() }),
  async ({ tripId, id }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db.delete(settlements).where(and(eq(settlements.id, id), eq(settlements.tripId, tripId)));
    await touch(tripId);
    return null;
  },
);

/** Turns a place's recorded cost into a shared expense. */
export const expenseFromPlace = action(
  z.object({
    tripId: z.string(),
    tripPlaceId: z.string(),
    title: z.string().min(1).max(200),
    amount: money,
    currency: z.string().length(3),
  }),
  async (input, userId) => {
    await requireTripAccess(input.tripId, userId, "edit");
    const totalCents = toCents(input.amount);
    const participants = await participantsOrMembers(input.tripId, []);
    const [created] = await db
      .insert(expenses)
      .values({
        tripId: input.tripId,
        title: input.title,
        amount: fromCents(totalCents),
        currency: input.currency,
        category: "activities",
        paidBy: userId,
        tripPlaceId: input.tripPlaceId,
        splitMode: "equal",
        createdBy: userId,
      })
      .returning();
    await writeShares(created!.id, totalCents, "equal", participants, userId);
    await touch(input.tripId);
    return { id: created!.id };
  },
);
