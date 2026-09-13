import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DRIZZLE_DIR = join(process.cwd(), "drizzle");
const journal = JSON.parse(readFileSync(join(DRIZZLE_DIR, "meta", "_journal.json"), "utf8")) as {
  entries: Array<{ idx: number; tag: string }>;
};

describe("migrations", () => {
  it("keeps the pg_trgm extension ahead of the index that needs it", () => {
    // drizzle-kit does not generate CREATE EXTENSION, so this line is a hand edit to a
    // generated file. Regenerating 0000 silently drops it and destination search then fails
    // to provision on a fresh database — hence a test rather than a comment.
    const init = readFileSync(join(DRIZZLE_DIR, "0000_init.sql"), "utf8");
    const extension = init.indexOf("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    const trgmIndex = init.indexOf("gin_trgm_ops");
    expect(extension, "0000_init.sql must create the pg_trgm extension").toBeGreaterThanOrEqual(0);
    expect(trgmIndex).toBeGreaterThanOrEqual(0);
    expect(extension).toBeLessThan(trgmIndex);
  });

  it("has a journal entry for every migration file, and vice versa", () => {
    const files = readdirSync(DRIZZLE_DIR)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/, ""))
      .sort();
    const tags = journal.entries.map((e) => e.tag).sort();
    expect(tags).toEqual(files);
  });

  it("numbers the journal entries contiguously from zero", () => {
    const idx = journal.entries.map((e) => e.idx);
    expect(idx).toEqual(idx.map((_, i) => i));
  });
});
