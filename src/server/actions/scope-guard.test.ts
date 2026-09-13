import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `requireTripAccess` only proves the caller may edit *some* trip. Any action that also accepts
 * a child id has to tie that id back to the same trip, or it can be pointed at another trip's
 * rows. This walks the action files and fails when a new one forgets, so the class of bug the
 * audit found cannot quietly come back.
 */

const ACTIONS_DIR = join(import.meta.dirname, ".");

/** Input fields that name a row inside a trip. */
const SCOPED_FIELDS = [
  "dayId",
  "targetDayId",
  "tripPlaceId",
  "tripPlaceIds",
  "listId",
  "targetListId",
  "entryId",
  "checklistId",
  "entityId",
  "expenseId",
  "lodgingId",
  "reservationId",
];

/**
 * Actions that scope the id another way. Every entry has to say how, so waiving one is a
 * deliberate, reviewable act rather than a silent omission.
 */
const WAIVED: Record<string, string> = {
  "itinerary.ts:refreshDayLegs": "finds the day inside getItinerary(tripId)",
  "itinerary.ts:optimizeDay": "finds the day inside getItinerary(tripId)",
  "itinerary.ts:applyDayOrder": "finds the day inside getItinerary(tripId)",
  "places.ts:reorderTripPlaces": "every write is WHERE id = ? AND trip_id = ?; listId is unused",
  "places.ts:copyListToTrip":
    "selects the list WHERE id = ? AND trip_id = ?, and requires edit on the target trip",
  "budget.ts:expenseFromPlace": "selects the place WHERE id = ? AND trip_id = ?",
  "content.ts:saveChecklistAsTemplate": "selects the checklist WHERE id = ? AND trip_id = ?",
  "bookings.ts:registerAttachment": "assertAttachmentTarget covers the polymorphic entity",
};

type Block = { file: string; name: string; body: string; schema: string };

/** Extracts the balanced `z.object({ ... })` beginning at `from`. */
function balanced(source: string, from: number): string {
  let depth = 0;
  for (let i = from; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{" || ch === "(") depth++;
    else if (ch === "}" || ch === ")") {
      depth--;
      if (depth === 0) return source.slice(from, i + 1);
    }
  }
  return source.slice(from);
}

/** The schema an action validates, whether written inline or declared above it. */
function schemaFor(source: string, afterActionCall: number): string {
  const rest = source.slice(afterActionCall);
  if (/^\s*z\.object\(/.test(rest)) return balanced(rest, rest.indexOf("z.object("));
  // Either `someSchema,` or a derived one such as `someSchema.partial().extend({ ... })`.
  const named = rest.match(/^\s*(\w+)\s*[.,]/);
  if (!named) return "";
  const derived = /^\s*\w+\./.test(rest) ? balanced(rest, rest.indexOf("(")) : "";
  const decl = source.indexOf(`const ${named[1]} = z.object(`);
  const base = decl === -1 ? "" : balanced(source, source.indexOf("z.object(", decl));
  return base + derived;
}

function actionBlocks(): Block[] {
  const files = readdirSync(ACTIONS_DIR).filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "_helpers.ts",
  );
  const blocks: Block[] = [];
  for (const file of files) {
    const source = readFileSync(join(ACTIONS_DIR, file), "utf8");
    const starts = [...source.matchAll(/export const (\w+) = action\(/g)];
    for (const [i, match] of starts.entries()) {
      const from = match.index!;
      const to = starts[i + 1]?.index ?? source.length;
      blocks.push({
        file,
        name: match[1]!,
        body: source.slice(from, to),
        schema: schemaFor(source, from + match[0].length),
      });
    }
  }
  return blocks;
}

const scopedFieldsIn = (schema: string) =>
  SCOPED_FIELDS.filter((f) => new RegExp(`\\b${f}\\s*:`).test(schema));

describe("trip-scoped child ids", () => {
  const blocks = actionBlocks();

  it("finds the actions and resolves their schemas", () => {
    expect(blocks.length).toBeGreaterThan(30);
    // This one declares its schema above the action() call, the case a naive scan misses.
    expect(blocks.find((b) => b.name === "addItineraryItem")?.schema).toContain("dayId");
  });

  it("scopes every child id an action accepts", () => {
    const offenders: string[] = [];
    for (const block of blocks) {
      const key = `${block.file}:${block.name}`;
      const fields = scopedFieldsIn(block.schema);
      if (fields.length === 0 || key in WAIVED) continue;
      if (/assert(InTrip|EntityInTrip|AttachmentTarget)\(/.test(block.body)) continue;
      offenders.push(`${key} takes ${fields.join(", ")} without a trip-scope check`);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the waiver list honest — every entry still exists and still needs waiving", () => {
    const byKey = new Map(blocks.map((b) => [`${b.file}:${b.name}`, b]));
    const stale: string[] = [];
    for (const key of Object.keys(WAIVED)) {
      const block = byKey.get(key);
      if (!block) stale.push(`${key} no longer exists — drop it from WAIVED`);
      else if (scopedFieldsIn(block.schema).length === 0)
        stale.push(`${key} no longer accepts a scoped id — drop it from WAIVED`);
    }
    expect(stale).toEqual([]);
  });
});
