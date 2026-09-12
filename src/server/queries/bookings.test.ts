import { describe, expect, it } from "vitest";
import { type LodgingDTO, lodgingByDay } from "./bookings";

function stay(id: string, checkIn: string, checkOut: string): LodgingDTO {
  return {
    id,
    name: id,
    address: null,
    lat: null,
    lng: null,
    placeId: null,
    googlePlaceId: null,
    checkIn,
    checkOut,
    checkInTime: null,
    checkOutTime: null,
    confirmationNo: null,
    price: null,
    currency: null,
    bookingUrl: null,
    notes: null,
    nights: 0,
    version: 1,
  };
}

const days = [
  { id: "d0", date: "2026-10-12" },
  { id: "d1", date: "2026-10-13" },
  { id: "d2", date: "2026-10-14" },
  { id: "d3", date: "2026-10-15" },
];

describe("lodgingByDay", () => {
  it("shows a stay on every night it covers plus the check-out morning", () => {
    const map = lodgingByDay([stay("hotel", "2026-10-12", "2026-10-14")], days);
    expect(map.get("d0")?.map((l) => l.id)).toEqual(["hotel"]);
    expect(map.get("d1")?.map((l) => l.id)).toEqual(["hotel"]);
    expect(map.get("d2")?.map((l) => l.id)).toEqual(["hotel"]);
    expect(map.has("d3")).toBe(false);
  });

  it("handles back-to-back stays on the changeover day", () => {
    const map = lodgingByDay(
      [stay("first", "2026-10-12", "2026-10-13"), stay("second", "2026-10-13", "2026-10-15")],
      days,
    );
    expect(map.get("d1")?.map((l) => l.id)).toEqual(["second", "first"]);
    expect(map.get("d3")?.map((l) => l.id)).toEqual(["second"]);
  });

  it("lists overlapping stays together", () => {
    const map = lodgingByDay(
      [stay("roomA", "2026-10-12", "2026-10-14"), stay("roomB", "2026-10-12", "2026-10-14")],
      days,
    );
    expect(map.get("d0")).toHaveLength(2);
  });

  it("skips days without dates", () => {
    const map = lodgingByDay(
      [stay("hotel", "2026-10-12", "2026-10-14")],
      [{ id: "x", date: null }],
    );
    expect(map.size).toBe(0);
  });
});
