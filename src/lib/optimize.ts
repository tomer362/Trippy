/**
 * Route ordering for a single itinerary day.
 *
 * `matrix[i][j]` is the cost (seconds, or metres) of travelling from stop i to stop j.
 * Costs need not be symmetric. Nearest-neighbour gives a decent tour quickly, then 2-opt
 * removes the crossings it leaves behind. Day-sized inputs (< 20 stops) finish instantly.
 */
export type CostMatrix = number[][];

export type OptimizeOptions = {
  /** Index that must stay first, e.g. the hotel you wake up in. */
  fixedStart?: number;
  /** Index that must stay last, e.g. the hotel you sleep in or an evening booking. */
  fixedEnd?: number;
};

function cost(matrix: CostMatrix, from: number, to: number): number {
  const row = matrix[from];
  const value = row?.[to];
  return value === undefined || Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

export function tourCost(matrix: CostMatrix, order: number[]): number {
  let total = 0;
  for (let i = 0; i < order.length - 1; i++) total += cost(matrix, order[i]!, order[i + 1]!);
  return total;
}

function nearestNeighbour(
  matrix: CostMatrix,
  middle: number[],
  start: number | null,
  end: number | null,
): number[] {
  const remaining = new Set(middle);
  const order: number[] = [];
  let current = start;
  while (remaining.size > 0) {
    let best: number | null = null;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const candidate of remaining) {
      const c = current === null ? 0 : cost(matrix, current, candidate);
      if (c < bestCost) {
        bestCost = c;
        best = candidate;
      }
    }
    if (best === null) break;
    remaining.delete(best);
    order.push(best);
    current = best;
  }
  if (end !== null && current !== null) {
    // nothing to do: `end` is appended by the caller
  }
  return order;
}

/** Returns the stop indexes in an improved visiting order. */
export function optimizeOrder(matrix: CostMatrix, options: OptimizeOptions = {}): number[] {
  const n = matrix.length;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);
  const { fixedStart, fixedEnd } = options;
  const start = fixedStart ?? null;
  const end = fixedEnd !== undefined && fixedEnd !== fixedStart ? fixedEnd : null;
  const middle = Array.from({ length: n }, (_, i) => i).filter((i) => i !== start && i !== end);

  let order = [
    ...(start !== null ? [start] : []),
    ...nearestNeighbour(matrix, middle, start, end),
    ...(end !== null ? [end] : []),
  ];

  // 2-opt: reverse interior segments while that shortens the tour.
  const lockedStart = start !== null ? 1 : 0;
  const lockedEnd = end !== null ? 1 : 0;
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 60) {
    improved = false;
    for (let i = lockedStart; i < order.length - 1 - lockedEnd; i++) {
      for (let k = i + 1; k < order.length - lockedEnd; k++) {
        const candidate = [
          ...order.slice(0, i),
          ...order.slice(i, k + 1).reverse(),
          ...order.slice(k + 1),
        ];
        if (tourCost(matrix, candidate) + 1e-9 < tourCost(matrix, order)) {
          order = candidate;
          improved = true;
        }
      }
    }
  }
  return order;
}

/** Straight-line fallback matrix so optimisation still works without the Routes API. */
export function haversineMatrix(points: Array<{ lat: number; lng: number }>): CostMatrix {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  return points.map((a) =>
    points.map((b) => {
      const dLat = rad(b.lat - a.lat);
      const dLng = rad(b.lng - a.lng);
      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.sin(dLng / 2) ** 2 * Math.cos(rad(a.lat)) * Math.cos(rad(b.lat));
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }),
  );
}
