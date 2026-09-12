import { z } from "zod";
import type { TravelMode } from "@/lib/types";

/**
 * Prompt construction and result shaping for the optional day-planning assistant.
 * Kept free of server imports so the prompt and the filtering rules can be unit tested.
 */

export const suggestedStopSchema = z.object({
  name: z.string().min(1).max(120).describe("The common name of the place"),
  searchQuery: z
    .string()
    .min(1)
    .max(200)
    .describe("A map search that finds exactly this place, including the city"),
  category: z
    .string()
    .max(40)
    .describe("One short label such as sight, museum, restaurant, park, viewpoint"),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .describe("Suggested arrival in 24-hour HH:MM, or null when timing is flexible"),
  durationMin: z.number().int().min(15).max(600).describe("How long to spend there, in minutes"),
  why: z.string().max(300).describe("One sentence on why it fits this day"),
});

export const daySuggestionSchema = z.object({
  summary: z.string().max(300).describe("One sentence describing the shape of the day"),
  stops: z.array(suggestedStopSchema).min(1).max(8),
});

export type SuggestedStop = z.infer<typeof suggestedStopSchema>;
export type DaySuggestion = z.infer<typeof daySuggestionSchema>;

export type DayContext = {
  tripName: string;
  destinations: string[];
  dayLabel: string;
  date: string | null;
  travelMode: TravelMode;
  /** Stops already on this day, in order. */
  existingStops: Array<{ name: string; startTime: string | null }>;
  /** Places saved to the trip but not yet on any day. */
  savedPlaces: string[];
  /** How many stops the day should end up with. */
  targetStops: number;
  /** Categories this traveller tends to pick, from their past trips. */
  favouriteCategories: string[];
  /** Free-text steer typed by the user, e.g. "rainy day, mostly indoors". */
  request: string | null;
};

export const DAY_SYSTEM_PROMPT = [
  "You help travellers plan one day of a trip.",
  "Suggest real, currently operating places that a visitor can actually go to, never invented ones.",
  "Keep the day geographically sensible: group stops that are close together and order them so the day flows.",
  "Respect what is already scheduled — never repeat a place that is already on the day or already saved to the trip.",
  "Vary the kinds of stops, and include a meal when the day spans one.",
  "Write searchQuery so a maps search returns exactly that place: include the place name and its city.",
  "Keep every why under 20 words.",
].join(" ");

const MODE_LABEL: Record<TravelMode, string> = {
  drive: "driving",
  walk: "walking",
  transit: "public transport",
  bicycle: "cycling",
};

function bullets(lines: string[]): string {
  return lines.map((l) => `- ${l}`).join("\n");
}

/** Renders the trip context the model needs, in a stable order so responses stay comparable. */
export function buildDayPrompt(ctx: DayContext): string {
  const parts: string[] = [];
  parts.push(`Trip: ${ctx.tripName}`);
  parts.push(`Destinations: ${ctx.destinations.join(", ") || "not set"}`);
  parts.push(`Planning: ${ctx.dayLabel}${ctx.date ? ` (${ctx.date})` : ""}`);
  parts.push(`Getting around by: ${MODE_LABEL[ctx.travelMode]}`);

  if (ctx.existingStops.length > 0) {
    parts.push(
      `Already on this day, in order:\n${bullets(
        ctx.existingStops.map((s) => (s.startTime ? `${s.startTime} ${s.name}` : s.name)),
      )}`,
    );
  } else {
    parts.push("Nothing is scheduled on this day yet.");
  }

  if (ctx.savedPlaces.length > 0) {
    parts.push(
      `Saved to the trip but not scheduled (do not suggest these again):\n${bullets(ctx.savedPlaces)}`,
    );
  }
  if (ctx.favouriteCategories.length > 0) {
    parts.push(`This traveller usually goes for: ${ctx.favouriteCategories.join(", ")}.`);
  }

  const wanted = Math.max(1, ctx.targetStops - ctx.existingStops.length);
  parts.push(
    ctx.existingStops.length > 0
      ? `Suggest ${wanted} more stop${wanted === 1 ? "" : "s"} that fit around what is already there.`
      : `Suggest ${wanted} stop${wanted === 1 ? "" : "s"} for the whole day.`,
  );
  if (ctx.request) parts.push(`The traveller asks: ${ctx.request}`);
  return parts.join("\n\n");
}

/** Loose comparison so "The Louvre" and "Louvre Museum " are treated as the same place. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .replace(/ø/g, "o")
    .replace(/^(the|le|la|les|el|il)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Drops suggestions the trip already has, and any the model repeated, keeping the first. */
export function dedupeStops(stops: SuggestedStop[], known: string[]): SuggestedStop[] {
  const seen = new Set(known.map(normalizeName).filter(Boolean));
  const out: SuggestedStop[] = [];
  for (const stop of stops) {
    const key = normalizeName(stop.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(stop);
  }
  return out;
}

/** Orders by suggested time so the list reads like a day; untimed stops keep their order at the end. */
export function orderByTime(stops: SuggestedStop[]): SuggestedStop[] {
  return [...stops].sort((a, b) => {
    if (a.startTime === b.startTime) return 0;
    if (a.startTime === null) return 1;
    if (b.startTime === null) return -1;
    return a.startTime.localeCompare(b.startTime);
  });
}
