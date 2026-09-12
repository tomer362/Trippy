/**
 * Best-effort parser for pasted booking confirmations.
 *
 * Trippy runs on a host without inbound email, so instead of a forwarding address the user
 * pastes the confirmation text and reviews what we extracted before saving. Everything here
 * is a heuristic: the UI always shows the parsed fields for correction.
 */
export type ParsedReservationKind =
  | "flight"
  | "train"
  | "bus"
  | "ferry"
  | "car"
  | "restaurant"
  | "activity"
  | "other";

export type ParsedConfirmation = {
  kind: ParsedReservationKind;
  title: string;
  confirmationNo: string | null;
  /** Local date/time strings, kept as text so the user confirms the time zone. */
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  price: string | null;
  currency: string | null;
  details: {
    carrier?: string;
    number?: string;
    fromCode?: string;
    toCode?: string;
    fromName?: string;
    toName?: string;
    partySize?: number;
    provider?: string;
    address?: string;
  };
  /** Fields we are unsure about, surfaced in the review step. */
  warnings: string[];
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const KIND_HINTS: Array<[ParsedReservationKind, RegExp]> = [
  ["flight", /\b(flight|airline|boarding|departure gate|e-?ticket|pnr|record locator)\b/i],
  ["train", /\b(train|rail|railway|coach\s?\d|platform|amtrak|eurostar|trenitalia|renfe|sncf)\b/i],
  ["ferry", /\b(ferry|sailing|vessel|port of)\b/i],
  ["bus", /\b(bus|flixbus|megabus|greyhound)\b/i],
  [
    "car",
    /\b(car rental|rental car|pick-?up location|drop-?off|hertz|avis|europcar|sixt|enterprise)\b/i,
  ],
  ["restaurant", /\b(restaurant|table for|reservation for \d|dining|opentable|resy)\b/i],
  ["activity", /\b(tour|ticket[s]? for|admission|museum|experience|getyourguide|viator)\b/i],
];

export function detectKind(text: string): ParsedReservationKind {
  for (const [kind, re] of KIND_HINTS) if (re.test(text)) return kind;
  return "other";
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Finds dates in ISO, `12 Oct 2026`, `Oct 12, 2026` and `12/10/2026` shapes. */
export function findDates(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (y: number, m: number, d: number) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return;
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    if (!seen.has(iso)) {
      seen.add(iso);
      out.push(iso);
    }
  };
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g))
    push(Number(m[1]), Number(m[2]), Number(m[3]));
  const monthNames = MONTHS.join("|");
  for (const m of text.matchAll(
    new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})[a-z]*\\.?,?\\s+(\\d{4})\\b`, "gi"),
  )) {
    push(Number(m[3]), MONTHS.indexOf(m[2]!.toLowerCase().slice(0, 3)) + 1, Number(m[1]));
  }
  for (const m of text.matchAll(
    new RegExp(`\\b(${monthNames})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, "gi"),
  )) {
    push(Number(m[3]), MONTHS.indexOf(m[1]!.toLowerCase().slice(0, 3)) + 1, Number(m[2]));
  }
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g))
    push(Number(m[3]), Number(m[2]), Number(m[1]));
  return out;
}

