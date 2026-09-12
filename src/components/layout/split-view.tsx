"use client";
import { List, Map as MapIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Document on the left, live map on the right. On phones the two become one pane with a
 * floating List/Map toggle.
 */
export function SplitView({ list, map }: { list: React.ReactNode; map: React.ReactNode }) {
  const [view, setView] = useState<"list" | "map">("list");
  return (
    <div className="relative flex min-h-0 flex-1 lg:flex-row">
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto lg:max-w-xl xl:max-w-2xl",
          view === "map" && "hidden lg:block",
        )}
      >
        {list}
      </div>
      <div
        className={cn(
          "relative min-h-0 flex-1 border-l border-border",
          view === "list" && "hidden lg:block",
        )}
      >
        {map}
      </div>
      <button
        type="button"
        onClick={() => setView(view === "list" ? "map" : "list")}
        className="no-print fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-5 py-3 font-semibold text-background shadow-lg lg:hidden"
      >
        {view === "list" ? <MapIcon className="size-5" /> : <List className="size-5" />}
        {view === "list" ? "Map" : "List"}
      </button>
    </div>
  );
}
