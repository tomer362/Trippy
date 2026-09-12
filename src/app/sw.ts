import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Trip data: serve from network, fall back to the last copy when offline.
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/trips/"),
      handler: new NetworkFirst({ cacheName: "trip-data", networkTimeoutSeconds: 5 }),
    },
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin &&
        (url.pathname.startsWith("/api/destinations/") ||
          url.pathname.startsWith("/api/places/photo")),
      handler: new StaleWhileRevalidate({ cacheName: "lookups" }),
    },
    {
      matcher: ({ url }) =>
        /(upload\.wikimedia\.org|public\.blob\.vercel-storage\.com)$/.test(url.hostname),
      handler: new StaleWhileRevalidate({ cacheName: "remote-images" }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

self.addEventListener("push", (event) => {
  const data = (() => {
    try {
      return event.data?.json() as { title?: string; body?: string; url?: string; tag?: string };
    } catch {
      return { title: "Trippy", body: event.data?.text() };
    }
  })();
  event.waitUntil(
    self.registration.showNotification(data?.title ?? "Trippy", {
      body: data?.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data?.tag,
      data: { url: data?.url ?? "/trips" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/trips";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => "focus" in c);
      if (existing) {
        existing.navigate(url);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});

serwist.addEventListeners();
