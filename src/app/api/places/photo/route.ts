import { NextResponse } from "next/server";
import { features } from "@/env";
import { getSession } from "@/lib/auth";
import { guard } from "@/server/rate-limit";
import { photoUri } from "@/server/services/google/places";

export const dynamic = "force-dynamic";

/** Redirects to a Google-hosted photo URL so the API key stays on the server. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new NextResponse(null, { status: 401 });
  if (!features.mapsServer) return new NextResponse(null, { status: 503 });
  const limited = await guard(req, "places.photo", session.user.id);
  if (limited) return limited;
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");
  if (!name?.startsWith("places/")) return new NextResponse(null, { status: 400 });
  const width = Math.min(1600, Math.max(80, Number(searchParams.get("w") ?? 640)));
  try {
    const uri = await photoUri(name, width);
    if (!uri) return new NextResponse(null, { status: 404 });
    return NextResponse.redirect(uri, {
      status: 307,
      headers: { "Cache-Control": "private, max-age=3000" },
    });
  } catch (err) {
    console.error("place photo failed", err);
    return new NextResponse(null, { status: 502 });
  }
}
