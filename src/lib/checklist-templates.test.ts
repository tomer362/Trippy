import { describe, expect, it } from "vitest";
import { BUILT_IN_TEMPLATES, findTemplate } from "./checklist-templates";

describe("checklist templates", () => {
  it("has unique keys", () => {
    const keys = BUILT_IN_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("every template has a title and items", () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(t.title.length).toBeGreaterThan(2);
      expect(t.items.length).toBeGreaterThan(0);
      expect(t.items.every((i) => i.trim().length > 0)).toBe(true);
    }
  });
  it("looks templates up by key", () => {
    expect(findTemplate("packing-essentials")?.kind).toBe("packing");
    expect(findTemplate("nope")).toBeUndefined();
  });
});
