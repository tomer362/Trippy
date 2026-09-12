import "server-only";

const UA = "Trippy/0.1 (trip planner; https://github.com/tomer362/Trippy)";

export type WikiSummary = {
  title: string;
  description?: string;
  extract?: string;
  thumbnail?: { source: string; width: number; height: number };
  originalimage?: { source: string; width: number; height: number };
  coordinates?: { lat: number; lon: number };
};

export async function fetchWikiSummary(title: string, lang = "en"): Promise<WikiSummary | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  return (await res.json()) as WikiSummary;
}

export type ImageCredit = {
  artist?: string;
  license?: string;
  licenseUrl?: string;
  descriptionUrl?: string;
};

/** Looks up licence + author for a Commons file via imageinfo extmetadata. */
export async function fetchImageCredit(fileName: string): Promise<ImageCredit | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    iiprop: "extmetadata|url",
    titles: `File:${fileName}`,
    origin: "*",
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": UA },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          imageinfo?: Array<{
            descriptionurl?: string;
            extmetadata?: Record<string, { value: string }>;
          }>;
        }
      >;
    };
  };
  const page = Object.values(data.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata ?? {};
  return {
    artist: stripHtml(meta.Artist?.value),
    license: meta.LicenseShortName?.value,
    licenseUrl: meta.LicenseUrl?.value,
    descriptionUrl: info.descriptionurl,
  };
}

function stripHtml(s?: string) {
  return s ? s.replace(/<[^>]+>/g, "").trim() : undefined;
}

/** Extracts the Commons file name from an upload.wikimedia.org URL. */
export function commonsFileNameFromUrl(url: string): string | null {
  const m = url.match(/\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/** Rewrites an original Commons URL to a width-limited thumbnail URL. */
export function commonsThumb(originalUrl: string, width = 1600): string {
  const m = originalUrl.match(
    /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/,
  );
  if (!m) return originalUrl;
  const [, base, a, b, file] = m;
  return `${base}/thumb/${a}/${b}/${file}/${width}px-${file}${file!.toLowerCase().endsWith(".svg") ? ".png" : ""}`;
}
