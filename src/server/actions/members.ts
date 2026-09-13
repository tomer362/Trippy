"use server";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { env } from "@/env";
import { requireTripAccess } from "@/server/authz";
import { db } from "@/server/db";
import { activities, tripInvites, tripMembers, trips, user } from "@/server/db/schema";
import { sendInviteAccepted, sendTripInvite } from "@/server/services/email";
import { publishTripChange } from "@/server/services/realtime";
import { action } from "./_helpers";

const inviteToken = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  24,
);
const roleSchema = z.enum(["editor", "viewer"]);

function inviteUrl(token: string) {
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/invite/${token}`;
}

const createInviteSchema = z.object({
  tripId: z.string(),
  role: roleSchema.default("editor"),
  email: z.string().email().optional(),
  expiresInDays: z.number().int().min(1).max(90).default(30),
  maxUses: z.number().int().min(1).max(50).optional(),
});

/** Creates a role-scoped invite link, optionally emailing it. */
export const createInvite = action(createInviteSchema, async (input, userId) => {
  const access = await requireTripAccess(input.tripId, userId, "edit");
  const token = inviteToken();
  const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
  await db.insert(tripInvites).values({
    token,
    tripId: input.tripId,
    role: input.role,
    email: input.email ?? null,
    createdBy: userId,
    expiresAt,
    maxUses: input.maxUses ?? null,
  });
  const url = inviteUrl(token);
  let emailed = false;
  if (input.email) {
    const [inviter] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    const result = await sendTripInvite({
      to: input.email,
      inviterName: inviter?.name ?? "A trip mate",
      tripName: access.trip.name,
      role: input.role,
      url,
    });
    emailed = result.sent;
  }
  revalidatePath(`/t/${input.tripId}/settings`);
  return { token, url, emailed };
});

export const revokeInvite = action(
  z.object({ tripId: z.string(), id: z.string() }),
  async ({ tripId, id }, userId) => {
    await requireTripAccess(tripId, userId, "edit");
    await db
      .update(tripInvites)
      .set({ revokedAt: new Date() })
      .where(and(eq(tripInvites.id, id), eq(tripInvites.tripId, tripId)));
    revalidatePath(`/t/${tripId}/settings`);
    return null;
  },
);

/**
 * Redeems an invite for the signed-in user. Existing members keep the role they have unless
 * the invite grants more, and the inviter is told someone joined.
 */
export const acceptInvite = action(
  z.object({ token: z.string().min(10) }),
  async ({ token }, userId) => {
    const [invite] = await db
      .select()
      .from(tripInvites)
      .where(eq(tripInvites.token, token))
      .limit(1);
    if (!invite) throw new Error("That invite link is not valid");
    if (invite.revokedAt) throw new Error("That invite has been revoked");
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now())
      throw new Error("That invite has expired");

    // An emailed invite names its recipient, so a forwarded link must not admit whoever opens
    // it. A link-only invite (no email) stays bearer-based on purpose.
    if (invite.email) {
      const [me] = await db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
      if (me?.email?.toLowerCase() !== invite.email.toLowerCase())
        throw new Error("That invite was sent to a different email address");
    }

    const [existing] = await db
      .select()
      .from(tripMembers)
      .where(and(eq(tripMembers.tripId, invite.tripId), eq(tripMembers.userId, userId)))
      .limit(1);

    // Claim a use in one conditional statement — reading the count and incrementing it
    // separately lets simultaneous redemptions all slip past a maxUses of 1 — and put the
    // membership write in the same batch, so a failed join never burns a use.
    const claim = db
      .update(tripInvites)
      .set({ uses: sql`${tripInvites.uses} + 1`, acceptedBy: userId })
      .where(
        and(
          eq(tripInvites.id, invite.id),
          isNull(tripInvites.revokedAt),
          or(isNull(tripInvites.maxUses), lt(tripInvites.uses, tripInvites.maxUses)),
        ),
      )
      .returning({ id: tripInvites.id });

    if (!existing) {
      const [claimed] = await db.batch([
        claim,
        db.insert(tripMembers).values({ tripId: invite.tripId, userId, role: invite.role }),
      ]);
      if (claimed.length === 0) throw new Error("That invite has been used up");
      const [joiner] = await db
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
      await db.insert(activities).values({
        tripId: invite.tripId,
        actorId: userId,
        type: "member.joined",
        summary: "joined the trip",
      });
      const [owner] = await db
        .select({ email: user.email })
        .from(trips)
        .innerJoin(user, eq(user.id, trips.ownerId))
        .where(eq(trips.id, invite.tripId))
        .limit(1);
      const [trip] = await db
        .select({ name: trips.name })
        .from(trips)
        .where(eq(trips.id, invite.tripId))
        .limit(1);
      if (owner?.email && trip) {
        await sendInviteAccepted({
          to: owner.email,
          memberName: joiner?.name ?? "Someone",
          tripName: trip.name,
          url: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/t/${invite.tripId}`,
        });
      }
    } else if (existing.role === "viewer" && invite.role === "editor") {
      const [claimed] = await db.batch([
        claim,
        db
          .update(tripMembers)
          .set({ role: "editor" })
          .where(and(eq(tripMembers.tripId, invite.tripId), eq(tripMembers.userId, userId))),
      ]);
      if (claimed.length === 0) throw new Error("That invite has been used up");
    } else {
      // Already a member at this role or better: nothing to change, and no use to spend.
      return { tripId: invite.tripId };
    }

    await publishTripChange(invite.tripId, { entity: "trip", actorId: userId });
    revalidatePath("/trips");
    return { tripId: invite.tripId };
  },
);

