import { describe, expect, it } from "vitest";
import {
  boundsOf,
  directionsUrl,
  formatDistance,
  formatDuration,
  haversineMeters,
  padBBox,
} from "./geo";

describe("haversineMeters", () => {
  it("measures a known short hop", () => {
    // Louvre to Musée d'Orsay, roughly 900 m apart.
    const d = haversineMeters({ lat: 48.8606, lng: 2.3376 }, { lat: 48.86, lng: 2.3266 });
    expect(d).toBeGreaterThan(700);
    expect(d).toBeLessThan(1000);
  });
  it("is zero for the same point", () => {
    expect(haversineMeters({ lat: 1, lng: 2 }, { lat: 1, lng: 2 })).toBe(0);
  });
});

describe("bounds", () => {
  it("wraps every point", () => {
    expect(
      boundsOf([
        { lat: 1, lng: 2 },
        { lat: -3, lng: 8 },
      ]),
    ).toEqual([2, -3, 8, 1]);
  });
  it("returns null for no points", () => {
    expect(boundsOf([])).toBeNull();
  });
  it("pads with a floor so single points still get a usable box", () => {
    const [minLng, minLat, maxLng, maxLat] = padBBox([2, 1, 2, 1]);
    expect(maxLng - minLng).toBeCloseTo(0.02);
    expect(maxLat - minLat).toBeCloseTo(0.02);
  });
});

describe("formatting", () => {
  it("switches units at sensible thresholds", () => {
    expect(formatDistance(420)).toBe("420 m");
    expect(formatDistance(4200)).toBe("4.2 km");
    expect(formatDistance(42000)).toBe("42 km");
    expect(formatDistance(null)).toBe("—");
    expect(formatDistance(4200, "imperial")).toBe("2.6 mi");
  });
  it("formats durations as minutes and hours", () => {
    expect(formatDuration(90)).toBe("2 min");
    expect(formatDuration(3600)).toBe("1 hr");
    expect(formatDuration(5400)).toBe("1 hr 30 min");
    expect(formatDuration(undefined)).toBe("—");
  });
});

describe("directionsUrl", () => {
  it("needs at least two stops", () => {
    expect(directionsUrl([{ lat: 1, lng: 2 }], "drive")).toBeNull();
  });
  it("builds a multi-stop link with the right travel mode", () => {
    const url = directionsUrl(
      [
        { lat: 1, lng: 2, placeId: "A" },
        { lat: 3, lng: 4 },
        { lat: 5, lng: 6, placeId: "B" },
      ],
      "walk",
    )!;
    expect(url).toContain("travelmode=walking");
    expect(url).toContain("origin=1%2C2");
    expect(url).toContain("destination=5%2C6");
    expect(url).toContain("waypoints=3%2C4");
    expect(url).toContain("origin_place_id=A");
    expect(url).toContain("destination_place_id=B");
  });
});
