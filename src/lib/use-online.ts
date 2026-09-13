"use client";
import { useEffect, useState } from "react";

/**
 * Whether the browser currently has a connection. Every write in this app is a server action,
 * which simply throws when offline, so the honest thing is to disable the controls rather than
 * let someone type an edit that cannot be sent.
 *
 * Starts optimistic: `navigator` does not exist during server rendering, and a first paint that
 * claims to be offline would be wrong far more often than right.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return online;
}
