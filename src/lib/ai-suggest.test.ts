import { describe, expect, it } from "vitest";
import {
  buildDayPrompt,
  type DayContext,
  daySuggestionSchema,
  dedupeStops,
  normalizeName,
  orderByTime,
  type SuggestedStop,
} from "./ai-suggest";

function stop(partial: Partial<SuggestedStop>): SuggestedStop {
  return {
    name: "Somewhere",
    searchQuery: "Somewhere, Lisbon",
    category: "sight",
    startTime: null,
    durationMin: 60,
    why: "Nice",
    ...partial,
  };
}

const base: DayContext = {
  tripName: "Portugal in spring",
  destinations: ["Lisbon", "Sintra"],
  dayLabel: "Day 2",
  date: "2026-04-14",
  travelMode: "walk",
  existingStops: [],
  savedPlaces: [],
  targetStops: 4,
  favouriteCategories: [],
  request: null,
};

describe("buildDayPrompt", () => {
  it("asks for the whole day when nothing is scheduled", () => {
    const prompt = buildDayPrompt(base);
    expect(prompt).toContain("Portugal in spring");
    expect(prompt).toContain("Lisbon, Sintra");
    expect(prompt).toContain("Day 2 (2026-04-14)");
    expect(prompt).toContain("walking");
    expect(prompt).toContain("Nothing is scheduled");
    expect(prompt).toContain("Suggest 4 stops for the whole day");
  });

  it("asks only for the gap when stops already exist", () => {
    const prompt = buildDayPrompt({
      ...base,
      existingStops: [
        { name: "Jerónimos Monastery", startTime: "10:00" },
        { name: "Belém Tower", startTime: null },
      ],
    });
    expect(prompt).toContain("10:00 Jerónimos Monastery");
    expect(prompt).toContain("- Belém Tower");
    expect(prompt).toContain("Suggest 2 more stops");
  });

  it("never asks for fewer than one stop on a full day", () => {
    const prompt = buildDayPrompt({
      ...base,
      targetStops: 2,
      existingStops: [
        { name: "A", startTime: null },
        { name: "B", startTime: null },
        { name: "C", startTime: null },
      ],
    });
    expect(prompt).toContain("Suggest 1 more stop that");
  });

  it("lists saved places as off limits and passes the traveller's steer through", () => {
    const prompt = buildDayPrompt({
      ...base,
      savedPlaces: ["Time Out Market"],
      favouriteCategories: ["museums", "cafes"],
      request: "rainy day, mostly indoors",
    });
    expect(prompt).toContain("do not suggest these again");
    expect(prompt).toContain("Time Out Market");
    expect(prompt).toContain("museums, cafes");
    expect(prompt).toContain("rainy day, mostly indoors");
  });
});

describe("normalizeName", () => {
  it("ignores case, accents, articles and punctuation", () => {
    expect(normalizeName("The Louvre")).toBe(normalizeName("louvre"));
    expect(normalizeName("Café  d'Orsay!")).toBe("cafe d orsay");
  });
});

describe("dedupeStops", () => {
  it("removes places the trip already has", () => {
    const out = dedupeStops(
      [stop({ name: "The Louvre" }), stop({ name: "Musée d'Orsay" })],
      ["louvre"],
    );
    expect(out.map((s) => s.name)).toEqual(["Musée d'Orsay"]);
  });

  it("keeps the first of a repeated suggestion", () => {
    const out = dedupeStops(
      [stop({ name: "Sacré-Cœur", why: "first" }), stop({ name: "sacre coeur", why: "second" })],
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.why).toBe("first");
  });
});

describe("orderByTime", () => {
  it("sorts timed stops first, in clock order", () => {
    const out = orderByTime([
      stop({ name: "Late", startTime: "18:00" }),
      stop({ name: "Flexible", startTime: null }),
      stop({ name: "Early", startTime: "09:30" }),
    ]);
    expect(out.map((s) => s.name)).toEqual(["Early", "Late", "Flexible"]);
  });
});

describe("daySuggestionSchema", () => {
  it("rejects times that are not 24-hour clock values", () => {
    const bad = { summary: "x", stops: [stop({ startTime: "9:00" })] };
    expect(daySuggestionSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts a well-formed suggestion", () => {
    const good = { summary: "A gentle day", stops: [stop({ startTime: "09:00" })] };
    expect(daySuggestionSchema.safeParse(good).success).toBe(true);
  });
});
