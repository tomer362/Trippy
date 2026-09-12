import "server-only";
import { env } from "@/env";

/**
 * Thin client for Places API (New). Every call site passes an explicit field mask so the
 * billing SKU is always intentional (Essentials < Pro < Enterprise).
 */
const BASE = "https://places.googleapis.com/v1";

export const FIELD_MASKS = {
  // Essentials SKU
  identity: "id,displayName,formattedAddress,location,viewport,types,addressComponents",
  // Pro SKU
  basic:
    "id,displayName,formattedAddress,location,viewport,types,primaryType,primaryTypeDisplayName,googleMapsUri,websiteUri,internationalPhoneNumber,utcOffsetMinutes,photos,businessStatus",
  // Enterprise SKU (only when the user opens the details sheet)
  rich: "id,rating,userRatingCount,priceLevel,regularOpeningHours,currentOpeningHours,editorialSummary,reviews",
  search:
    "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.primaryTypeDisplayName,places.rating,places.userRatingCount,places.priceLevel,places.photos,places.googleMapsUri",
} as const;

export class PlacesError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function requireKey() {
  const key = env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new PlacesError("GOOGLE_MAPS_SERVER_KEY is not configured", 503);
  return key;
}

async function request<T>(path: string, init: RequestInit & { fieldMask?: string }): Promise<T> {
  const key = requireKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": key,
  };
  if (init.fieldMask) headers["X-Goog-FieldMask"] = init.fieldMask;
  const res = await fetch(`${BASE}${path}`, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new PlacesError(`Places API ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  return (await res.json()) as T;
}

export type LatLng = { latitude: number; longitude: number };
export type Viewport = { low: LatLng; high: LatLng };

export type AutocompleteSuggestion = {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
  types: string[];
};

export async function autocomplete(input: {
  query: string;
  sessionToken: string;
  regionsOnly?: boolean;
  includedTypes?: string[];
  bias?: { center: LatLng; radiusM: number } | { viewport: Viewport };
  languageCode?: string;
}): Promise<AutocompleteSuggestion[]> {
  const body: Record<string, unknown> = {
    input: input.query,
    sessionToken: input.sessionToken,
    languageCode: input.languageCode ?? "en",
  };
  if (input.regionsOnly) body.includedPrimaryTypes = ["(regions)"];
  else if (input.includedTypes?.length) body.includedPrimaryTypes = input.includedTypes.slice(0, 5);
  if (input.bias && "viewport" in input.bias) {
    body.locationBias = { rectangle: input.bias.viewport };
  } else if (input.bias) {
    body.locationBias = { circle: { center: input.bias.center, radius: input.bias.radiusM } };
  }
  const data = await request<{
    suggestions?: Array<{
      placePrediction?: {
        placeId: string;
        text?: { text: string };
        structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
        types?: string[];
      };
    }>;
  }>("/places:autocomplete", { method: "POST", body: JSON.stringify(body) });
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      placeId: p.placeId,
      text: p.text?.text ?? "",
      mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
      types: p.types ?? [],
    }));
}

export type PlacePhoto = {
  name: string;
  widthPx: number;
  heightPx: number;
  authorAttributions?: Array<{ displayName: string; uri?: string }>;
};

export type PlaceDetails = {
  id: string;
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  location?: LatLng;
  viewport?: Viewport;
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: { text: string };
  addressComponents?: Array<{ longText: string; shortText: string; types: string[] }>;
  googleMapsUri?: string;
  websiteUri?: string;
  internationalPhoneNumber?: string;
  utcOffsetMinutes?: number;
  photos?: PlacePhoto[];
  businessStatus?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  regularOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  editorialSummary?: { text: string };
  reviews?: Array<{
    rating: number;
    text?: { text: string };
    authorAttribution?: { displayName: string };
    relativePublishTimeDescription?: string;
  }>;
};

export async function placeDetails(
  placeId: string,
  fieldMask: string,
  sessionToken?: string,
  languageCode = "en",
): Promise<PlaceDetails> {
  const params = new URLSearchParams({ languageCode });
  if (sessionToken) params.set("sessionToken", sessionToken);
  return request<PlaceDetails>(`/places/${encodeURIComponent(placeId)}?${params}`, {
    method: "GET",
    fieldMask,
  });
}

export async function textSearch(input: {
  query: string;
  includedType?: string;
  viewport?: Viewport;
  center?: LatLng;
  radiusM?: number;
  maxResults?: number;
  openNow?: boolean;
  minRating?: number;
  languageCode?: string;
}): Promise<PlaceDetails[]> {
  const body: Record<string, unknown> = {
    textQuery: input.query,
    maxResultCount: Math.min(20, input.maxResults ?? 12),
    languageCode: input.languageCode ?? "en",
  };
  if (input.includedType) body.includedType = input.includedType;
  if (input.openNow) body.openNow = true;
  if (input.minRating) body.minRating = input.minRating;
  if (input.viewport) body.locationBias = { rectangle: input.viewport };
  else if (input.center)
    body.locationBias = { circle: { center: input.center, radius: input.radiusM ?? 20000 } };
  const data = await request<{ places?: PlaceDetails[] }>("/places:searchText", {
    method: "POST",
    body: JSON.stringify(body),
    fieldMask: FIELD_MASKS.search,
  });
  return data.places ?? [];
}

export async function nearbySearch(input: {
  center: LatLng;
  radiusM: number;
  includedTypes?: string[];
  maxResults?: number;
}): Promise<PlaceDetails[]> {
  const data = await request<{ places?: PlaceDetails[] }>("/places:searchNearby", {
    method: "POST",
    body: JSON.stringify({
      locationRestriction: { circle: { center: input.center, radius: input.radiusM } },
      includedTypes: input.includedTypes,
      maxResultCount: Math.min(20, input.maxResults ?? 12),
      languageCode: "en",
    }),
    fieldMask: FIELD_MASKS.search,
  });
  return data.places ?? [];
}

/** Returns a redirect-free photo URL by asking for the media URI (skipHttpRedirect). */
export async function photoUri(photoName: string, maxWidthPx = 800): Promise<string | null> {
  const key = requireKey();
  const url = `${BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${key}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as { photoUri?: string };
  return data.photoUri ?? null;
}

export function viewportToBBox(v?: Viewport): [number, number, number, number] | null {
  if (!v) return null;
  return [v.low.longitude, v.low.latitude, v.high.longitude, v.high.latitude];
}

export function bboxToViewport(b: [number, number, number, number]): Viewport {
  return { low: { latitude: b[1], longitude: b[0] }, high: { latitude: b[3], longitude: b[2] } };
}
