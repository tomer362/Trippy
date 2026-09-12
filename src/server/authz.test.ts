import { describe, expect, it } from "vitest";
import type { TripRole, TripVisibility } from "@/lib/types";
import { AccessDeniedError, decideAccess } from "./authz";

const decide = (role: TripRole | null, visibility: TripVisibility, isFriendOfMember = false) =>
  decideAccess({ role, visibility, isFriendOfMember });

describe("trip access rules", () => {
  it("gives the owner everything", () => {
    expect(decide("owner", "private")).toEqual({ canView: true, canEdit: true, canManage: true });
  });

  it("lets editors edit but not manage", () => {
    expect(decide("editor", "private")).toEqual({ canView: true, canEdit: true, canManage: false });
  });

  it("keeps viewers read-only", () => {
    const access = decide("viewer", "private");
    expect(access.canView).toBe(true);
    expect(access.canEdit).toBe(false);
    expect(access.canManage).toBe(false);
  });

  it("hides private trips from strangers", () => {
    expect(decide(null, "private").canView).toBe(false);
    expect(decide(null, "private", true).canView).toBe(false);
  });

  it("opens link and public trips to anyone, read-only", () => {
    for (const visibility of ["link", "public"] as const) {
      const access = decide(null, visibility);
      expect(access.canView).toBe(true);
      expect(access.canEdit).toBe(false);
    }
  });

  it("opens friends-only trips to friends of any member", () => {
    expect(decide(null, "friends", true).canView).toBe(true);
    expect(decide(null, "friends").canView).toBe(false);
  });
});

describe("AccessDeniedError", () => {
  it("carries a message a user can act on", () => {
    expect(new AccessDeniedError().message).toContain("access");
    expect(new AccessDeniedError("You can only view this trip").message).toBe(
      "You can only view this trip",
    );
  });
});
