import { describe, expect, it } from "vitest";
import { haversineMatrix, optimizeOrder, tourCost } from "./optimize";

/** Stops on a line: 0 at x=0, 1 at x=10, 2 at x=20, 3 at x=30. */
const line = [0, 10, 20, 30];
const lineMatrix = line.map((a) => line.map((b) => Math.abs(a - b)));

describe("optimizeOrder", () => {
  it("keeps tiny inputs untouched", () => {
    expect(optimizeOrder([[0]])).toEqual([0]);
    expect(
      optimizeOrder([
        [0, 5],
        [5, 0],
      ]),
    ).toEqual([0, 1]);
  });

  it("untangles a scrambled line into a single sweep", () => {
    const order = optimizeOrder(lineMatrix);
    expect(tourCost(lineMatrix, order)).toBe(30);
  });

  it("respects a fixed start", () => {
    const order = optimizeOrder(lineMatrix, { fixedStart: 2 });
    expect(order[0]).toBe(2);
    expect(order).toHaveLength(4);
    expect(new Set(order).size).toBe(4);
  });

  it("respects a fixed start and end, e.g. leaving and returning to the hotel", () => {
    const order = optimizeOrder(lineMatrix, { fixedStart: 0, fixedEnd: 3 });
    expect(order[0]).toBe(0);
    expect(order.at(-1)).toBe(3);
    expect(tourCost(lineMatrix, order)).toBe(30);
  });

  it("beats the naive order on a route that doubles back", () => {
    // 0 -> 2 -> 1 -> 3 crosses itself; the optimiser should fix it.
    const scrambled = [0, 20, 10, 30];
    const matrix = scrambled.map((a) => scrambled.map((b) => Math.abs(a - b)));
    const naive = [0, 1, 2, 3];
    const order = optimizeOrder(matrix);
    expect(tourCost(matrix, order)).toBeLessThan(tourCost(matrix, naive));
  });

  it("tolerates unreachable pairs without crashing", () => {
    const matrix = [
      [0, Number.NaN, 5],
      [Number.NaN, 0, 2],
      [5, 2, 0],
    ];
    const order = optimizeOrder(matrix);
    expect(new Set(order).size).toBe(3);
  });
});

describe("haversineMatrix", () => {
  it("is zero on the diagonal and symmetric", () => {
    const m = haversineMatrix([
      { lat: 48.86, lng: 2.35 },
      { lat: 48.87, lng: 2.29 },
    ]);
    expect(m[0]![0]).toBe(0);
    expect(m[0]![1]).toBeCloseTo(m[1]![0]!, 6);
    expect(m[0]![1]).toBeGreaterThan(3000);
  });
});
