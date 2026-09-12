"use client";
import { Bed, Check, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapMarker } from "./types";

/** Teardrop pin drawn in the owning list's or day's colour. */
export function Pin({ marker, selected }: { marker: MapMarker; selected?: boolean }) {
  const variant = marker.variant ?? "place";
  if (variant === "suggestion") {
    return (
      <span
        className={cn(
          "block size-3 rounded-full border-2 border-white shadow transition-transform",
          selected && "scale-150",
        )}
        style={{ backgroundColor: marker.colorHex }}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={cn(
        "relative flex flex-col items-center transition-transform",
        selected && "scale-110",
        marker.dimmed && "opacity-40",
      )}
    >
      <span
        className="flex size-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-black text-white shadow-md"
        style={{ backgroundColor: marker.colorHex }}
      >
        {marker.visited ? (
          <Check className="size-3.5" strokeWidth={3.5} />
        ) : variant === "lodging" ? (
          <Bed className="size-3.5" />
        ) : marker.label !== null && marker.label !== undefined && marker.label !== "" ? (
          marker.label
        ) : (
          <MapPin className="size-3.5" />
        )}
      </span>
      <span
        className="-mt-1 size-0 border-x-[5px] border-t-[7px] border-x-transparent"
        style={{ borderTopColor: marker.colorHex }}
      />
    </span>
  );
}
