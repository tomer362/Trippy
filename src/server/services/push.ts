import "server-only";
import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { env, features } from "@/env";
import { db } from "@/server/db";
import { pushSubscriptions, userProfile } from "@/server/db/schema";

let configured = false;

function ensureConfigured(): boolean {
  if (!features.push) return false;
  if (!configured) {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT,
      env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return true;
}

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

export type PushChannel = "notifyInvites" | "notifyComments" | "notifyTripReminders";

/**
 * Sends a push to every device a user has registered, honouring their notification
 * preferences and dropping subscriptions the browser has retired.
 */
export async function sendPushToUsers(
  userIds: string[],
  message: PushMessage,
  channel: PushChannel,
): Promise<{ sent: number; removed: number }> {
  if (!ensureConfigured() || userIds.length === 0) return { sent: 0, removed: 0 };

  const prefs = await db
    .select({
      userId: userProfile.userId,
      invites: userProfile.notifyInvites,
      comments: userProfile.notifyComments,
      reminders: userProfile.notifyTripReminders,
    })
    .from(userProfile)
    .where(inArray(userProfile.userId, userIds));
  const allowed = new Set(
    prefs
      .filter((p) =>
        channel === "notifyInvites"
          ? p.invites
          : channel === "notifyComments"
            ? p.comments
            : p.reminders,
      )
      .map((p) => p.userId),
  );
  const targets = userIds.filter((id) => allowed.has(id));
  if (targets.length === 0) return { sent: 0, removed: 0 };

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, targets));
  let sent = 0;
  let removed = 0;
  const payload = JSON.stringify(message);

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404 and 410 mean the browser threw the subscription away.
      if (status === 404 || status === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        removed += 1;
      } else {
        console.error("push send failed", status, err);
      }
    }
  }
  return { sent, removed };
}