/** Finds 24-hour and am/pm times, normalised to HH:MM. */
export function findTimes(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/gi)) {
    let hour = Number(m[1]);
    const minute = Number(m[2]);
    const suffix = m[3]?.toLowerCase();
    if (suffix === "pm" && hour < 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) continue;
    const value = `${pad(hour)}:${pad(minute)}`;
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  // Skip the minutes of an already-matched "2:30 PM" by refusing a digit preceded by a colon.
  for (const m of text.matchAll(/(?<![:\d])(\d{1,2})\s?(am|pm)\b/gi)) {
    let hour = Number(m[1]);
    const suffix = m[2]!.toLowerCase();
    if (suffix === "pm" && hour < 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
    const value = `${pad(hour)}:00`;
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

const LABEL_WORDS = [
  "confirmation",
  "booking",
  "reservation",
  "reference",
  "record locator",
  "pnr",
  "itinerary",
  "order",
];

/**
 * Booking codes are written in caps or mix in a digit, which is what separates a real code
 * from the label words around it ("Booking reference: 4JK9QP").
 */
function looksLikeCode(raw: string): boolean {
  if (raw.length < 5 || raw.length > 12) return false;
  if (LABEL_WORDS.includes(raw.toLowerCase())) return false;
  const hasDigit = /\d/.test(raw);
  const allCaps = raw === raw.toUpperCase();
  return hasDigit || allCaps;
}

export function findConfirmation(text: string): string | null {
  // Labels arrive in many shapes: "Confirmation number:", "Booking reference -", "PNR".
  const labelled = new RegExp(
    `(?:${LABEL_WORDS.join("|")})(?:\\s+(?:number|code|no\\.?|#|id|reference|locator))*\\s*[:#-]?\\s*([A-Za-z0-9]{5,12})\\b`,
    "gi",
  );
  for (const m of text.matchAll(labelled)) {
    const candidate = m[1];
    if (candidate && looksLikeCode(candidate)) return candidate.toUpperCase();
  }
  for (const m of text.matchAll(
    /\b([A-Za-z0-9]{6,10})\b(?=[^\n]*\b(?:confirmation|booking|reference)\b)/g,
  )) {
    const candidate = m[1];
    if (candidate && looksLikeCode(candidate)) return candidate.toUpperCase();
  }
  return null;
}

export function findPrice(text: string): { price: string; currency: string } | null {
  const symbols: Record<string, string> = {
    $: "USD",
    "€": "EUR",
    "£": "GBP",
    "₪": "ILS",
    "¥": "JPY",
  };
  const symbolMatch = text.match(/([$€£₪¥])\s?([\d,]+(?:\.\d{2})?)/);
  if (symbolMatch)
    return {
      price: symbolMatch[2]!.replace(/,/g, ""),
      currency: symbols[symbolMatch[1]!] ?? "USD",
    };
  const codeMatch = text.match(
    /\b(USD|EUR|GBP|ILS|JPY|AUD|CAD|CHF|THB|MXN|SEK|NOK|DKK|PLN|CZK|TRY)\s?([\d,]+(?:\.\d{2})?)/i,
  );
  if (codeMatch)
    return { price: codeMatch[2]!.replace(/,/g, ""), currency: codeMatch[1]!.toUpperCase() };
  return null;
}

export function findFlight(text: string): {
  carrier?: string;
  number?: string;
  fromCode?: string;
  toCode?: string;
} {
  const out: { carrier?: string; number?: string; fromCode?: string; toCode?: string } = {};
  const flight = text.match(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4})\b/);
  if (flight) {
    out.carrier = flight[1];
    out.number = `${flight[1]}${flight[2]}`;
  }
  const route = text.match(/\b([A-Z]{3})\b\s*(?:→|->|–|—|-|to)\s*\b([A-Z]{3})\b/);
  if (route) {
    out.fromCode = route[1];
    out.toCode = route[2];
  }
  return out;
}

function titleFor(
  kind: ParsedReservationKind,
  text: string,
  details: ParsedConfirmation["details"],
): string {
  if (kind === "flight") {
    const route =
      details.fromCode && details.toCode ? ` ${details.fromCode} → ${details.toCode}` : "";
    return `Flight ${details.number ?? ""}${route}`.replace(/\s+/g, " ").trim();
  }
  const firstLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 2 && l.length < 80);
  const fallback: Record<ParsedReservationKind, string> = {
    flight: "Flight",
    train: "Train",
    bus: "Bus",
    ferry: "Ferry",
    car: "Car rental",
    restaurant: "Restaurant booking",
    activity: "Activity",
    other: "Reservation",
  };
  return firstLine ?? fallback[kind];
}

export function parseConfirmation(raw: string): ParsedConfirmation {
  const text = raw.replace(/\r/g, "").trim();
  const kind = detectKind(text);
  const dates = findDates(text);
  const times = findTimes(text);
  const price = findPrice(text);
  const details: ParsedConfirmation["details"] = {};
  const warnings: string[] = [];

  if (kind === "flight") Object.assign(details, findFlight(text));
  if (kind === "car") {
    const pickup = text.match(/pick-?up[^:\n]*:?\s*([^\n]{3,80})/i);
    const dropoff = text.match(/drop-?off[^:\n]*:?\s*([^\n]{3,80})/i);
    if (pickup?.[1]) details.fromName = pickup[1].trim();
    if (dropoff?.[1]) details.toName = dropoff[1].trim();
  }
  if (kind === "restaurant") {
    const party = text.match(/\b(?:table for|party of|for)\s+(\d{1,2})\b/i);
    if (party?.[1]) details.partySize = Number(party[1]);
  }

  if (dates.length === 0) warnings.push("No date found — set it manually");
  if (times.length === 0) warnings.push("No time found");

  return {
    kind,
    title: titleFor(kind, text, details),
    confirmationNo: findConfirmation(text),
    startDate: dates[0] ?? null,
    startTime: times[0] ?? null,
    endDate: dates[1] ?? null,
    endTime: times[1] ?? null,
    price: price?.price ?? null,
    currency: price?.currency ?? null,
    details,
    warnings,
  };
}
