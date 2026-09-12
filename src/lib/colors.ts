/** Named marker colours shared by lists, days and map pins. */
export const MARKER_COLORS = {
  coral: "#f2542d",
  amber: "#f2a71b",
  lime: "#79b829",
  teal: "#12b5a5",
  sky: "#2f8fe0",
  indigo: "#5a5ae6",
  violet: "#9b51e0",
  pink: "#e0519b",
  brown: "#9c6644",
  slate: "#64748b",
} as const;

export type MarkerColor = keyof typeof MARKER_COLORS;
export const COLOR_KEYS = Object.keys(MARKER_COLORS) as MarkerColor[];

export function colorHex(color: string | null | undefined): string {
  return MARKER_COLORS[(color ?? "coral") as MarkerColor] ?? MARKER_COLORS.coral;
}

/** Stable colour for day N so map routes and day headers always agree. */
export function dayColor(dayIndex: number): MarkerColor {
  return COLOR_KEYS[dayIndex % COLOR_KEYS.length]!;
}

/** Icons offered per list, mapped to lucide names used by `ListIcon`. */
export const LIST_ICONS = [
  "map-pin",
  "utensils",
  "coffee",
  "bed",
  "camera",
  "landmark",
  "mountain",
  "waves",
  "shopping-bag",
  "wine",
  "music",
  "baby",
] as const;
export type ListIconName = (typeof LIST_ICONS)[number];
