/**
 * OPTIONAL enrichment, run locally (needs outbound access to geonames.org and wikidata.org).
 * Expands data/destinations.json with GeoNames cities (population >= MIN_POP) and admin-1
 * regions, plus Wikidata images/coords for existing rows that carry a Wikipedia title.
 *
 *   pnpm db:enrich            # rewrites data/destinations.json, then run pnpm db:seed
 *   MIN_POP=250000 pnpm db:enrich
 *
 * Licences: GeoNames CC BY 4.0, Wikidata CC0, Commons images per-file (credit stored).
 */

import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const MIN_POP = Number(process.env.MIN_POP ?? 150000);
const CACHE = ".cache/geonames";
const SEED = "data/destinations.json";
const UA = "Trippy/0.1 (destination enrichment; https://github.com/tomer362/Trippy)";

type Row = {
  slug: string;
  name: string;
  kind: string;
  parentSlug: string | null;
  countryCode: string;
  lat: number;
  lng: number;
  bbox: [number, number, number, number] | null;
  population: number | null;
  popularity: number;
  wikipediaTitle: string | null;
  altNames: string[];
  ancestorNames: string[];
  geonamesId?: number | null;
  wikidataQid?: string | null;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function download(name: string) {
  await mkdir(CACHE, { recursive: true });
  const file = `${CACHE}/${name}`;
  if (existsSync(file)) return file;
  const res = await fetch(`https://download.geonames.org/export/dump/${name}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok || !res.body) throw new Error(`Failed to download ${name}: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
  return file;
}

async function main() {
  const rows = JSON.parse(await readFile(SEED, "utf8")) as Row[];
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const countryBySlugCC = new Map(
    rows.filter((r) => r.kind === "country").map((r) => [r.countryCode, r.slug]),
  );

  // Admin-1 regions
  const admin1 = await readFile(await download("admin1CodesASCII.txt"), "utf8");
  const admin1BySlug = new Map<string, string>();
  for (const line of admin1.split("\n")) {
    const [code, name, , gid] = line.split("\t");
    if (!code || !name) continue;
    const cc = code.split(".")[0]!;
    const parent = countryBySlugCC.get(cc);
    if (!parent) continue;
    const slug = slugify(`${name}-${cc}`);
    admin1BySlug.set(code, slug);
    if (
      bySlug.has(slug) ||
      [...bySlug.values()].some((r) => r.name === name && r.countryCode === cc)
    )
      continue;
    rows.push({
      slug,
      name,
      kind: "region",
      parentSlug: parent,
      countryCode: cc,
      lat: 0,
      lng: 0,
      bbox: null,
      population: null,
      popularity: 0.1,
      wikipediaTitle: name,
      altNames: [],
      ancestorNames: [bySlug.get(parent)!.name],
      geonamesId: Number(gid),
    });
    bySlug.set(slug, rows.at(-1)!);
  }

  // Cities >= MIN_POP from cities15000.zip
  const zip = await download("cities15000.zip");
  execFileSync("unzip", ["-o", "-q", zip, "-d", CACHE]);
  const cities = await readFile(`${CACHE}/cities15000.txt`, "utf8");
  let added = 0;
  for (const line of cities.split("\n")) {
    const f = line.split("\t");
    if (f.length < 15) continue;
    const [gid, name, , alt, lat, lng, , , cc, , a1, , , , pop] = f;
    if (Number(pop) < MIN_POP) continue;
    const exists = rows.find((r) => r.kind === "city" && r.name === name && r.countryCode === cc);
    if (exists) {
      exists.geonamesId ??= Number(gid);
      exists.population ??= Number(pop);
      continue;
    }
    const parent = admin1BySlug.get(`${cc}.${a1}`) ?? countryBySlugCC.get(cc!);
    if (!parent) continue;
    const slug = slugify(`${name}-${cc}`);
    if (bySlug.has(slug)) continue;
    const parentRow = bySlug.get(parent)!;
    rows.push({
      slug,
      name: name!,
      kind: "city",
      parentSlug: parent,
      countryCode: cc!,
      lat: Number(lat),
      lng: Number(lng),
      bbox: null,
      population: Number(pop),
      popularity: Math.min(0.5, Math.log10(Number(pop)) / 16),
      wikipediaTitle: name!,
      altNames: (alt ?? "")
        .split(",")
        .filter((s) => s && /^[\p{L}\p{M} .'-]+$/u.test(s))
        .slice(0, 5),
      ancestorNames: [parentRow.name, ...parentRow.ancestorNames],
      geonamesId: Number(gid),
    });
    bySlug.set(slug, rows.at(-1)!);
    added++;
  }

  // Fill admin-1 coordinates from their most populous city
  for (const r of rows) {
    if (r.kind === "region" && r.lat === 0 && r.lng === 0) {
      const child = rows
        .filter((c) => c.parentSlug === r.slug)
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];
      if (child) {
        r.lat = child.lat;
        r.lng = child.lng;
      }
    }
  }

  // Wikidata: coordinates + image for rows lacking bbox/wikidata id (best effort, batched)
  const titles = rows.filter((r) => r.wikipediaTitle && !r.wikidataQid).slice(0, 2000);
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      prop: "pageprops|coordinates",
      ppprop: "wikibase_item",
      titles: batch.map((r) => r.wikipediaTitle!).join("|"),
      redirects: "1",
    });
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
      headers: { "User-Agent": UA },
    });
    if (!res.ok) break;
    const data = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title: string;
            pageprops?: { wikibase_item?: string };
            coordinates?: Array<{ lat: number; lon: number }>;
          }
        >;
      };
    };
    for (const page of Object.values(data.query?.pages ?? {})) {
      const row = batch.find((r) => r.wikipediaTitle === page.title);
      if (!row) continue;
      row.wikidataQid = page.pageprops?.wikibase_item ?? null;
      if (row.lat === 0 && row.lng === 0 && page.coordinates?.[0]) {
        row.lat = page.coordinates[0].lat;
        row.lng = page.coordinates[0].lon;
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  rows.sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name));
  await writeFile(SEED, JSON.stringify(rows, null, 0));
  console.log(`Wrote ${rows.length} destinations (+${added} cities). Now run: pnpm db:seed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
