import { describe, expect, it } from "vitest";
import { isBlockedAddress } from "./safe-fetch";

describe("isBlockedAddress", () => {
  it.each([
    ["127.0.0.1", "loopback"],
    ["127.1.2.3", "loopback range"],
    ["0.0.0.0", "this network"],
    ["10.1.2.3", "private class A"],
    ["172.16.0.1", "private class B, low edge"],
    ["172.31.255.254", "private class B, high edge"],
    ["192.168.1.1", "private class C"],
    ["169.254.169.254", "cloud metadata"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
  ])("blocks %s (%s)", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    ["8.8.8.8", "public resolver"],
    ["1.1.1.1", "public resolver"],
    ["172.32.0.1", "just above the private class B block"],
    ["172.15.255.255", "just below the private class B block"],
    ["99.255.255.255", "just below carrier-grade NAT"],
    ["128.0.0.1", "public"],
  ])("allows %s (%s)", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });

  it("blocks IPv6 loopback, unique-local, link-local and multicast", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("allows public IPv6", () => {
    expect(isBlockedAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("sees through IPv4-mapped IPv6, in both spellings", () => {
    expect(isBlockedAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedAddress("::ffff:7f00:1")).toBe(true);
    expect(isBlockedAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("tolerates brackets, zone ids and surrounding space", () => {
    expect(isBlockedAddress("[::1]")).toBe(true);
    expect(isBlockedAddress("fe80::1%eth0")).toBe(true);
    expect(isBlockedAddress("  10.0.0.1  ")).toBe(true);
  });

  it("blocks anything that is not an IP literal", () => {
    expect(isBlockedAddress("localhost")).toBe(true);
    expect(isBlockedAddress("")).toBe(true);
  });
});
