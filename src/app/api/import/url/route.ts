import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { extractFromText, extractPlaceCandidates, fromGoogleMapsUrl } from "@/lib/extract-places";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const schema = z.object({
  url: z.string().url().optional(),
  text: z.string().max(200_000).optional(),
});
const MAX_BYTES = 2_000_000;

/**
 * Reads a page and returns the places it seems to mention, for the user to confirm.
 * Nothing is saved here: extraction is a suggestion, not an import.
 */
export async function POST(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success || (!body.data.url && !body.data.text)) {
    return NextResponse.json({ error: "Paste a link or some text" }, { status: 400 });
  }

  if (body.data.text) {
    return NextResponse.json({ candidates: extractFromText(body.data.text), source: "text" });
  }

  const url = body.data.url!;
  const direct = fromGoogleMapsUrl(url);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Trippy/0.1 (trip planner; +https://github.com/tomer362/Trippy)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        {
          candidates: direct ? [direct] : [],
          error: `That page returned ${res.status}`,
          source: "url",
        },
        { status: direct ? 200 : 502 },
      );
    }
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("text")) {
      return NextResponse.json({
        candidates: direct ? [direct] : [],
        error: "That link isn't a web page",
        source: "url",
      });
    }
    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      while (bytes < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        html += decoder.decode(value, { stream: true });
      }
      await reader.cancel().catch(() => {});
    }
    const candidates = extractPlaceCandidates(html);
    const merged =
      direct && !candidates.some((c) => c.name === direct.name)
        ? [direct, ...candidates]
        : candidates;
    return NextResponse.json({
      candidates: merged,
      title: html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)?.[1]?.trim() ?? null,
      source: "url",
    });
  } catch (err) {
    console.error("import fetch failed", err);
    return NextResponse.json(
      {
        candidates: direct ? [direct] : [],
        error: direct ? null : "Couldn't read that page. Paste the list as text instead.",
        source: "url",
      },
      { status: direct ? 200 : 502 },
    );
  }
}
