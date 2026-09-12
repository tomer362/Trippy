"use client";
import { Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";

const DISMISS_KEY = "trippy:install-dismissed";

/**
 * iOS Safari never offers an install prompt of its own, so an installed-app coach-mark is
 * the only way a phone user finds "Add to Home Screen" (which is also what unlocks push).
 */
export function InstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      // private mode: show it, it is only a hint
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const isIos =
      /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    if (!isIos) return;
    const timer = setTimeout(() => setShow(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div className="no-print fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex items-start gap-3 rounded-3xl border border-border bg-card p-4 shadow-xl">
      <SquarePlus className="mt-0.5 size-5 shrink-0 text-primary" />
      <p className="flex-1 text-sm">
        Add Trippy to your home screen for offline trips and reminders: tap{" "}
        <Share className="inline size-4 align-text-bottom" /> then
        <span className="font-semibold"> Add to Home Screen</span>.
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        className="rounded-full p-1 text-muted-foreground hover:bg-muted"
        onClick={() => {
          setShow(false);
          try {
            localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            // nothing to do: the hint simply reappears next time
          }
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
