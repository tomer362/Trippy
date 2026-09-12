import { NextResponse } from "next/server";
import { resolveHero } from "@/server/services/destinations";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const hero = await resolveHero(id).catch(() => ({ url: null, credit: null }));
  return NextResponse.json(hero, {
    headers: {
      "Cache-Control": hero.url ? "public, max-age=86400, s-maxage=86400" : "public, max-age=600",
    },
  });
}
