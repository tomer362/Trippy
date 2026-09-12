"use client";
import { Copy, Heart, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { copyTripToMine, toggleGuideLike } from "@/server/actions/guides";
import type { GuideCardDTO } from "@/server/queries/discovery";

export function GuideCard({ guide, canInteract }: { guide: GuideCardDTO; canInteract: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <article className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card">
      <Link href={`/p/${guide.slug}`} className="relative block h-32 shrink-0">
        {guide.coverUrl ? (
          // biome-ignore lint/performance/noImgElement: remote CDN image
          <img
            src={guide.coverUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="sunset-bg absolute inset-0" />
        )}
      </Link>
      <div className="flex flex-1 flex-col p-3">
        <Link href={`/p/${guide.slug}`} className="font-bold hover:underline">
          {guide.name}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {guide.destinations.join(" · ") || "No destination"} · {guide.placeCount} places ·{" "}
          {guide.dayCount} days
        </p>
        {guide.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{guide.description}</p>
        )}
        <div className="mt-auto flex items-center gap-2 pt-3">
          <Avatar src={guide.authorImage} name={guide.authorName} size={22} />
          {guide.authorHandle ? (
            <Link
              href={`/u/${guide.authorHandle}`}
              className="min-w-0 flex-1 truncate text-xs text-muted-foreground hover:underline"
            >
              @{guide.authorHandle}
            </Link>
          ) : (
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {guide.authorName}
            </span>
          )}
          {canInteract && (
            <>
              <button
                type="button"
                disabled={pending}
                aria-pressed={guide.likedByViewer}
                aria-label={guide.likedByViewer ? "Remove like" : "Like this guide"}
                onClick={() =>
                  start(async () => {
                    const res = await toggleGuideLike({ tripId: guide.tripId });
                    if (!res.ok) toast.error(res.error);
                    else router.refresh();
                  })
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs",
                  guide.likedByViewer && "border-primary text-primary",
                )}
              >
                <Heart className={cn("size-3.5", guide.likedByViewer && "fill-current")} />{" "}
                {guide.likes}
              </button>
              <button
                type="button"
                disabled={pending}
                aria-label="Copy to my trips"
                onClick={() =>
                  start(async () => {
                    const res = await copyTripToMine({ tripId: guide.tripId, withItinerary: true });
                    if (!res.ok) toast.error(res.error);
                    else {
                      toast.success(`Copied ${res.data.places} places`);
                      router.push(`/t/${res.data.tripId}`);
                    }
                  })
                }
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs hover:bg-muted"
              >
                <Copy className="size-3.5" /> Copy
              </button>
            </>
          )}
          {!canInteract && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3.5" /> {guide.placeCount}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
