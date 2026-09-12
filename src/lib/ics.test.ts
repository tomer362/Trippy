import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, foldLine, nextIsoDate } from "./ics";

const NOW = new Date("2026-09-01T10:00:00Z");

describe("escapeText", () => {
  it("escapes the characters iCalendar reserves", () => {
    expect(escapeText("Dinner, wine; maybe\\ later")).toBe("Dinner\\, wine; maybe\\\\ later");
    expect(escapeText("line one\nline two")).toBe("line one\\nline two");
  });
});

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:Short")).toBe("SUMMARY:Short");
  });
  it("folds long lines with a leading space on continuations", () => {
    const folded = foldLine(`SUMMARY:${"a".repeat(200)}`);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(2);
    expect(parts[0]!.length).toBeLessThanOrEqual(75);
    for (const part of parts.slice(1)) expect(part.startsWith(" ")).toBe(true);
  });
});

describe("buildIcs", () => {
  it("writes a calendar with CRLF endings and the required headers", () => {
    const ics = buildIcs("Paris 2026", [], NOW);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("X-WR-CALNAME:Paris 2026");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("writes an all-day event as a DATE value", () => {
    const ics = buildIcs(
      "Trip",
      [
        {
          uid: "day-1@trippy",
          summary: "Day 1",
          start: { date: "2026-10-12" },
          end: { date: "2026-10-13" },
        },
      ],
      NOW,
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20261012");
    expect(ics).toContain("DTEND;VALUE=DATE:20261013");
  });

  it("writes a timed event in UTC", () => {
    const ics = buildIcs(
      "Trip",
      [
        {
          uid: "f1@trippy",
          summary: "Flight",
          start: { dateTime: "2026-10-12T14:30:00Z" },
          end: { dateTime: "2026-10-12T16:05:00Z" },
        },
      ],
      NOW,
    );
    expect(ics).toContain("DTSTART:20261012T143000Z");
    expect(ics).toContain("DTEND:20261012T160500Z");
    expect(ics).toContain("DTSTAMP:20260901T100000Z");
  });

  it("includes optional fields only when present", () => {
    const ics = buildIcs(
      "Trip",
      [
        {
          uid: "a@trippy",
          summary: "Museum",
          start: { date: "2026-10-12" },
          location: "Rue de Rivoli",
          url: "https://example.com",
          description: "Book ahead",
        },
        { uid: "b@trippy", summary: "Nothing else", start: { date: "2026-10-13" } },
      ],
      NOW,
    );
    expect(ics).toContain("LOCATION:Rue de Rivoli");
    expect(ics).toContain("URL:https://example.com");
    expect(ics).toContain("DESCRIPTION:Book ahead");
    const events = ics.split("BEGIN:VEVENT").slice(1);
    expect(events[1]).not.toContain("LOCATION:");
  });
});

describe("nextIsoDate", () => {
  it("advances a day, including across months", () => {
    expect(nextIsoDate("2026-10-12")).toBe("2026-10-13");
    expect(nextIsoDate("2026-10-31")).toBe("2026-11-01");
    expect(nextIsoDate("2026-12-31")).toBe("2027-01-01");
  });
});
