import { describe, expect, it } from "vitest";
import {
  categoryOf,
  computeTravelProfile,
  EMPTY_PROFILE,
  favouriteCategories,
  type ProfileTripInput,
  pacingHint,
} from "./travel-profile";

function trip(overrides: Partial<ProfileTripInput> = {}): ProfileTripInput {
  return {
    tripId: "t1",
    destinationIds: ["paris"],
    countryCodes: ["FR"],
    days: [
      { stops: 4, firstStartTime: "09:00", travelMode: "walk" },
      { stops: 2, firstStartTime: "10:30", travelMode: "walk" },
    ],
    placeTypes: ["museum", "italian_restaurant", "park"],
    visitedPlaceIds: ["p1"],
    spendCents: 40000,
    ...overrides,
  };
}

describe("categoryOf", () => {
  it("buckets place types into readable categories", () => {
    expect(categoryOf("italian_restaurant")).toBe("food");
    expect(categoryOf("art_gallery")).toBe("culture");
    expect(categoryOf("national_park")).toBe("outdoors");
    expect(categoryOf("shopping_mall")).toBe("shopping");
    expect(categoryOf("night_club")).toBe("nightlife");
    expect(categoryOf("lodging")).toBe("lodging");
    expect(categoryOf("something_else")).toBe("other");
  });
});

describe("computeTravelProfile", () => {
  it("returns the empty profile with no trips", () => {
    expect(computeTravelProfile([])).toEqual(EMPTY_PROFILE);
  });

  it("averages stops over planned days only", () => {
    const profile = computeTravelProfile([
      trip({
        days: [
          { stops: 4, firstStartTime: null, travelMode: null },
          { stops: 0, firstStartTime: null, travelMode: null },
        ],
      }),
    ]);
    expect(profile.avgStopsPerDay).toBe(4);
    expect(profile.avgDays).toBe(2);
  });

  it("takes the median start time", () => {
    const profile = computeTravelProfile([
      trip({
        days: [
          { stops: 1, firstStartTime: "08:00", travelMode: null },
          { stops: 1, firstStartTime: "09:00", travelMode: null },
          { stops: 1, firstStartTime: "13:00", travelMode: null },
        ],
      }),
    ]);
    expect(profile.typicalStartTime).toBe("09:00");
  });

  it("shares out modes and categories, ignoring hotels and transport", () => {
    const profile = computeTravelProfile([
      trip({ placeTypes: ["museum", "museum", "lodging", "airport", "cafe"] }),
    ]);
    expect(profile.categoryShare.culture).toBeCloseTo(0.67, 1);
    expect(profile.categoryShare.food).toBeCloseTo(0.33, 1);
    expect(profile.categoryShare.lodging).toBeUndefined();
    expect(profile.modeShare.walk).toBe(1);
  });

  it("picks up cuisines from restaurant types", () => {
    const profile = computeTravelProfile([
      trip({ placeTypes: ["italian_restaurant", "italian_restaurant", "thai_restaurant"] }),
    ]);
    expect(profile.cuisineShare.italian).toBeCloseTo(0.67, 1);
    expect(profile.cuisineShare.thai).toBeCloseTo(0.33, 1);
  });

  it("averages daily spend across trips that recorded it", () => {
    const profile = computeTravelProfile([trip({ spendCents: 40000 }), trip({ spendCents: null })]);
    expect(profile.avgDailySpendCents).toBe(20000);
  });

  it("collects countries, destinations and favourites without duplicates", () => {
    const profile = computeTravelProfile([
      trip(),
      trip({ tripId: "t2", visitedPlaceIds: ["p1", "p2"], countryCodes: ["FR", "IT"] }),
    ]);
    expect(profile.tripsAnalyzed).toBe(2);
    expect(profile.countries).toEqual(["FR", "IT"]);
    expect(profile.destinationIds).toEqual(["paris"]);
    expect(profile.favoritePlaceIds).toEqual(["p1", "p2"]);
  });
});

describe("pacingHint", () => {
  const profile = computeTravelProfile([
    trip({ days: [{ stops: 4, firstStartTime: null, travelMode: null }] }),
  ]);

  it("stays quiet without history", () => {
    expect(pacingHint(EMPTY_PROFILE, [{ dayIndex: 0, stops: 9 }])).toBeNull();
  });

  it("flags days well above the traveller's own pace", () => {
    const hint = pacingHint(profile, [
      { dayIndex: 0, stops: 4 },
      { dayIndex: 1, stops: 8 },
    ]);
    expect(hint?.busyDays).toEqual([1]);
    expect(hint?.avgStopsPerDay).toBe(4);
  });

  it("flags unusually light days too", () => {
    const hint = pacingHint(profile, [{ dayIndex: 2, stops: 1 }]);
    expect(hint?.quietDays).toEqual([2]);
  });

  it("says nothing when the plan matches the usual pace", () => {
    expect(pacingHint(profile, [{ dayIndex: 0, stops: 4 }])).toBeNull();
  });
});

describe("favouriteCategories", () => {
  it("returns the categories that carry real weight", () => {
    const profile = computeTravelProfile([
      trip({ placeTypes: ["museum", "museum", "museum", "cafe", "park"] }),
    ]);
    expect(favouriteCategories(profile)).toContain("culture");
    expect(favouriteCategories(profile, 1)).toHaveLength(1);
  });
});
