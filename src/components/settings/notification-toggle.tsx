"use client";
import { Bell, BellOff } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { removePushSubscription, savePushSubscription } from "@/server/actions/push";

function toBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Turns browser push on or off for this device. */
export function NotificationToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<"unknown" | "unsupported" | "off" | "on" | "blocked">(
    "unknown",
  );
  const [pending, start] = useTransition();

  useEffect(() => {
    if (
      !vapidPublicKey ||
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    void navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off"))
      .catch(() => setState("off"));
  }, [vapidPublicKey]);

  async function enable() {
    if (!vapidPublicKey) return;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState(permission === "denied" ? "blocked" : "off");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });
    const json = subscription.toJSON();
    start(async () => {
      const res = await savePushSubscription({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? toBase64Url(subscription.getKey("p256dh")),
        auth: json.keys?.auth ?? toBase64Url(subscription.getKey("auth")),
        userAgent: navigator.userAgent.slice(0, 300),
      });
      if (!res.ok) toast.error(res.error);
      else {
        setState("on");
        toast.success("Notifications on for this device");
      }
    });
  }

  async function disable() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      start(async () => {
        await removePushSubscription({ endpoint });
        setState("off");
        toast.success("Notifications off for this device");
      });
    } else {
      setState("off");
    }
  }

  if (state === "unsupported") {
    return (
      <p className="text-sm text-muted-foreground">
        This browser can't do push notifications. On iPhone, add Trippy to your home screen first.
      </p>
    );
  }
  if (state === "blocked") {
    return (
      <p className="text-sm text-muted-foreground">
        Notifications are blocked in your browser settings for this site.
      </p>
    );
  }

  return (
    <Button
      variant="outline"
      disabled={pending || state === "unknown"}
      onClick={() => (state === "on" ? void disable() : void enable())}
    >
      {state === "on" ? <BellOff /> : <Bell />}{" "}
      {state === "on" ? "Turn off on this device" : "Turn on for this device"}
    </Button>
  );
}
