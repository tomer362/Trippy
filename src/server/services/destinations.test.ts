import { describe, expect, it } from "vitest";
import { buildSearchText, kindFromTypes, unionBBox } from "./destinations";

describe("kindFromTypes", () => {
  it("maps Google place types onto destination kinds", () => {
    expect(kindFromTypes(["country", "political"])).toBe("country");
    expect(kindFromTypes(["locality", "political"])).toBe("city");
    expect(kindFromTypes(["administrative_area_level_1"])).toBe("region");
    expect(kindFromTypes(["colloquial_area", "geocode"])).toBe("region");
    expect(kindFromTypes(["archipelago"])).toBe("island");
    expect(kindFromTypes(["neighborhood"])).toBe("neighborhood");
    expect(kindFromTypes(["national_park"])).toBe("park");
  });
  it("falls back to the name when the type list is unhelpful", () => {
    expect(kindFromTypes(["geocode"], "Canary Islands")).toBe("island");
    expect(kindFromTypes([], "Somewhere")).toBe("city");
  });
  it("prefers country over every other signal", () => {
    expect(kindFromTypes(["country", "locality"], "Island Nation")).toBe("country");
  });
});

describe("buildSearchText", () => {
  it("indexes the name, alternates and ancestors together so children match a region query", () => {
    const text = buildSearchText("Nice", [], ["French Riviera - Cote d'Azur", "France"]);
    expect(text).toContain("french riviera");
    expect(text.startsWith("nice")).toBe(true);
  });
});

describe("unionBBox", () => {
  it("returns a centred view for a single point destination", () => {
    expect(unionBBox([{ lat: 48.85, lng: 2.35, bbox: null, zoom: 11 }])).toEqual({
      center: { lat: 48.85, lng: 2.35 },
      zoom: 11,
    });
  });
  it("unions boxes across several destinations", () => {
    const result = unionBBox([
      { lat: 43.7, lng: 7.26, bbox: [5.7, 43.0, 7.75, 44.0], zoom: 8 },
      { lat: 48.85, lng: 2.35, bbox: [2.2, 48.8, 2.5, 49.0], zoom: 11 },
    ]);
    expect(result).toEqual({ bbox: [2.2, 43.0, 7.75, 49.0] });
  });
  it("pads point destinations when mixed with boxed ones", () => {
    const result = unionBBox([
      { lat: 43.7, lng: 7.26, bbox: null, zoom: 11 },
      { lat: 44.0, lng: 8.0, bbox: null, zoom: 11 },
    ]) as { bbox: [number, number, number, number] };
    expect(result.bbox[0]).toBeCloseTo(6.96);
    expect(result.bbox[3]).toBeCloseTo(44.3);
  });
  it("returns null with nothing selected", () => {
    expect(unionBBox([])).toBeNull();
  });
});
