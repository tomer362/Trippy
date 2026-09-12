import { describe, expect, it } from "vitest";
import { slugify } from "./utils";

describe("slugify", () => {
  it("lowercases, strips accents and collapses separators", () => {
    expect(slugify("Côte d'Azur — 2026!")).toBe("cote-d-azur-2026");
  });
  it("trims leading and trailing dashes", () => {
    expect(slugify("  --Tokyo--  ")).toBe("tokyo");
  });
});
