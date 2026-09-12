"use client";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** Google place photos are fetched live through our proxy and never stored. */
export function PlacePhoto({
  name,
  alt,
  className,
  width = 320,
}: {
  name?: string | null;
  alt: string;
  className?: string;
  width?: number;
}) {
  if (!name) {
    return (
      <span
        className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}
      >
        <ImageOff className="size-5" />
      </span>
    );
  }
  return (
    // biome-ignore lint/performance/noImgElement: proxied Google photo, intentionally unoptimised
    <img
      src={`/api/places/photo?name=${encodeURIComponent(name)}&w=${width}`}
      alt={alt}
      className={cn("object-cover", className)}
      loading="lazy"
    />
  );
}
