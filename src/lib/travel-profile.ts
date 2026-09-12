/**
 * "Learn from past trips": turns a traveller's finished trips into a small profile that
 * later trips can lean on. Pure so the numbers can be tested without a database.
 */
export type ProfileTripInput = {
  tripId: string;
  destinationIds: string[];
  countryCodes: string[];
  days: Array<{
    /** Places scheduled on that day. */
    stops: number;
    /** First start time on the day, HH:MM, when one was set. */
    firstStartTime: string | null;
    travelMode: string | null;
  }>;
  /** Place types of everything scheduled, e.g. `italian_restaurant`, `museum`. */
  placeTypes: string[];
  /** Places the traveller ticked off as visited. */
  visitedPlaceIds: string[];
  /** Total spend in the trip currency, minor units, when recorded. */
  spendCents: number | null;
};

export type TravelProfile = {
  tripsAnalyzed: number;
  avgStopsPerDay: number;
  avgDays: number;
  typicalStartTime: string | null;
  modeShare: Record<string, number>;
  categoryShare: Record<string, number>;
  cuisineShare: Record<string, number>;
  avgDailySpendCents: number | null;
  countries: string[];
  destinationIds: string[];
  favoritePlaceIds: string[];
};

export const EMPTY_PROFILE: TravelProfile = {
  tripsAnalyzed: 0,
  avgStopsPerDay: 0,
  avgDays: 0,
  typicalStartTime: null,
  modeShare: {},
  categoryShare: {},
  cuisineShare: {},
  avgDailySpendCents: null,
  countries: [],
  destinationIds: [],
  favoritePlaceIds: [],
};

const CUISINE = /^(.+)_restaurant$/;

/** Broad buckets, so "art_gallery" and "museum" both read as culture. */
export function categoryOf(placeType: string): string {
  const t = placeType.toLowerCase();
  if (/restaurant|food|meal_|bakery|bar$|pub|cafe|coffee/.test(t)) return "food";
  if (/museum|gallery|historical|monument|church|temple|mosque|synagogue|castle|landmark/.test(t))
    return "culture";
  if (/park|beach|hiking|natural|mountain|lake|garden|zoo|aquarium/.test(t)) return "outdoors";
  if (/store|shop|market|mall|boutique/.test(t)) return "shopping";
  if (/night_club|casino|bar|brewery|winery/.test(t)) return "nightlife";
  if (/spa|massage|wellness|onsen/.test(t)) return "wellness";
  if (/amusement|theme_park|water_park|bowling|arcade/.test(t)) return "fun";
  if (/lodging|hotel|hostel|resort/.test(t)) return "lodging";
  if (/airport|station|transit|parking|car_rental/.test(t)) return "transport";
  return "other";
}

function share(counts: Map<string, number>): Record<string, number> {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return {};
  const out: Record<string, number> = {};
  for (const [key, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    out[key] = Math.round((count / total) * 100) / 100;
  }
  return out;
}

function medianTime(times: string[]): string | null {
  if (times.length === 0) return null;
  const minutes = times
    .map((t) => {
      const [h, m] = t.split(":").map(Number);
      return (h ?? 0) * 60 + (m ?? 0);
    })
    .sort((a, b) => a - b);
  const mid = minutes[Math.floor(minutes.length / 2)]!;
  return `${String(Math.floor(mid / 60)).padStart(2, "0")}:${String(mid % 60).padStart(2, "0")}`;
}

export function computeTravelProfile(trips: ProfileTripInput[]): TravelProfile {
  if (trips.length === 0) return EMPTY_PROFILE;

  const modes = new Map<string, number>();
  const categories = new Map<string, number>();
  const cuisines = new Map<string, number>();
  const startTimes: string[] = [];
  const countries = new Set<string>();
  const destinations = new Set<string>();
  const favourites: string[] = [];

  let dayCount = 0;
  let stopCount = 0;
  let spendCents = 0;
  let spendDays = 0;

  for (const trip of trips) {
    // Days with nothing planned would drag the pace down, so they are left out.
    const plannedDays = trip.days.filter((d) => d.stops > 0);
    dayCount += plannedDays.length;
    stopCount += plannedDays.reduce((sum, d) => sum + d.stops, 0);
    for (const day of plannedDays) {
      if (day.firstStartTime) startTimes.push(day.firstStartTime);
      if (day.travelMode) modes.set(day.travelMode, (modes.get(day.travelMode) ?? 0) + 1);
    }
    for (const type of trip.placeTypes) {
      const category = categoryOf(type);
      if (category === "lodging" || category === "transport") continue;
      categories.set(category, (categories.get(category) ?? 0) + 1);
      const cuisine = type.toLowerCase().match(CUISINE)?.[1];
      if (cuisine && cuisine !== "") cuisines.set(cuisine, (cuisines.get(cuisine) ?? 0) + 1);
    }
    for (const c of trip.countryCodes) if (c) countries.add(c);
    for (const d of trip.destinationIds) destinations.add(d);
    favourites.push(...trip.visitedPlaceIds);
    if (trip.spendCents !== null && plannedDays.length > 0) {
      spendCents += trip.spendCents;
      spendDays += plannedDays.length;
    }
  }

  return {
    tripsAnalyzed: trips.length,
    avgStopsPerDay: dayCount === 0 ? 0 : Math.round((stopCount / dayCount) * 10) / 10,
    avgDays:
      Math.round((trips.reduce((sum, t) => sum + t.days.length, 0) / trips.length) * 10) / 10,
    typicalStartTime: medianTime(startTimes),
    modeShare: share(modes),
    categoryShare: share(categories),
    cuisineShare: share(cuisines),
    avgDailySpendCents: spendDays === 0 ? null : Math.round(spendCents / spendDays),
    countries: [...countries].sort(),
    destinationIds: [...destinations],
    favoritePlaceIds: [...new Set(favourites)],
  };
}

export type PacingHint = { avgStopsPerDay: number; busyDays: number[]; quietDays: number[] };

/**
 * Compares the trip being planned with how this traveller usually paces a day, so the
 * hint is personal rather than a generic "too many stops" rule.
 */
export function pacingHint(
  profile: TravelProfile,
  days: Array<{ dayIndex: number; stops: number }>,
): PacingHint | null {
  if (profile.tripsAnalyzed === 0 || profile.avgStopsPerDay < 1) return null;
  const busyThreshold = Math.max(profile.avgStopsPerDay + 2, profile.avgStopsPerDay * 1.5);
  const busyDays = days.filter((d) => d.stops >= busyThreshold).map((d) => d.dayIndex);
  const quietDays = days
    .filter((d) => d.stops > 0 && d.stops <= Math.max(1, profile.avgStopsPerDay / 2))
    .map((d) => d.dayIndex);
  if (busyDays.length === 0 && quietDays.length === 0) return null;
  return { avgStopsPerDay: profile.avgStopsPerDay, busyDays, quietDays };
}

/** The categories this traveller reaches for most, as chip suggestions. */
export function favouriteCategories(profile: TravelProfile, limit = 3): string[] {
  return Object.entries(profile.categoryShare)
    .filter(([, s]) => s >= 0.1)
    .slice(0, limit)
    .map(([key]) => key);
}
