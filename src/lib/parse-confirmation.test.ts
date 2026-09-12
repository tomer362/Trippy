import { describe, expect, it } from "vitest";
import {
  detectKind,
  findConfirmation,
  findDates,
  findPrice,
  findTimes,
  parseConfirmation,
} from "./parse-confirmation";

describe("detectKind", () => {
  it("recognises the common booking types", () => {
    expect(detectKind("Your flight is confirmed, boarding at gate 12")).toBe("flight");
    expect(detectKind("Eurostar train from platform 5")).toBe("train");
    expect(detectKind("Car rental pick-up location: Nice Airport")).toBe("car");
    expect(detectKind("Table for 4 at Osteria")).toBe("restaurant");
    expect(detectKind("Your ferry sailing is booked")).toBe("ferry");
    expect(detectKind("Admission tickets for the museum")).toBe("activity");
    expect(detectKind("Thanks for your order")).toBe("other");
  });
});

describe("findDates", () => {
  it("reads ISO, long-form and numeric dates", () => {
    expect(findDates("Departs 2026-10-12")).toEqual(["2026-10-12"]);
    expect(findDates("Departs 12 Oct 2026")).toEqual(["2026-10-12"]);
    expect(findDates("Departs October 12, 2026")).toEqual(["2026-10-12"]);
    expect(findDates("Departs 12/10/2026")).toEqual(["2026-10-12"]);
  });
  it("keeps multiple dates in order and deduplicates", () => {
    expect(findDates("In 2026-10-12 out 2026-10-16 (2026-10-12)")).toEqual([
      "2026-10-12",
      "2026-10-16",
    ]);
  });
  it("rejects impossible dates", () => {
    expect(findDates("2026-13-45")).toEqual([]);
  });
});

describe("findTimes", () => {
  it("normalises am/pm to 24-hour", () => {
    expect(findTimes("Boarding 2:30 PM")).toEqual(["14:30"]);
    expect(findTimes("Check-in 12:15 AM")).toEqual(["00:15"]);
    expect(findTimes("Arrive 18:45")).toEqual(["18:45"]);
    expect(findTimes("Dinner at 8 pm")).toEqual(["20:00"]);
  });
  it("ignores nonsense clock values", () => {
    expect(findTimes("Ref 99:99")).toEqual([]);
  });
});

describe("findConfirmation", () => {
  it("prefers a labelled code", () => {
    expect(findConfirmation("Confirmation number: XY7H2K")).toBe("XY7H2K");
    expect(findConfirmation("Record locator ABC123")).toBe("ABC123");
    expect(findConfirmation("Booking reference: 4JK9QP")).toBe("4JK9QP");
  });
  it("returns null when there is nothing to find", () => {
    expect(findConfirmation("Thanks for booking with us")).toBeNull();
  });
});

describe("findPrice", () => {
  it("handles symbols and currency codes", () => {
    expect(findPrice("Total: $1,240.50")).toEqual({ price: "1240.50", currency: "USD" });
    expect(findPrice("Total €89")).toEqual({ price: "89", currency: "EUR" });
    expect(findPrice("Total THB 3,400")).toEqual({ price: "3400", currency: "THB" });
  });
});

describe("parseConfirmation", () => {
  it("pulls a flight apart into structured fields", () => {
    const parsed = parseConfirmation(
      `Your flight is confirmed
       Confirmation number: XY7H2K
       LH 1425  FRA -> NCE
       Departs 12 Oct 2026 at 2:30 PM, arrives 4:05 PM
       Total: €212.40`,
    );
    expect(parsed.kind).toBe("flight");
    expect(parsed.confirmationNo).toBe("XY7H2K");
    expect(parsed.details.number).toBe("LH1425");
    expect(parsed.details.fromCode).toBe("FRA");
    expect(parsed.details.toCode).toBe("NCE");
    expect(parsed.startDate).toBe("2026-10-12");
    expect(parsed.startTime).toBe("14:30");
    expect(parsed.price).toBe("212.40");
    expect(parsed.currency).toBe("EUR");
    expect(parsed.title).toContain("FRA → NCE");
  });

  it("pulls a restaurant booking apart", () => {
    const parsed = parseConfirmation(
      "Osteria Francescana\nTable for 2 on 2026-10-14 at 20:00\nReservation code: RS88QW",
    );
    expect(parsed.kind).toBe("restaurant");
    expect(parsed.details.partySize).toBe(2);
    expect(parsed.startTime).toBe("20:00");
    expect(parsed.confirmationNo).toBe("RS88QW");
  });

  it("warns when it cannot find a date or time", () => {
    const parsed = parseConfirmation("Thanks for your booking");
    expect(parsed.kind).toBe("other");
    expect(parsed.warnings).toHaveLength(2);
  });
});
