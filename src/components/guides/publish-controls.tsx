"use client";
import { CheckCircle2, Copy, Globe, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { TripKind } from "@/lib/types";
import {
  completeTrip,
  convertTripKind,
  copyTripToMine,
  publishGuide,
} from "@/server/actions/guides";

/** Publish, duplicate and lifecycle controls, kept together in trip settings. */
export function PublishControls({
  tripId,
  slug,
  kind,
  isPublic,
  isCompleted,
  canManage,
}: {
  tripId: string;
  slug: string;
  kind: TripKind;
  isPublic: boolean;
  isCompleted: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Failed");
      else {
        toast.success(success);
        router.refresh();
      }
    });
  }

  return (
    <section className="space-y-3">
      <h3 className="font-bold">Sharing and lifecycle</h3>
      <div className="flex flex-wrap gap-2">
        {canManage && (
          <Button
            variant={isPublic ? "outline" : "primary"}
            disabled={pending}
            onClick={() =>
              run(
                () => publishGuide({ tripId, publish: !isPublic }),
                isPublic ? "Unpublished" : "Published as a guide",
              )
            }
          >
            <Globe /> {isPublic ? "Unpublish" : "Publish as a guide"}
          </Button>
        )}
        {isPublic && (
          <Button
            variant="outline"
            onClick={async () => {
              const url = `${window.location.origin}/p/${slug}`;
              if (navigator.share) {
                try {
                  await navigator.share({ url });
                  return;
                } catch {
                  // dismissed; fall through to the clipboard
                }
              }
              await navigator.clipboard.writeText(url);
              toast.success("Link copied");
            }}
          >
            <Share2 /> Share the public link
          </Button>
        )}
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await copyTripToMine({ tripId, withItinerary: true });
              if (!res.ok) toast.error(res.error);
              else {
                toast.success("Duplicated");
                router.push(`/t/${res.data.tripId}`);
              }
            })
          }
        >
          <Copy /> Duplicate this trip
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(
              () => completeTrip({ tripId, completed: !isCompleted }),
              isCompleted ? "Marked as still going" : "Marked as finished",
            )
          }
        >
          <CheckCircle2 /> {isCompleted ? "Reopen trip" : "Mark as finished"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Finishing a trip feeds your travel profile, which is what powers the pacing hints and the
        "places you loved" suggestions on your next trip.
      </p>
      {canManage && kind !== "guide" && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() => convertTripKind({ tripId, kind: "guide" }), "Turned into a guide")
          }
        >
          Turn this into a travel guide
        </Button>
      )}
    </section>
  );
}
