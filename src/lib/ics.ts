/**
 * Minimal iCalendar writer for trip feeds.
 *
 * Everything a calendar client needs and nothing it doesn't: CRLF line endings, folded
 * lines, escaped text, and UTC timestamps. Kept dependency-free and pure so the output
 * can be asserted in tests.
 */
export type IcsDate = { date: string };
export type IcsDateTime = { dateTime: string };

export type IcsEvent = {
  uid: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  start: IcsDate | IcsDateTime;
  /** All-day events are exclusive of the end date, per the spec. */
  end?: IcsDate | IcsDateTime;
};

export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, ";")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Folds a content line at 75 octets, continuing with a single leading space. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  const limit = () => (out.length === 0 ? 75 : 74);
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (currentBytes + size > limit()) {
      out.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += size;
  }
  if (current) out.push(current);
  return out.join("\r\n ");
}

function stampUtc(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

function pointValue(point: IcsDate | IcsDateTime): { param: string; value: string } {
  if ("date" in point) return { param: ";VALUE=DATE", value: point.date.replace(/-/g, "") };
  return { param: "", value: stampUtc(new Date(point.dateTime)) };
}

export function buildIcs(calendarName: string, events: IcsEvent[], now = new Date()): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Trippy//Trip planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const event of events) {
    const start = pointValue(event.start);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${stampUtc(now)}`);
    lines.push(`DTSTART${start.param}:${start.value}`);
    if (event.end) {
      const end = pointValue(event.end);
      lines.push(`DTEND${end.param}:${end.value}`);
    }
    lines.push(`SUMMARY:${escapeText(event.summary)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** Adds one day to an ISO date, for all-day events whose end is exclusive. */
export function nextIsoDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
