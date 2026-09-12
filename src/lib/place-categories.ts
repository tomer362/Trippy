/** Shared place vocabulary used by both server proxies and client UI. */
export const PLACE_CATEGORIES = [
  {
    key: "sights",
    label: "Top sights",
    query: "top attractions",
    includedType: "tourist_attraction",
  },
  {
    key: "restaurants",
    label: "Restaurants",
    query: "best restaurants",
    includedType: "restaurant",
  },
  { key: "cafes", label: "Cafés", query: "best cafes", includedType: "cafe" },
  { key: "bars", label: "Bars", query: "best bars", includedType: "bar" },
  { key: "museums", label: "Museums", query: "museums", includedType: "museum" },
  { key: "nature", label: "Nature", query: "parks and nature", includedType: "park" },
  { key: "beaches", label: "Beaches", query: "beaches", includedType: undefined },
  { key: "shopping", label: "Shopping", query: "shopping", includedType: "shopping_mall" },
  { key: "nightlife", label: "Nightlife", query: "nightlife", includedType: "night_club" },
  {
    key: "kids",
    label: "With kids",
    query: "family friendly attractions",
    includedType: undefined,
  },
  { key: "hotels", label: "Hotels", query: "hotels", includedType: "lodging" },
] as const;

export type PlaceCategoryKey = (typeof PLACE_CATEGORIES)[number]["key"];

export const PRICE_LEVEL_LABEL: Record<string, string> = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

/** Human label for a Google place type, e.g. `italian_restaurant` -> `Italian restaurant`. */
export function prettyType(type: string | null | undefined): string | null {
  if (!type) return null;
  const words = type.replace(/_/g, " ").trim();
  if (!words || words === "point of interest" || words === "establishment") return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
