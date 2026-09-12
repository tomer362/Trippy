import type { BBox } from "@/server/db/schema/geo";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  /** Number shown inside the pin for itinerary stops. */
  label?: string | number | null;
  colorHex: string;
  variant?: "place" | "suggestion" | "lodging" | "selected";
  visited?: boolean;
  dimmed?: boolean;
};

export type MapRoute = {
  id: string;
  colorHex: string;
  /** Encoded polyline from the Routes API, or raw points when we only have straight lines. */
  encoded?: string | null;
  points?: Array<{ lat: number; lng: number }>;
  dashed?: boolean;
};

export type MapView = { bbox?: BBox | null; center?: { lat: number; lng: number }; zoom?: number };
