import { describe, expect, it } from "vitest";
import { isStoredBlobUrl, safeFilename, storagePath, tripIdFromPath } from "./storage";

describe("isStoredBlobUrl", () => {
  it("accepts a URL from our blob store", () => {
    expect(isStoredBlobUrl("https://abc123.public.blob.vercel-storage.com/trips/t1/x.pdf")).toBe(
      true,
    );
  });

  it("rejects other hosts, including ones that merely contain the suffix", () => {
    for (const url of [
      "https://evil.example/login",
      "http://abc.public.blob.vercel-storage.com/x", // not https
      "https://public.blob.vercel-storage.com.evil.example/x",
      "https://evil.example/?x=.public.blob.vercel-storage.com",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(isStoredBlobUrl(url), url).toBe(false);
    }
  });
});

describe("storagePath and tripIdFromPath", () => {
  it("round-trips the trip id", () => {
    const path = storagePath("attachment", "trip_123", "Boarding Pass.pdf");
    expect(tripIdFromPath(path)).toBe("trip_123");
  });

  it("returns null for a path outside the trips prefix", () => {
    expect(tripIdFromPath("elsewhere/x.pdf")).toBeNull();
  });

  it("strips characters that do not belong in a stored name", () => {
    expect(safeFilename("../../etc/passwd")).not.toContain("/");
    expect(safeFilename("a b.png")).toBe("a-b.png");
  });
});
