"use client";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

/** Tells people plainly when their edits are not reaching the server. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="no-print sticky top-0 z-50 flex items-center justify-center gap-2 bg-foreground px-3 py-1.5 text-xs font-semibold text-background">
      <WifiOff className="size-3.5" /> Offline. You can read your trips; changes will need a
      connection.
    </div>
  );
}
