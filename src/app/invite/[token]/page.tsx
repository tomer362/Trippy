import { eq } from "drizzle-orm";
import { ArrowRight, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GoogleSignInButton } from "@/components/auth/google-sign-in";
import { AcceptInviteButton } from "@/components/trips/accept-invite-button";
import { features } from "@/env";
import { getSession } from "@/lib/auth";
import { formatDateRange } from "@/lib/days";
import { db } from "@/server/db";
import { tripInvites, trips, user } from "@/server/db/schema";
import { getTripDestinations } from "@/server/queries/trips";

export const metadata = { title: "Trip invite", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [row] = await db
    .select({ invite: tripInvites, trip: trips, inviterName: user.name })
    .from(tripInvites)
    .innerJoin(trips, eq(trips.id, tripInvites.tripId))
    .leftJoin(user, eq(user.id, tripInvites.createdBy))
    .where(eq(tripInvites.token, token))
    .limit(1);
  if (!row) notFound();

  const expired = row.invite.expiresAt !== null && row.invite.expiresAt.getTime() < Date.now();
  const usedUp = row.invite.maxUses !== null && row.invite.uses >= row.invite.maxUses;
  const dead = Boolean(row.invite.revokedAt) || expired || usedUp;
  const session = await getSession();
  const destinations = await getTripDestinations(row.trip.id);

  return (
    <main className="sunset-bg flex min-h-dvh flex-col items-center justify-center p-5">
      <div className="w-full max-w-md rounded-[2rem] border border-white/70 bg-white/70 p-6 text-center shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
        <Users className="mx-auto mb-3 size-8 text-primary" />
        <p className="text-sm text-muted-foreground">
          {row.inviterName ?? "A trip mate"} invited you to
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{row.trip.name}</h1>
        <p className="mt-1 text-muted-foreground">
          {destinations.map((d) => d.name).join(" · ")}
          {destinations.length > 0 && " · "}
          {formatDateRange(row.trip.startDate, row.trip.endDate, row.trip.dayCount)}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          You'll be able to {row.invite.role === "viewer" ? "view and comment on" : "edit"} this
          trip.
        </p>

        <div className="mt-6">
          {dead ? (
            <p className="rounded-2xl bg-muted p-3 text-sm">
              This invite is no longer valid. Ask {row.inviterName ?? "the trip owner"} for a fresh
              link.
            </p>
          ) : session ? (
            <AcceptInviteButton token={token} />
          ) : (
            <div className="space-y-3">
              <GoogleSignInButton next={`/invite/${token}`} enabled={features.googleAuth} />
              <p className="text-xs text-muted-foreground">Sign in to join. It's free.</p>
            </div>
          )}
        </div>

        {session && (
          <Link
            href="/trips"
            className="mt-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            My trips <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
    </main>
  );
}
