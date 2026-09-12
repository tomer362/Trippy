"use client";
import {
  ArrowLeft,
  Globe,
  Link2,
  Lock,
  MoreHorizontal,
  Settings,
  Share2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Avatar } from "@/components/ui/misc";
import { formatDateRange } from "@/lib/days";
import type { DestinationDTO, TripKind, TripRole, TripVisibility } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TripMemberInfo } from "@/server/queries/trips";
import { LiveViewers } from "./live-viewers";

export type TripHeaderTrip = {
  id: string;
  name: string;
  kind: TripKind;
  coverUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  dayCount: number;
  visibility: TripVisibility;
};

const TABS = [
  { key: "", label: "Overview" },
  { key: "places", label: "Places" },
  { key: "itinerary", label: "Itinerary" },
  { key: "lodging", label: "Lodging" },
  { key: "reservations", label: "Bookings" },
  { key: "budget", label: "Budget" },
  { key: "checklists", label: "Checklists" },
  { key: "journal", label: "Journal" },
  { key: "explore", label: "Explore" },
];

export function TripHeader({
  trip,
  destinations,
  members,
  role,
  canEdit,
  canManage,
  currentUserId,
}: {
  trip: TripHeaderTrip;
  destinations: DestinationDTO[];
  members: TripMemberInfo[];
  role: TripRole | null;
  canEdit: boolean;
  canManage: boolean;
  currentUserId: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/t/${trip.id}`;
  const current = pathname.slice(base.length).replace(/^\//, "").split("/")[0] ?? "";

  async function share() {
    const url = `${window.location.origin}/t/${trip.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: trip.name, url });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  const VisIcon =
    trip.visibility === "private"
      ? Lock
      : trip.visibility === "public"
        ? Globe
        : trip.visibility === "friends"
          ? Users
          : Link2;

  return (
    <header className="no-print border-b border-border/60 bg-background">
      <div className="relative h-36 overflow-hidden sm:h-44">
        {trip.coverUrl ? (
          // biome-ignore lint/performance/noImgElement: remote CDN image
          <img
            src={trip.coverUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="sunset-bg absolute inset-0" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/20" />
        <div className="safe-pt absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <Link
            href="/trips"
            className="rounded-full bg-white/85 p-2 text-foreground shadow"
            aria-label="Back to trips"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={share}
              className="rounded-full bg-white/85 p-2 text-foreground shadow"
              aria-label="Share"
            >
              <Share2 className="size-5" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="rounded-full bg-white/85 p-2 text-foreground shadow"
                aria-label="More"
              >
                <MoreHorizontal className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem onSelect={() => router.push(`${base}/settings`)}>
                    <Settings /> Trip settings
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => window.print()}>Print / PDF</DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/trips/${trip.id}/export/calendar`} download>
                    Add to calendar (.ics)
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/trips/${trip.id}/export/places`} download>
                    Export places (CSV)
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/trips/${trip.id}/export/expenses`} download>
                    Export expenses (CSV)
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={share}>
                  <Share2 /> Share link
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold tracking-tight drop-shadow sm:text-3xl">
              {trip.name}
            </h1>
            <p className="truncate text-sm text-white/90">
              {destinations.map((d) => d.name).join(" · ")} ·{" "}
              {formatDateRange(trip.startDate, trip.endDate, trip.dayCount)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LiveViewers tripId={trip.id} currentUserId={currentUserId} />
            <span className="hidden items-center gap-1 rounded-full bg-black/30 px-2 py-1 text-xs sm:inline-flex">
              <VisIcon className="size-3.5" /> {trip.visibility}
              {role && role !== "owner" && ` · ${role}`}
            </span>
            <Link
              href={`${base}/settings#members`}
              className="flex -space-x-2"
              aria-label="Members"
            >
              {members.slice(0, 4).map((m) => (
                <Avatar
                  key={m.userId}
                  src={m.image}
                  name={m.name}
                  size={28}
                  className="ring-2 ring-white"
                />
              ))}
              {members.length > 4 && (
                <span className="flex size-7 items-center justify-center rounded-full bg-white text-xs font-bold text-foreground ring-2 ring-white">
                  +{members.length - 4}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>
      <nav className="scrollbar-none flex gap-1 overflow-x-auto px-2" aria-label="Trip sections">
        {TABS.filter((t) => t.key !== "journal" || trip.kind === "journal" || true).map((t) => (
          <Link
            key={t.key}
            href={t.key ? `${base}/${t.key}` : base}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold",
              current === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {!canManage && !canEdit && role === null && (
        <p className="bg-muted px-4 py-1.5 text-center text-xs text-muted-foreground">
          You're viewing a shared trip.
        </p>
      )}
    </header>
  );
}
