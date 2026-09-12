/**
 * Upserts data/destinations.json into the destinations table.
 * Run: pnpm db:seed   (requires DATABASE_URL)
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { destinations } from "../src/server/db/schema";

type SeedRow = {
  slug: string;
  name: string;
  kind: "country" | "region" | "city" | "island" | "neighborhood" | "park";
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
  wikidataQid?: string | null;
  geonamesId?: number | null;
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const db = drizzle({ client: neon(url), casing: "snake_case" });
  const rows = JSON.parse(
    await readFile(new URL("../data/destinations.json", import.meta.url), "utf8"),
  ) as SeedRow[];
  console.log(`Seeding ${rows.length} destinations…`);

  // First pass: upsert rows without parents so ids exist.
  const chunk = 100;
  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk).map((r) => ({
      slug: r.slug,
      name: r.name,
      kind: r.kind,
      countryCode: r.countryCode,
      lat: r.lat,
      lng: r.lng,
      bbox: r.bbox ?? undefined,
      population: r.population ?? undefined,
      popularity: r.popularity,
      wikipediaTitle: r.wikipediaTitle ?? undefined,
      wikidataQid: r.wikidataQid ?? undefined,
      geonamesId: r.geonamesId ?? undefined,
      altNames: r.altNames,
      ancestorNames: r.ancestorNames,
      searchText: [r.name, ...r.altNames, ...r.ancestorNames].join(" ").toLowerCase(),
    }));
    await db
      .insert(destinations)
      .values(batch)
      .onConflictDoUpdate({
        target: destinations.slug,
        set: {
          name: sql`excluded.name`,
          kind: sql`excluded.kind`,
          countryCode: sql`excluded.country_code`,
          lat: sql`excluded.lat`,
          lng: sql`excluded.lng`,
          bbox: sql`COALESCE(excluded.bbox, ${destinations.bbox})`,
          population: sql`COALESCE(excluded.population, ${destinations.population})`,
          popularity: sql`excluded.popularity`,
          wikipediaTitle: sql`COALESCE(excluded.wikipedia_title, ${destinations.wikipediaTitle})`,
          altNames: sql`excluded.alt_names`,
          ancestorNames: sql`excluded.ancestor_names`,
          searchText: sql`excluded.search_text`,
          updatedAt: new Date(),
        },
      });
    process.stdout.write(`${Math.min(i + chunk, rows.length)}/${rows.length}\r`);
  }
  // Second pass: parent pointers by slug.
  await db.execute(sql`
    UPDATE destinations d SET parent_id = p.id
    FROM (SELECT slug, id FROM destinations) p, (VALUES ${sql.join(
      rows.filter((r) => r.parentSlug).map((r) => sql`(${r.slug}, ${r.parentSlug})`),
      sql`, `,
    )}) AS v(slug, parent_slug)
    WHERE d.slug = v.slug AND p.slug = v.parent_slug`);
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
