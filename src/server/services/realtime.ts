import "server-only";
import Pusher from "pusher";
import { env, features } from "@/env";

export type TripChange = {
  entity:
    | "places"
    | "lists"
    | "itinerary"
    | "lodging"
    | "reservations"
    | "budget"
    | "trip"
    | "comments"
    | "journal"
    | "checklists";
  id?: string;
  actorId?: string;
};

let client: Pusher | null = null;

function pusher(): Pusher | null {
  if (!features.realtime) return null;
  client ??= new Pusher({
    appId: env.PUSHER_APP_ID!,
    key: env.PUSHER_KEY!,
    secret: env.PUSHER_SECRET!,
    cluster: env.PUSHER_CLUSTER,
    useTLS: true,
  });
  return client;
}

/**
 * One presence channel per trip carries both "someone changed something" hints and the
 * list of people currently viewing, so a client needs a single subscription.
 */
export function tripChannel(tripId: string) {
  return `presence-trip-${tripId}`;
}

export function tripIdFromChannel(channel: string): string | null {
  return channel.match(/^presence-trip-(.+)$/)?.[1] ?? null;
}

/**
 * Broadcasts a hint that something changed so other viewers refetch. Only identifiers travel
 * over the wire, never trip content; without Pusher configured clients fall back to polling.
 */
export async function publishTripChange(tripId: string, change: TripChange): Promise<void> {
  const p = pusher();
  if (!p) return;
  try {
    await p.trigger(tripChannel(tripId), "changed", { tripId, ...change, at: Date.now() });
  } catch (err) {
    console.error("realtime publish failed", err);
  }
}

export function authorizeChannel(
  socketId: string,
  channel: string,
  user: { id: string; name: string; image?: string | null },
) {
  const p = pusher();
  if (!p) throw new Error("Realtime is not configured");
  if (channel.startsWith("presence-")) {
    return p.authorizeChannel(socketId, channel, {
      user_id: user.id,
      user_info: { name: user.name, image: user.image ?? null },
    });
  }
  return p.authorizeChannel(socketId, channel);
}
