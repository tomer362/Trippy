/**
 * Minimal EXIF reader for the two things a travel journal cares about: where a photo was
 * taken and when. Parsed from the original file, because the canvas resize that follows
 * re-encodes the image and drops every tag.
 *
 * Deliberately not a library: we need GPS and DateTimeOriginal from JPEGs, which is a few
 * dozen lines, and a dependency here would be larger than the feature.
 */

export type ExifData = { lat: number | null; lng: number | null; takenAt: string | null };

export const EMPTY_EXIF: ExifData = { lat: null, lng: null, takenAt: null };

// IFD tags we read.
const TAG_GPS_IFD = 0x8825;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LNG_REF = 0x0003;
const TAG_GPS_LNG = 0x0004;

type Reader = { u16: (o: number) => number; u32: (o: number) => number };

function reader(view: DataView, little: boolean): Reader {
  return {
    u16: (o) => view.getUint16(o, little),
    u32: (o) => view.getUint32(o, little),
  };
}

/** Three RATIONALs (degrees, minutes, seconds) as one signed decimal degree value. */
function dms(r: Reader, offset: number, ref: string): number | null {
  const parts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const numerator = r.u32(offset + i * 8);
    const denominator = r.u32(offset + i * 8 + 4);
    if (denominator === 0) return null;
    parts.push(numerator / denominator);
  }
  const [deg = 0, min = 0, sec = 0] = parts;
  const value = deg + min / 60 + sec / 3600;
  if (!Number.isFinite(value)) return null;
  const signed = ref === "S" || ref === "W" ? -value : value;
  return signed >= -180 && signed <= 180 ? signed : null;
}

function ascii(view: DataView, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    const code = view.getUint8(offset + i);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out.trim();
}

/** "2026:04:14 09:31:07" — EXIF's own format, with no timezone. */
function exifDateToIso(value: string): string | null {
  const m = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readIfd(
  view: DataView,
  r: Reader,
  tiffStart: number,
  ifdOffset: number,
): Map<number, { type: number; count: number; valueOffset: number }> {
  const entries = new Map<number, { type: number; count: number; valueOffset: number }>();
  const base = tiffStart + ifdOffset;
  if (base + 2 > view.byteLength) return entries;
  const count = r.u16(base);
  for (let i = 0; i < count; i++) {
    const entry = base + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = r.u16(entry);
    const type = r.u16(entry + 2);
    const n = r.u32(entry + 4);
    // Values of four bytes or fewer sit inline; anything larger is an offset from the TIFF header.
    const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] ?? 1;
    const inline = size * n <= 4;
    entries.set(tag, {
      type,
      count: n,
      valueOffset: inline ? entry + 8 : tiffStart + r.u32(entry + 8),
    });
  }
  return entries;
}

/** Reads GPS and capture time from a JPEG's EXIF block. Never throws. */
export function parseExif(buffer: ArrayBuffer): ExifData {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return EMPTY_EXIF; // not a JPEG

    // Walk the JPEG marker segments looking for APP1/Exif.
    let offset = 2;
    let tiffStart = -1;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      if (marker === 0xda) break; // start of scan: pixel data from here
      const length = view.getUint16(offset + 2);
      if (marker === 0xe1 && offset + 10 <= view.byteLength) {
        if (ascii(view, offset + 4, 4) === "Exif") {
          tiffStart = offset + 10;
          break;
        }
      }
      offset += 2 + length;
    }
    if (tiffStart < 0 || tiffStart + 8 > view.byteLength) return EMPTY_EXIF;

    const endian = view.getUint16(tiffStart);
    if (endian !== 0x4949 && endian !== 0x4d4d) return EMPTY_EXIF;
    const r = reader(view, endian === 0x4949);
    const ifd0 = readIfd(view, r, tiffStart, r.u32(tiffStart + 4));

    let takenAt: string | null = null;
    const exifPointer = ifd0.get(TAG_EXIF_IFD);
    if (exifPointer) {
      // A sub-IFD pointer is a LONG, which is short enough to sit inline — so the entry holds
      // the offset itself, and valueOffset is only where to read it from.
      const exifIfd = readIfd(view, r, tiffStart, r.u32(exifPointer.valueOffset));
      const dateEntry = exifIfd.get(TAG_DATETIME_ORIGINAL);
      if (dateEntry) takenAt = exifDateToIso(ascii(view, dateEntry.valueOffset, dateEntry.count));
    }

    let lat: number | null = null;
    let lng: number | null = null;
    const gpsPointer = ifd0.get(TAG_GPS_IFD);
    if (gpsPointer) {
      const gps = readIfd(view, r, tiffStart, r.u32(gpsPointer.valueOffset));
      const latEntry = gps.get(TAG_GPS_LAT);
      const lngEntry = gps.get(TAG_GPS_LNG);
      const latRef = gps.get(TAG_GPS_LAT_REF);
      const lngRef = gps.get(TAG_GPS_LNG_REF);
      if (latEntry && latRef)
        lat = dms(r, latEntry.valueOffset, ascii(view, latRef.valueOffset, 1));
      if (lngEntry && lngRef)
        lng = dms(r, lngEntry.valueOffset, ascii(view, lngRef.valueOffset, 1));
      // A partial fix is not a location.
      if (lat === null || lng === null) {
        lat = null;
        lng = null;
      }
    }
    return { lat, lng, takenAt };
  } catch {
    // A malformed or unusual file simply has no metadata to offer.
    return EMPTY_EXIF;
  }
}
