import { describe, expect, it } from "vitest";
import { allocate, formatMoney, toCents } from "./money";
import { computeBalances, computeShares, SplitError, settleUp, totalsBy } from "./split";

describe("allocate", () => {
  it("never loses or invents a cent", () => {
    const parts = allocate(1000, [1, 1, 1]);
    expect(parts).toEqual([334, 333, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });
  it("splits in proportion to weights", () => {
    expect(allocate(900, [2, 1])).toEqual([600, 300]);
  });
  it("falls back to an even split when weights are unusable", () => {
    expect(allocate(100, [0, 0])).toEqual([50, 50]);
  });
  it("handles negative totals (refunds)", () => {
    const parts = allocate(-1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-1000);
  });
});

describe("computeShares", () => {
  const three = [{ userId: "a" }, { userId: "b" }, { userId: "c" }];

  it("divides equally and gives leftover cents away deterministically", () => {
    const shares = computeShares(1000, "equal", three, "a");
    expect(shares).toEqual([
      { userId: "a", amountCents: 334 },
      { userId: "b", amountCents: 333 },
      { userId: "c", amountCents: 333 },
    ]);
  });

  it("respects shares", () => {
    const shares = computeShares(
      1200,
      "shares",
      [
        { userId: "a", weight: 2 },
        { userId: "b", weight: 1 },
      ],
      "a",
    );
    expect(shares.map((s) => s.amountCents)).toEqual([800, 400]);
  });

  it("respects percentages and rejects ones that don't add up", () => {
    const shares = computeShares(
      1000,
      "percent",
      [
        { userId: "a", weight: 70 },
        { userId: "b", weight: 30 },
      ],
      "a",
    );
    expect(shares.map((s) => s.amountCents)).toEqual([700, 300]);
    expect(() =>
      computeShares(
        1000,
        "percent",
        [
          { userId: "a", weight: 70 },
          { userId: "b", weight: 20 },
        ],
        "a",
      ),
    ).toThrow(SplitError);
  });

  it("accepts exact amounts only when they add up", () => {
    const shares = computeShares(
      1000,
      "exact",
      [
        { userId: "a", exactCents: 600 },
        { userId: "b", exactCents: 400 },
      ],
      "a",
    );
    expect(shares.map((s) => s.amountCents)).toEqual([600, 400]);
    expect(() => computeShares(1000, "exact", [{ userId: "a", exactCents: 600 }], "a")).toThrow(
      /add up/,
    );
  });

  it("puts a personal expense entirely on the payer", () => {
    expect(computeShares(500, "none", three, "b")).toEqual([{ userId: "b", amountCents: 500 }]);
  });
});

describe("computeBalances", () => {
  it("credits the payer and debits each participant", () => {
    const balances = computeBalances([
      {
        amountCents: 3000,
        paidBy: "a",
        shares: computeShares(
          3000,
          "equal",
          [{ userId: "a" }, { userId: "b" }, { userId: "c" }],
          "a",
        ),
      },
    ]);
    expect(balances.get("a")).toBe(2000);
    expect(balances.get("b")).toBe(-1000);
    expect(balances.get("c")).toBe(-1000);
    expect([...balances.values()].reduce((x, y) => x + y, 0)).toBe(0);
  });

  it("nets out when everyone pays for something", () => {
    const balances = computeBalances([
      {
        amountCents: 1000,
        paidBy: "a",
        shares: computeShares(1000, "equal", [{ userId: "a" }, { userId: "b" }], "a"),
      },
      {
        amountCents: 1000,
        paidBy: "b",
        shares: computeShares(1000, "equal", [{ userId: "a" }, { userId: "b" }], "b"),
      },
    ]);
    expect(balances.size).toBe(0);
  });

  it("applies settlements", () => {
    const balances = computeBalances(
      [
        {
          amountCents: 2000,
          paidBy: "a",
          shares: computeShares(2000, "equal", [{ userId: "a" }, { userId: "b" }], "a"),
        },
      ],
      [{ fromUserId: "b", toUserId: "a", amountCents: 1000 }],
    );
    expect(balances.size).toBe(0);
  });
});

describe("settleUp", () => {
  it("clears balances with at most one payment per person", () => {
    const balances = new Map([
      ["a", 2000],
      ["b", -1500],
      ["c", -500],
    ]);
    const transfers = settleUp(balances);
    expect(transfers).toEqual([
      { fromUserId: "b", toUserId: "a", amountCents: 1500 },
      { fromUserId: "c", toUserId: "a", amountCents: 500 },
    ]);
  });

  it("splits a debt across creditors when needed", () => {
    const transfers = settleUp(
      new Map([
        ["debtor", -3000],
        ["x", 2000],
        ["y", 1000],
      ]),
    );
    expect(transfers).toHaveLength(2);
    expect(transfers.reduce((sum, t) => sum + t.amountCents, 0)).toBe(3000);
  });

  it("returns nothing when everyone is square", () => {
    expect(settleUp(new Map())).toEqual([]);
  });
});

describe("helpers", () => {
  it("parses money strings into cents", () => {
    expect(toCents("12.34")).toBe(1234);
    expect(toCents("1,200")).toBe(120000);
    expect(toCents("")).toBe(0);
    expect(toCents(null)).toBe(0);
  });
  it("formats money for a currency", () => {
    expect(formatMoney(123456, "EUR", "en-GB")).toContain("1,234.56");
  });
  it("totals by key, biggest first", () => {
    const totals = totalsBy(
      [
        { c: "food", v: 100 },
        { c: "food", v: 50 },
        { c: "taxi", v: 200 },
      ],
      (i) => i.c,
      (i) => i.v,
    );
    expect(totals).toEqual([
      { key: "taxi", cents: 200 },
      { key: "food", cents: 150 },
    ]);
  });
});
