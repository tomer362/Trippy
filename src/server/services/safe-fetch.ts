import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetching a URL a user pasted means our server will connect wherever they point it, so
 * everything reachable from inside the deployment — cloud metadata, internal services, our own
 * localhost routes — is in reach unless we refuse it. Every hop is re-checked, because
 * validating only the first URL is defeated by a redirect to a private address.
 */

export class UnsafeUrlError extends Error {
  constructor(message = "That link can't be fetched") {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const MAX_REDIRECTS = 3;

function ipv4Blocked(parts: number[]): boolean {
  const [a, b] = parts as [number, number, ...number[]];
  if (a === 0 || a === 10 || a === 127) return true; // this network, private, loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a >= 224) return true; // multicast and reserved
  return false;
}

/** True when an address is somewhere on the internet we are willing to reach. */
export function isBlockedAddress(address: string): boolean {
  const raw = address.trim().replace(/^\[|\]$/g, "");
  const version = isIP(raw);
  if (version === 4) {
    return ipv4Blocked(raw.split(".").map(Number));
  }
  if (version === 6) {
    const ip = raw.toLowerCase().split("%")[0]!;
    if (ip === "::" || ip === "::1") return true; // unspecified, loopback
    // ::ffff:a.b.c.d and ::ffff:7f00:1 both wrap an IPv4 address.
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return ipv4Blocked(mapped[1]!.split(".").map(Number));
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(ip)) {
      const [, hi, lo] = ip.split(":").slice(-3) as [string, string, string];
      const n = (Number.parseInt(hi, 16) << 16) | Number.parseInt(lo, 16);
      return ipv4Blocked([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
    }
    if (/^f[cd]/.test(ip)) return true; // unique local
    if (/^fe[89ab]/.test(ip)) return true; // link-local
    if (/^ff/.test(ip)) return true; // multicast
    return false;
  }
  return true; // not an IP literal at all
}

/** Rejects a URL we should not connect to, resolving DNS so a name cannot hide a private IP. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("That doesn't look like a link");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new UnsafeUrlError("Only web links can be read");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new UnsafeUrlError("That link points somewhere private");
    return url;
  }
  let resolved: Array<{ address: string }>;
  try {
    resolved = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError("Couldn't find that site");
  }
  if (resolved.length === 0) throw new UnsafeUrlError("Couldn't find that site");
  // Every answer must be public: one private address in a round-robin is enough to abuse.
  if (resolved.some((r) => isBlockedAddress(r.address)))
    throw new UnsafeUrlError("That link points somewhere private");
  return url;
}

/**
 * Fetches a user-supplied page, following redirects by hand so each destination is checked
 * before we connect to it.
 */
export async function safeFetch(
  raw: string,
  init: { headers?: Record<string, string>; timeoutMs: number },
): Promise<Response> {
  let target = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeUrl(target);
    const res = await fetch(target, {
      headers: init.headers,
      redirect: "manual",
      signal: AbortSignal.timeout(init.timeoutMs),
      cache: "no-store",
    });
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get("location");
    if (!location) return res;
    await res.body?.cancel().catch(() => {});
    target = new URL(location, target).toString();
  }
  throw new UnsafeUrlError("That link redirects too many times");
}
