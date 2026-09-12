import { describe, expect, it } from "vitest";
import { slugifyHandle } from "./profile";

describe("slugifyHandle", () => {
  it("produces a url-safe handle from a display name", () => {
    expect(slugifyHandle("Tomer B.")).toBe("tomerb");
  });
  it("pads very short names", () => {
    expect(slugifyHandle("Al")).toBe("traveleral");
  });
});
