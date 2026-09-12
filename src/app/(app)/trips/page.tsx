import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export const metadata = { title: "My trips" };

export default function TripsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">My trips</h1>
        <Button asChild>
          <Link href="/trips/new">
            <Plus /> New trip
          </Link>
        </Button>
      </div>
      <EmptyState
        title="No trips yet"
        description="Create your first trip: pick where you're going, then start saving places."
        action={
          <Button asChild variant="outline">
            <Link href="/trips/new">Plan a trip</Link>
          </Button>
        }
      />
    </main>
  );
}
