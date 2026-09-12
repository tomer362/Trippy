"use client";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { type DestinationDTO, KIND_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";

async function fetchHero(id: string) {
  const res = await fetch(`/api/destinations/${id}/hero`);
  if (!res.ok) return { url: null, credit: null };
  return (await res.json()) as { url: string | null; credit: string | null };
}

export function useDestinationHero(
  destination: Pick<DestinationDTO, "id" | "heroUrl" | "heroCredit">,
) {
  return useQuery({
    queryKey: ["destination-hero", destination.id],
    queryFn: () => fetchHero(destination.id!),
    enabled: Boolean(destination.id) && !destination.heroUrl,
    staleTime: 86_400_000,
    initialData: destination.heroUrl
      ? { url: destination.heroUrl, credit: destination.heroCredit }
      : undefined,
  });
}

function gradientFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, oklch(80% 0.12 ${h}) 0%, oklch(65% 0.16 ${(h + 40) % 360}) 100%)`;
}

export function DestinationHero({
  destination,
  className,
  children,
}: {
  destination: DestinationDTO;
  className?: string;
  children?: React.ReactNode;
}) {
  const { data } = useDestinationHero(destination);
  const url = data?.url ?? destination.heroUrl;
  return (
    <div
      className={cn("relative overflow-hidden bg-muted", className)}
      style={url ? undefined : { background: gradientFor(destination.name) }}
    >
      {url ? (
        // biome-ignore lint/performance/noImgElement: remote CDN image, intentionally unoptimised
        <img
          src={url}
          alt=""
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-6xl font-black text-white/70">
          {destination.name[0]}
        </span>
      )}
      {children}
    </div>
  );
}

export function DestinationCard({
  destination,
  onRemove,
}: {
  destination: DestinationDTO;
  onRemove?: () => void;
}) {
  const { data } = useDestinationHero(destination);
  return (
    <figure className="overflow-hidden rounded-3xl border border-white/60 bg-white/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
      <DestinationHero destination={destination} className="aspect-[4/3] rounded-2xl m-2">
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${destination.name}`}
            className="absolute right-3 top-3 rounded-full bg-white/85 p-2 text-foreground shadow hover:bg-white"
          >
            <X className="size-5" />
          </button>
        )}
      </DestinationHero>
      <figcaption className="flex items-center justify-between gap-2 px-4 pb-3 pt-1">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{destination.name}</p>
          {destination.subtitle && (
            <p className="truncate text-xs text-muted-foreground">{destination.subtitle}</p>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {KIND_LABEL[destination.kind]}
        </span>
      </figcaption>
      {data?.credit && (
        <p className="px-4 pb-2 text-[10px] text-muted-foreground/70">Photo: {data.credit}</p>
      )}
    </figure>
  );
}
