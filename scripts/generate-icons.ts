/**
 * Generates PWA icons from an inline SVG using sharp (already present via Next.js).
 * Run: pnpm tsx scripts/generate-icons.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const svg = (padding: number) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff8a65"/>
      <stop offset="1" stop-color="#ff5a3c"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${padding > 0 ? 0 : 112}" fill="url(#g)"/>
  <g transform="translate(${padding} ${padding}) scale(${(512 - padding * 2) / 512})">
    <path d="M256 96c-62 0-112 50-112 112 0 84 112 208 112 208s112-124 112-208c0-62-50-112-112-112z" fill="#fff" opacity="0.95"/>
    <circle cx="256" cy="208" r="44" fill="#ff5a3c"/>
  </g>
</svg>`;

async function main() {
  await mkdir("public/icons", { recursive: true });
  const sizes: Array<[string, number, number]> = [
    ["icon-192.png", 192, 0],
    ["icon-512.png", 512, 0],
    ["apple-touch-icon.png", 180, 0],
    ["icon-maskable-512.png", 512, 64],
  ];
  for (const [name, size, pad] of sizes) {
    const buf = await sharp(Buffer.from(svg(pad)))
      .resize(size, size)
      .png()
      .toBuffer();
    await writeFile(`public/icons/${name}`, buf);
  }
  const fav = await sharp(Buffer.from(svg(0)))
    .resize(32, 32)
    .png()
    .toBuffer();
  await writeFile("public/favicon.png", fav);
  await writeFile("public/icons/icon.svg", svg(0));
  console.log("icons written");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
