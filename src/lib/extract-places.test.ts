import { describe, expect, it } from "vitest";
import { extractFromText, extractPlaceCandidates, fromGoogleMapsUrl } from "./extract-places";

describe("fromGoogleMapsUrl", () => {
  it("reads the place name and coordinates from a place link", () => {
    const c = fromGoogleMapsUrl(
      "https://www.google.com/maps/place/Mus%C3%A9e+d'Orsay/@48.8599,2.3266,17z/data=!3m1",
    );
    expect(c).toEqual({
      name: "Musée d'Orsay",
      source: "google-maps-url",
      lat: 48.8599,
      lng: 2.3266,
    });
  });
  it("reads a search query link", () => {
    expect(fromGoogleMapsUrl("https://www.google.com/maps?q=Cafe+de+Flore")?.name).toBe(
      "Cafe de Flore",
    );
  });
  it("ignores a bare coordinate query", () => {
    expect(fromGoogleMapsUrl("https://www.google.com/maps?q=48.85,2.35")).toBeNull();
  });
  it("accepts short share links and other Google domains", () => {
    expect(fromGoogleMapsUrl("https://maps.app.goo.gl/abc123")).toBeNull();
    expect(
      fromGoogleMapsUrl("https://www.google.co.uk/maps/place/Borough+Market/@51.5,-0.09,17z")?.name,
    ).toBe("Borough Market");
  });
  it("rejects anything that isn't a Google link", () => {
    expect(fromGoogleMapsUrl("https://example.com/maps/place/Nope")).toBeNull();
    expect(fromGoogleMapsUrl("not a url")).toBeNull();
  });
});

describe("extractPlaceCandidates", () => {
  const html = `
    <html><body>
      <h1>10 things to do in Lisbon</h1>
      <h2>Time Out Market</h2>
      <p>Go early. It gets busy.</p>
      <ul><li>Pastéis de Belém</li><li>Read more</li><li>Miradouro da Senhora do Monte</li></ul>
      <a href="https://www.google.com/maps/place/Castelo+de+S.+Jorge/@38.7139,-9.1334,17z">Map</a>
      <strong>LX Factory</strong>
      <a href="/privacy">Privacy policy</a>
    </body></html>`;

  it("finds places from links, headings, lists and bold text", () => {
    const names = extractPlaceCandidates(html).map((c) => c.name);
    expect(names).toContain("Castelo de S. Jorge");
    expect(names).toContain("Time Out Market");
    expect(names).toContain("Pastéis de Belém");
    expect(names).toContain("Miradouro da Senhora do Monte");
    expect(names).toContain("LX Factory");
  });

  it("drops boilerplate and prose", () => {
    const names = extractPlaceCandidates(html).map((c) => c.name.toLowerCase());
    expect(names).not.toContain("read more");
    expect(names).not.toContain("privacy policy");
    expect(names).not.toContain("go early. it gets busy.");
  });

  it("prefers the entry that carries coordinates", () => {
    const candidates = extractPlaceCandidates(`
      <li>Castelo de S. Jorge</li>
      <a href="https://www.google.com/maps/place/Castelo+de+S.+Jorge/@38.7139,-9.1334,17z">Map</a>`);
    const castle = candidates.find((c) => c.name === "Castelo de S. Jorge");
    expect(castle?.lat).toBeCloseTo(38.7139);
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 100 }, (_, i) => `<li>Place number ${i}</li>`).join("");
    expect(extractPlaceCandidates(many, 10)).toHaveLength(10);
  });
});

describe("extractFromText", () => {
  it("treats each line as a place and unwraps map links", () => {
    const candidates = extractFromText(
      `Tsukiji Outer Market\n  - Senso-ji\nhttps://www.google.com/maps/place/Shibuya+Sky/@35.6,139.7,17z\n\n`,
    );
    expect(candidates.map((c) => c.name)).toEqual([
      "Tsukiji Outer Market",
      "Senso-ji",
      "Shibuya Sky",
    ]);
  });
});
