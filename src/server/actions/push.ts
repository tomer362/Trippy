"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { pushSubscriptions } from "@/server/db/schema";
import { action } from "./_helpers";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(10),
  auth: z.string().min(4),
  userAgent: z.string().max(300).optional(),
});

/** Stores a browser push subscription for this device. Idempotent per endpoint. */
export const savePushSubscription = action(subscriptionSchema, async (input, userId) => {
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    })
    // Keyed on the endpoint, so re-registering the same device refreshes its keys — but never
    // reassigns someone else's endpoint to the caller.
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { p256dh: input.p256dh, auth: input.auth },
      where: eq(pushSubscriptions.userId, userId),
    });
  return null;
});

export const removePushSubscription = action(
  z.object({ endpoint: z.string().url() }),
  async ({ endpoint }, userId) => {
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)));
    return null;
  },
);
