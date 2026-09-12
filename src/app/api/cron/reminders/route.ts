import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { db } from "@/server/db";
import { tripMembers, trips, user } from "@/server/db/schema";
import { sendTripReminder } from "@/server/services/email";
import { sendPushToUsers } from "@/server/services/push";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isoIn(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Daily nudge for trips starting tomorrow or today. Runs from the scheduled workflow, so
 * it is safe to call more than once a day: the message is the same either way.
 */
export async function POST(req: Request) {
  if (!env.CRON_SECRET) return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = isoIn(0);
  const tomorrow = isoIn(1);
  const starting = await db
    .select({ id: trips.id, name: trips.name, startDate: trips.startDate })
    .from(trips)
    .where(and(inArray(trips.startDate, [today, tomorrow]), isNull(trips.archivedAt)));

  let pushed = 0;
  let emailed = 0;

  for (const trip of starting) {
    const members = await db
      .select({ userId: tripMembers.userId, email: user.email })
      .from(tripMembers)
      .innerJoin(user, eq(user.id, tripMembers.userId))
      .where(eq(tripMembers.tripId, trip.id));
    const startsIn = trip.startDate === today ? "today" : "tomorrow";
    const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/t/${trip.id}`;

    const result = await sendPushToUsers(
      members.map((m) => m.userId),
      {
        title: `${trip.name} starts ${startsIn}`,
        body: "Your plan is ready. Tap to open it.",
        url,
        tag: `trip-${trip.id}`,
      },
      "notifyTripReminders",
    );
    pushed += result.sent;

    // Email only when push reached nobody, so nobody is told twice.
    if (result.sent === 0) {
      for (const member of members) {
        const sentEmail = await sendTripReminder({
          to: member.email,
          tripName: trip.name,
          url,
          startsIn,
        });
        if (sentEmail.sent) emailed += 1;
      }
    }
  }

  return NextResponse.json({ trips: starting.length, pushed, emailed });
}
