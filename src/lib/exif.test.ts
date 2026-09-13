import { describe, expect, it } from "vitest";
import { EMPTY_EXIF, parseExif } from "./exif";

/**
 * Builds a real JPEG byte stream with an APP1/Exif block, so the parser is exercised against
 * the layout it will actually meet rather than a stand-in.
 */
function jpegWithExif(opts: {
  little?: boolean;
  gps?: {
    lat: [number, number, number];
    latRef: string;
    lng: [number, number, number];
    lngRef: string;
  };
  dateTimeOriginal?: string;
}): ArrayBuffer {
  const little = opts.little ?? true;
  // TIFF-relative layout: header 0-7, IFD0 at 8, then Exif IFD, GPS IFD, then the data area.
  const buf = new ArrayBuffer(4096);
  const view = new DataView(buf);
  let p = 0;
  const u16 = (v: number) => {
    view.setUint16(p, v, little);
    p += 2;
  };
  const u32 = (v: number) => {
    view.setUint32(p, v, little);
    p += 4;
  };

  // TIFF header.
  view.setUint16(p, little ? 0x4949 : 0x4d4d);
  p += 2;
  u16(42);
  u32(8);

  const entries0: Array<[number, number, number, number]> = []; // tag, type, count, value
  // Reserve space: IFD0 with up to 2 entries.
  const ifd0At = p;
  const ifd0Count = (opts.dateTimeOriginal ? 1 : 0) + (opts.gps ? 1 : 0);
  p += 2 + ifd0Count * 12 + 4;

  const exifIfdAt = opts.dateTimeOriginal ? p : 0;
  if (opts.dateTimeOriginal) p += 2 + 1 * 12 + 4;
  const gpsIfdAt = opts.gps ? p : 0;
  if (opts.gps) p += 2 + 4 * 12 + 4;

  // Data area.
  const dataAt = p;
  let dataP = dataAt;
  const putAscii = (s: string) => {
    const at = dataP;
    for (let i = 0; i < s.length; i++) view.setUint8(dataP++, s.charCodeAt(i));
    view.setUint8(dataP++, 0);
    return at;
  };
  const putRationals = (vals: Array<[number, number]>) => {
    const at = dataP;
    for (const [n, d] of vals) {
      view.setUint32(dataP, n, little);
      view.setUint32(dataP + 4, d, little);
      dataP += 8;
    }
    return at;
  };

  const dateAt = opts.dateTimeOriginal ? putAscii(opts.dateTimeOriginal) : 0;
  const latAt = opts.gps
    ? putRationals(opts.gps.lat.map((v) => [Math.round(v * 100), 100] as [number, number]))
    : 0;
  const lngAt = opts.gps
    ? putRationals(opts.gps.lng.map((v) => [Math.round(v * 100), 100] as [number, number]))
    : 0;

  const writeIfd = (at: number, rows: Array<[number, number, number, number | null, number]>) => {
    p = at;
    u16(rows.length);
    for (const [tag, type, count, offset, inlineValue] of rows) {
      u16(tag);
      u16(type);
      u32(count);
      if (offset === null) {
        // Inline: pad the four value bytes.
        view.setUint32(p, inlineValue, little);
        p += 4;
      } else u32(offset);
    }
    u32(0);
  };

  if (opts.dateTimeOriginal) entries0.push([0x8769, 4, 1, exifIfdAt]);
  if (opts.gps) entries0.push([0x8825, 4, 1, gpsIfdAt]);
  writeIfd(
    ifd0At,
    entries0.map(([t, ty, c, v]) => [t, ty, c, v, 0]),
  );

  if (opts.dateTimeOriginal)
    writeIfd(exifIfdAt, [[0x9003, 2, opts.dateTimeOriginal.length + 1, dateAt, 0]]);

  if (opts.gps) {
    // A one-character ref plus its terminator fits in the inline value bytes.
    const refValue = (ref: string) => (little ? ref.charCodeAt(0) : ref.charCodeAt(0) << 24);
    writeIfd(gpsIfdAt, [
      [0x0001, 2, 2, null, refValue(opts.gps.latRef)],
      [0x0002, 5, 3, latAt, 0],
      [0x0003, 2, 2, null, refValue(opts.gps.lngRef)],
      [0x0004, 5, 3, lngAt, 0],
    ]);
  }

  const tiffBytes = new Uint8Array(buf, 0, Math.max(dataP, p));
  // Wrap in SOI + APP1("Exif\0\0" + TIFF) + EOI.
  const app1Len = 2 + 6 + tiffBytes.length;
  const out: number[] = [0xff, 0xd8, 0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff];
  for (const c of "Exif") out.push(c.charCodeAt(0));
  out.push(0, 0);
  for (const b of tiffBytes) out.push(b);
  out.push(0xff, 0xd9);
  return new Uint8Array(out).buffer;
}

describe("parseExif", () => {
  it("reads GPS and capture time from a little-endian JPEG", () => {
    const data = parseExif(
      jpegWithExif({
        gps: { lat: [48, 51, 29.6], latRef: "N", lng: [2, 17, 40.2], lngRef: "E" },
        dateTimeOriginal: "2026:04:14 09:31:07",
      }),
    );
    expect(data.lat).toBeCloseTo(48.858222, 3);
    expect(data.lng).toBeCloseTo(2.2945, 3);
    expect(data.takenAt).toBe("2026-04-14T09:31:07.000Z");
  });

  it("reads a big-endian JPEG too", () => {
    const data = parseExif(
      jpegWithExif({
        little: false,
        gps: { lat: [48, 51, 29.6], latRef: "N", lng: [2, 17, 40.2], lngRef: "E" },
      }),
    );
    expect(data.lat).toBeCloseTo(48.858222, 3);
  });

  it("applies the S and W hemisphere refs as negative", () => {
    const data = parseExif(
      jpegWithExif({
        gps: { lat: [33, 51, 24.5], latRef: "S", lng: [151, 12, 55.7], lngRef: "W" },
      }),
    );
    expect(data.lat).toBeLessThan(0);
    expect(data.lng).toBeLessThan(0);
    expect(data.lat).toBeCloseTo(-33.856805, 3);
  });

  it("returns nothing for a photo with no GPS", () => {
    const data = parseExif(jpegWithExif({ dateTimeOriginal: "2026:04:14 09:31:07" }));
    expect(data.lat).toBeNull();
    expect(data.lng).toBeNull();
    expect(data.takenAt).toBe("2026-04-14T09:31:07.000Z");
  });

  it("returns nothing for a file that is not a JPEG, without throwing", () => {
    expect(parseExif(new Uint8Array([1, 2, 3, 4]).buffer)).toEqual(EMPTY_EXIF);
    expect(parseExif(new ArrayBuffer(0))).toEqual(EMPTY_EXIF);
  });

  it("returns nothing for a JPEG with no EXIF block", () => {
    const plain = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer;
    expect(parseExif(plain)).toEqual(EMPTY_EXIF);
  });

  it("survives a truncated EXIF block", () => {
    const full = new Uint8Array(
      jpegWithExif({ gps: { lat: [1, 2, 3], latRef: "N", lng: [4, 5, 6], lngRef: "E" } }),
    );
    const truncated = full.slice(0, 24).buffer;
    expect(() => parseExif(truncated)).not.toThrow();
  });
});
