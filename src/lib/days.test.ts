import { describe, expect, it } from "vitest";
import {
  buildDays,
  dayCountBetween,
  daysCoveredByStay,
  formatDateRange,
  reconcileDays,
} from "./days";

describe("buildDays", () => {
  it("creates one day per calendar day when dates are set", () => {
    const days = buildDays({ startDate: "2026-10-12", endDate: "2026-10-14", dayCount: 99 });
    expect(days).toEqual([
      { dayIndex: 0, date: "2026-10-12" },
      { dayIndex: 1, date: "2026-10-13" },
      { dayIndex: 2, date: "2026-10-14" },
    ]);
  });
  it("creates undated days from dayCount", () => {
    expect(buildDays({ startDate: null, endDate: null, dayCount: 2 })).toEqual([
      { dayIndex: 0, date: null },
      { dayIndex: 1, date: null },
    ]);
  });
  it("clamps dayCount", () => {
    expect(buildDays({ startDate: null, endDate: null, dayCount: 0 })).toHaveLength(1);
    expect(buildDays({ startDate: null, endDate: null, dayCount: 500 })).toHaveLength(60);
  });
});

describe("reconcileDays", () => {
  const existing = buildDays({ startDate: "2026-10-12", endDate: "2026-10-14", dayCount: 3 });
  it("shifts dates without changing indexes when the trip moves", () => {
    const r = reconcileDays(existing, {
      startDate: "2026-11-01",
      endDate: "2026-11-03",
      dayCount: 3,
    });
    expect(r.create).toEqual([]);
    expect(r.drop).toEqual([]);
    expect(r.update.map((d) => d.date)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });
  it("drops trailing days when shortened and appends when lengthened", () => {
    const shorter = reconcileDays(existing, {
      startDate: "2026-10-12",
      endDate: "2026-10-12",
      dayCount: 1,
    });
    expect(shorter.drop).toEqual([1, 2]);
    const longer = reconcileDays(existing, {
      startDate: "2026-10-12",
      endDate: "2026-10-16",
      dayCount: 5,
    });
    expect(longer.create.map((d) => d.dayIndex)).toEqual([3, 4]);
  });
  it("detaches dates when switching to no-dates mode", () => {
    const r = reconcileDays(existing, { startDate: null, endDate: null, dayCount: 3 });
    expect(r.update.every((d) => d.date === null)).toBe(true);
  });
});

describe("helpers", () => {
  it("counts inclusive days", () => {
    expect(dayCountBetween("2026-01-01", "2026-01-01")).toBe(1);
    expect(dayCountBetween("2026-01-01", "2026-01-05")).toBe(5);
  });
  it("formats ranges", () => {
    expect(formatDateRange("2026-10-12", "2026-10-14")).toBe("12 – 14 Oct 2026");
    expect(formatDateRange("2026-10-30", "2026-11-02")).toBe("30 Oct – 2 Nov 2026");
    expect(formatDateRange(null, null, 4)).toBe("4 days");
  });
  it("finds nights covered by a stay", () => {
    const days = buildDays({ startDate: "2026-10-12", endDate: "2026-10-16", dayCount: 5 });
    expect(daysCoveredByStay(days, "2026-10-13", "2026-10-15")).toEqual([1, 2]);
  });
});
