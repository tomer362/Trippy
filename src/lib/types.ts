import type { BBox } from "@/server/db/schema/geo";

export type DestinationKind = "country" | "region" | "city" | "island" | "neighborhood" | "park";

export type DestinationDTO = {
  id: string | null;
  slug: string | null;
  name: string;
  kind: DestinationKind;
  subtitle: string;
  countryCode: string;
  lat: number;
  lng: number;
  bbox: BBox | null;
  zoom: number;
  heroUrl: string | null;
  heroCredit: string | null;
  /** Result came from Google Autocomplete and is not yet stored. */
  provisional?: boolean;
  googlePlaceId?: string | null;
};

export const KIND_LABEL: Record<DestinationKind, string> = {
  country: "Country",
  region: "Region",
  city: "City",
  island: "Island",
  neighborhood: "Area",
  park: "Park",
};

export const KIND_ZOOM: Record<DestinationKind, number> = {
  country: 5,
  region: 8,
  island: 10,
  city: 11,
  neighborhood: 13,
  park: 10,
};

export type TripRole = "owner" | "editor" | "viewer";
export type TripVisibility = "private" | "link" | "friends" | "public";
export type TripKind = "plan" | "guide" | "journal";
export type TravelMode = "drive" | "walk" | "transit" | "bicycle";
