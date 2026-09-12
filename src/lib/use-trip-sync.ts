"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type PresenceMember = { id: string; name: string; image: string | null };

type PusherLike = {
  subscribe: (channel: string) => {
    bind: (event: string, handler: (data: unknown) => void) => void;
    members?: {
      each: (
        cb: (m: { id: string; info: { name?: string; image?: string | null } }) => void,
      ) => void;
    };
  };
  unsubscribe: (channel: string) => void;
  disconnect: () => void;
};

const POLL_MS = 20_000;

/**
 * Keeps a trip page in step with other people editing it.
 *
 * With realtime configured, the server broadcasts small "something changed" hints on a
 * per-trip presence channel and this hook refreshes the page and tracks who is viewing.
 * Without it, the page quietly falls back to polling and refresh-on-focus, so the feature
 * degrades instead of breaking.
 */
export function useTripSync(tripId: string, currentUserId: string | null) {
  const router = useRouter();
  const [viewers, setViewers] = useState<PresenceMember[]>([]);
  const [live, setLive] = useState(false);
  const lastRefresh = useRef(0);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    const refresh = () => {
      const now = Date.now();
      if (now - lastRefresh.current < 1500) return;
      lastRefresh.current = now;
      router.refresh();
    };

    if (!key) {
      const onFocus = () => refresh();
      const interval = setInterval(() => {
        if (document.visibilityState === "visible") refresh();
      }, POLL_MS);
      window.addEventListener("focus", onFocus);
      return () => {
        clearInterval(interval);
        window.removeEventListener("focus", onFocus);
      };
    }

    let client: PusherLike | null = null;
    let cancelled = false;
    const channelName = `presence-trip-${tripId}`;

    void import("pusher-js").then(({ default: Pusher }) => {
      if (cancelled) return;
      client = new Pusher(key, {
        cluster: cluster ?? "eu",
        authEndpoint: "/api/pusher/auth",
      }) as unknown as PusherLike;
      const channel = client.subscribe(channelName);
      setLive(true);

      const readMembers = () => {
        const next: PresenceMember[] = [];
        channel.members?.each((m) => {
          if (m.id !== currentUserId)
            next.push({
              id: m.id,
              name: m.info?.name ?? "Trip mate",
              image: m.info?.image ?? null,
            });
        });
        setViewers(next);
      };

      channel.bind("pusher:subscription_succeeded", readMembers);
      channel.bind("pusher:member_added", readMembers);
      channel.bind("pusher:member_removed", readMembers);
      channel.bind("changed", (data: unknown) => {
        const actorId = (data as { actorId?: string } | null)?.actorId;
        // Our own writes already refreshed the page.
        if (actorId && actorId === currentUserId) return;
        refresh();
      });
    });

    return () => {
      cancelled = true;
      setLive(false);
      if (client) {
        client.unsubscribe(channelName);
        client.disconnect();
      }
    };
  }, [tripId, currentUserId, router]);

  return { viewers, live };
}
