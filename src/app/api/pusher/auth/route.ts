import { NextResponse } from "next/server";
import { features } from "@/env";
import { getSession } from "@/lib/auth";
import { getTripAccess } from "@/server/authz";
import { authorizeChannel, tripIdFromChannel } from "@/server/services/realtime";

/** Authorises a presence subscription only for people who can see the trip. */
export async function POST(req: Request) {
  if (!features.realtime)
    return NextResponse.json({ error: "realtime_not_configured" }, { status: 503 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const socketId = String(form.get("socket_id") ?? "");
  const channel = String(form.get("channel_name") ?? "");
  const tripId = tripIdFromChannel(channel);
  if (!socketId || !tripId) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const access = await getTripAccess(tripId, session.user.id);
  if (!access?.canView) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const auth = authorizeChannel(socketId, channel, {
      id: session.user.id,
      name: session.user.name,
      image: session.user.image ?? null,
    });
    return NextResponse.json(auth);
  } catch (err) {
    console.error("pusher auth failed", err);
    return NextResponse.json({ error: "auth_failed" }, { status: 500 });
  }
}
