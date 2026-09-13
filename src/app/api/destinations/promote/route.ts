import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { guard } from "@/server/rate-limit";
import { promoteFromGoogle } from "@/server/services/destinations";

const schema = z.object({ placeId: z.string().min(3), session: z.string().optional() });

export async function POST(req: Request) {
  const user = (await getSession())?.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await guard(req, "destinations.promote", user.id);
  if (limited) return limited;
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    const destination = await promoteFromGoogle(body.data.placeId, body.data.session);
    return NextResponse.json({ destination });
  } catch (err) {
    console.error("promotion failed", err);
    return NextResponse.json({ error: "promotion_failed" }, { status: 502 });
  }
}
