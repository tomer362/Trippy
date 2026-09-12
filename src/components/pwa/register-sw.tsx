"use client";
import { useEffect } from "react";

/** Serwist registers the worker automatically in production; this only wires update reloads. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const sw = window.serwist;
    if (!sw) return;
    const onWaiting = () => {
      sw.messageSkipWaiting();
    };
    sw.addEventListener("waiting", onWaiting);
    return () => sw.removeEventListener("waiting", onWaiting);
  }, []);
  return null;
}
