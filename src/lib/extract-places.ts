/**
 * Pulls candidate place names out of a pasted link or page.
 *
 * This is deliberately a *suggestion* engine: everything it finds is shown for review
 * before anything is saved, because no heuristic reads a blog post perfectly.
 */
export type PlaceCandidate = {
  name: string;
  /** Where in the source it came from, shown so the user can judge it. */
  source: "google-maps-url" | "heading" | "list" | "link" | "text";
  /** Coordinates when the link carried them. */
  lat?: number;
  lng?: number;
};

const NOISE = new Set([
  "google maps",
  "read more",
  "share",
  "directions",
  "home",
  "about",
  "contact",
  "privacy policy",
  "terms",
  "subscribe",
  "newsletter",
  "comments",
  "related posts",
  "table of contents",
  "pin it",
  "save",
  "menu",
  "search",
]);

function clean(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—•*#0-9.)]+/, "")
    .trim();
}

function plausible(name: string): boolean {
  if (name.length < 3 || name.length > 80) return false;
  if (NOISE.has(name.toLowerCase())) return false;
  if (!/[A-Za-zÀ-ɏ]/.test(name)) return false;
  // Sentences and questions are prose, not names.
  if (/[.!?]$/.test(name) || name.split(" ").length > 9) return false;
  return true;
}

function push(out: Map<string, PlaceCandidate>, candidate: PlaceCandidate) {
  const name = clean(candidate.name);
  if (!plausible(name)) return;
  const key = name.toLowerCase();
  const existing = out.get(key);
  if (!existing || (candidate.lat !== undefined && existing.lat === undefined))
    out.set(key, { ...candidate, name });
}

/** Reads a place out of any Google Maps link shape we can recognise. */
export function fromGoogleMapsUrl(url: string): PlaceCandidate | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (
    !/(^|\.)google\.[a-z.]+$/.test(parsed.hostname) &&
    parsed.hostname !== "maps.app.goo.gl" &&
    parsed.hostname !== "goo.gl"
  )
    return null;

  const coords = parsed.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const lat = coords ? Number(coords[1]) : undefined;
  const lng = coords ? Number(coords[2]) : undefined;

  const placeSegment = parsed.pathname.match(/\/maps\/place\/([^/@]+)/);
  if (placeSegment?.[1]) {
    const name = decodeURIComponent(placeSegment[1].replace(/\+/g, " "));
    return { name, source: "google-maps-url", lat, lng };
  }
  const query = parsed.searchParams.get("q") ?? parsed.searchParams.get("query");
  if (query && !/^-?\d+\.\d+,/.test(query))
    return { name: query, source: "google-maps-url", lat, lng };
  return null;
}

const TAG_PATTERNS: Array<{ re: RegExp; source: PlaceCandidate["source"] }> = [
  { re: /<h[1-4][^>]*>([\s\S]{2,120}?)<\/h[1-4]>/gi, source: "heading" },
  { re: /<li[^>]*>([\s\S]{2,120}?)<\/li>/gi, source: "list" },
  { re: /<strong[^>]*>([\s\S]{2,120}?)<\/strong>/gi, source: "list" },
];

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

/**
 * Extracts candidates from a fetched page: Google Maps links first (they name a real
 * place), then headings and list items, which is how travel articles list their picks.
 */
export function extractPlaceCandidates(html: string, limit = 60): PlaceCandidate[] {
  const out = new Map<string, PlaceCandidate>();

  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const candidate = fromGoogleMapsUrl(match[1] ?? "");
    if (candidate) push(out, candidate);
  }
  for (const { re, source } of TAG_PATTERNS) {
    for (const match of html.matchAll(re)) {
      push(out, { name: stripTags(match[1] ?? ""), source });
    }
  }
  return [...out.values()].slice(0, limit);
}

/** Extracts candidates from plain pasted text: one place per line. */
export function extractFromText(text: string, limit = 60): PlaceCandidate[] {
  const out = new Map<string, PlaceCandidate>();
  for (const line of text.split(/\r?\n/)) {
    const fromUrl = line.trim().startsWith("http") ? fromGoogleMapsUrl(line.trim()) : null;
    push(out, fromUrl ?? { name: line, source: "text" });
  }
  return [...out.values()].slice(0, limit);
}