export const setMemberRole = action(
  z.object({ tripId: z.string(), memberId: z.string(), role: roleSchema }),
  async ({ tripId, memberId, role }, userId) => {
    const access = await requireTripAccess(tripId, userId, "manage");
    if (memberId === userId) throw new Error("You cannot change your own role");
    if (memberId === access.trip.ownerId)
      throw new Error("The owner's role cannot be changed. Transfer ownership first.");
    await db
      .update(tripMembers)
      .set({ role })
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, memberId)));
    revalidatePath(`/t/${tripId}/settings`);
    await publishTripChange(tripId, { entity: "trip", actorId: userId });
    return null;
  },
);

export const removeMember = action(
  z.object({ tripId: z.string(), memberId: z.string() }),
  async ({ tripId, memberId }, userId) => {
    const access = await requireTripAccess(tripId, userId, "manage");
    if (memberId === access.trip.ownerId)
      throw new Error("The owner cannot be removed. Transfer ownership first.");
    await db
      .delete(tripMembers)
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, memberId)));
    revalidatePath(`/t/${tripId}/settings`);
    await publishTripChange(tripId, { entity: "trip", actorId: userId });
    return null;
  },
);

/** Hands the trip over; the previous owner stays on as an editor. */
export const transferOwnership = action(
  z.object({ tripId: z.string(), memberId: z.string() }),
  async ({ tripId, memberId }, userId) => {
    await requireTripAccess(tripId, userId, "manage");
    const [target] = await db
      .select()
      .from(tripMembers)
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, memberId)))
      .limit(1);
    if (!target) throw new Error("That person is not on this trip");
    // All or nothing. Landing between the trip's owner_id and the two role rows leaves a trip
    // where getTripAccess backfills nobody as owner, so no one can manage it any more.
    await db.batch([
      db.update(trips).set({ ownerId: memberId }).where(eq(trips.id, tripId)),
      db
        .update(tripMembers)
        .set({ role: "owner" })
        .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, memberId))),
      db
        .update(tripMembers)
        .set({ role: "editor" })
        .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId))),
      db.insert(activities).values({
        tripId,
        actorId: userId,
        type: "trip.ownership",
        summary: "transferred ownership",
      }),
    ]);
    revalidatePath(`/t/${tripId}/settings`);
    return null;
  },
);
