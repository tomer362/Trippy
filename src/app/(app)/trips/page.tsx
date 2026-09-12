import { Plus } from "lucide-react";
import Link from "next/link";
import { TripCard } from "@/components/trips/trip-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";
import { listTripsForUser } from "@/server/queries/trips";

export const metadata = { title: "My trips" };

const FILTERS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "shared", label: "Shared with me" },
  { key: "guides", label: "Guides & journals" },
  { key: "archived", label: "Archived" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requireUser();
  const { filter } = await searchParams;
  const active: FilterKey = FILTERS.some((f) => f.key === filter)
    ? (filter as FilterKey)
    : "upcoming";
  const all = await listTripsForUser(user.id);
  const today = new Date().toISOString().slice(0, 10);
  const visible = all.filter((t) => {
    if (active === "archived") return t.archived;
    if (t.archived) return false;
    if (active === "shared") return t.role !== "owner";
    if (active === "guides") return t.kind !== "plan";
    if (active === "past") return t.kind === "plan" && t.endDate !== null && t.endDate < today;
    return t.kind === "plan" && (t.endDate === null || t.endDate >= today);
  });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">My trips</h1>
        <Button asChild>
          <Link href="/trips/new">
            <Plus /> New trip
          </Link>
        </Button>
      </div>
      <nav className="scrollbar-none mb-6 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "upcoming" ? "/trips" : `/trips?filter=${f.key}`}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold ${active === f.key ? "bg-foreground text-background" : "bg-muted hover:bg-muted/70"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {visible.length === 0 ? (
        <EmptyState
          title={all.length === 0 ? "No trips yet" : "Nothing here"}
          description={
            all.length === 0
              ? "Create your first trip: pick where you're going, then start saving places."
              : "Try another filter or create a new trip."
          }
          action={
            <Button asChild variant="outline">
              <Link href="/trips/new">Plan a trip</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((t) => (
            <TripCard key={t.id} trip={t} />
          ))}
        </div>
      )}
    </main>
  );
}
