import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetBurstForTests, charge, RATE_RULES, subjectFromRequest } from "./rate-limit";

// The Postgres half needs a database; these cover the burst layer, the rule table and the
// subject key, all of which are pure.
vi.mock("@/server/db", () => ({
  db: {
    execute: () => {
      throw new Error("no database in this test");
    },
  },
}));

const req = (headers: Record<string, string> = {}) => new Request("https://x.test", { headers });

describe("rate rules", () => {
  it("gives every money-spending bucket a durable window, not just a burst guard", () => {
    for (const bucket of [
      "places.search",
      "places.details",
      "destinations.search",
      "destinations.promote",
      "import.url",
      "routes.legs",
    ] as const) {
      expect(RATE_RULES[bucket].window, bucket).toBeDefined();
    }
  });

  it("leaves the per-keystroke buckets on the free burst guard only", () => {
    expect(RATE_RULES["places.autocomplete"]).not.toHaveProperty("window");
    expect(RATE_RULES["places.photo"]).not.toHaveProperty("window");
  });
});

describe("burst guard", () => {
  beforeEach(() => {
    __resetBurstForTests();
    vi.useRealTimers();
  });

  it("allows up to the limit then refuses", async () => {
    const limit = RATE_RULES["places.autocomplete"].burst.limit;
    for (let i = 0; i < limit; i++) {
      expect((await charge("places.autocomplete", "u:a")).ok, `call ${i + 1}`).toBe(true);
    }
    const over = await charge("places.autocomplete", "u:a");
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.scope).toBe("burst");
  });

  it("counts each subject separately", async () => {
    const limit = RATE_RULES["places.autocomplete"].burst.limit;
    for (let i = 0; i < limit; i++) await charge("places.autocomplete", "u:a");
    expect((await charge("places.autocomplete", "u:a")).ok).toBe(false);
    expect((await charge("places.autocomplete", "u:b")).ok).toBe(true);
  });

  it("counts each bucket separately", async () => {
    const limit = RATE_RULES["places.autocomplete"].burst.limit;
    for (let i = 0; i < limit; i++) await charge("places.autocomplete", "u:a");
    expect((await charge("places.autocomplete", "u:a")).ok).toBe(false);
    expect((await charge("places.photo", "u:a")).ok).toBe(true);
  });

  it("charges the whole cost at once, so a batch of legs cannot slip past", async () => {
    const limit = RATE_RULES["places.photo"].burst.limit;
    expect((await charge("places.photo", "u:big", limit + 1)).ok).toBe(false);
  });

  it("lets the window lapse", async () => {
    vi.useFakeTimers();
    const limit = RATE_RULES["places.autocomplete"].burst.limit;
    for (let i = 0; i < limit; i++) await charge("places.autocomplete", "u:a");
    expect((await charge("places.autocomplete", "u:a")).ok).toBe(false);
    vi.advanceTimersByTime(RATE_RULES["places.autocomplete"].burst.ms + 1);
    expect((await charge("places.autocomplete", "u:a")).ok).toBe(true);
  });

  it("fails open when the database is unreachable", async () => {
    // The mocked db throws; a windowed bucket must still let the request through.
    expect((await charge("places.search", "u:a")).ok).toBe(true);
  });
});

describe("subjectFromRequest", () => {
  it("keys a signed-in caller by user id", () => {
    expect(subjectFromRequest(req(), "user_1")).toBe("u:user_1");
  });

  it("keys an anonymous caller by a hash, never the raw address", () => {
    const subject = subjectFromRequest(req({ "x-forwarded-for": "203.0.113.9" }), null);
    expect(subject).toMatch(/^ip:[0-9a-f]{16}$/);
    expect(subject).not.toContain("203.0.113.9");
  });

  it("takes the first forwarded entry and ignores a client-supplied x-real-ip", () => {
    const a = subjectFromRequest(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }), null);
    const b = subjectFromRequest(req({ "x-forwarded-for": "203.0.113.9" }), null);
    expect(a).toBe(b);
    const spoofed = subjectFromRequest(
      req({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "198.51.100.1" }),
      null,
    );
    expect(spoofed).toBe(b);
  });

  it("still produces a key when there is no forwarded header at all", () => {
    expect(subjectFromRequest(req(), null)).toMatch(/^ip:[0-9a-f]{16}$/);
  });
});
