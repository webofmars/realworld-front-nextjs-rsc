import { NextRequest } from "next/server";

/**
 * Normalize an IP address to its canonical display form.
 * IPv4-mapped IPv6 addresses (e.g. "::ffff:192.168.1.1", commonly produced
 * by proxies and Node's socket handling) are unwrapped to plain IPv4, as in
 * standard W3C/Apache access logs. Genuine IPv6 addresses are kept as-is.
 */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  const mapped = trimmed.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  return mapped?.[1] ?? trimmed;
}

/**
 * Extract real IP address from request headers
 * Checks common proxy headers in order of priority
 */
export function getClientIp(request: NextRequest): string {
  // Check for Cloudflare
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return normalizeIp(cfConnectingIp);
  }

  // Check for X-Real-IP (nginx)
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) {
    return normalizeIp(xRealIp);
  }

  // Check for X-Forwarded-For (standard proxy header)
  // Format: client, proxy1, proxy2
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const ips = xForwardedFor.split(",").map((ip) => ip.trim());
    const clientIp = ips[0];
    if (clientIp) {
      return normalizeIp(clientIp); // Return the first (client) IP
    }
  }

  // Fallback
  return "unknown";
}

/**
 * Convert IPv4 address to an unsigned 32-bit number, or -1 if invalid
 */
function ipv4ToNumber(ip: string): number {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return -1;
  }
  let result = 0;
  for (const part of parts) {
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return -1;
    }
    result = (result * 256 + value) >>> 0;
  }
  return result;
}

/**
 * Check if an IPv4 address is in a CIDR range
 */
function ipv4InCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) {
    // Not a CIDR, exact match
    return ip === cidr;
  }

  const [range, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr ?? "", 10);
  if (!range || isNaN(bits) || bits < 0 || bits > 32) {
    return false;
  }

  const ipNum = ipv4ToNumber(ip);
  const rangeNum = ipv4ToNumber(range);
  if (ipNum < 0 || rangeNum < 0) {
    return false;
  }

  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Parse an IPv6 address (with optional embedded IPv4) into 16 bytes,
 * or return null if invalid
 */
function ipv6ToBytes(ip: string): number[] | null {
  let input = ip;

  // Handle embedded IPv4 (e.g. ::ffff:192.168.1.1)
  if (input.includes(".")) {
    const lastColon = input.lastIndexOf(":");
    if (lastColon === -1) {
      return null;
    }
    const v4Parts = input.slice(lastColon + 1).split(".");
    if (v4Parts.length !== 4) {
      return null;
    }
    const nums = v4Parts.map(Number);
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return null;
    }
    const hi = (((nums[0] ?? 0) << 8) | (nums[1] ?? 0)).toString(16);
    const lo = (((nums[2] ?? 0) << 8) | (nums[3] ?? 0)).toString(16);
    input = `${input.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = input.split("::");
  if (halves.length > 2) {
    return null;
  }
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) {
    return null;
  }

  const groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  if (groups.length !== 8) {
    return null;
  }

  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) {
      return null;
    }
    const value = parseInt(group, 16);
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes;
}

/**
 * Check if an IPv6 address is in a CIDR range
 */
function ipv6InCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr ?? "", 10);
  const ipBytes = ipv6ToBytes(ip);
  const rangeBytes = ipv6ToBytes(range ?? "");
  if (!ipBytes || !rangeBytes || isNaN(bits) || bits < 0 || bits > 128) {
    return false;
  }

  const fullBytes = Math.floor(bits / 8);
  for (let i = 0; i < fullBytes; i++) {
    if (ipBytes[i] !== rangeBytes[i]) {
      return false;
    }
  }
  const remainingBits = bits % 8;
  if (remainingBits > 0) {
    const mask = (0xff << (8 - remainingBits)) & 0xff;
    if ((ipBytes[fullBytes]! & mask) !== (rangeBytes[fullBytes]! & mask)) {
      return false;
    }
  }
  return true;
}

/**
 * IANA special-use / private IPv4 ranges (RFC 6890 et al.)
 */
const PRIVATE_IPV4_CIDRS = [
  "0.0.0.0/8", // "this" network
  "10.0.0.0/8", // private
  "100.64.0.0/10", // CGNAT (shared address space)
  "127.0.0.0/8", // loopback
  "169.254.0.0/16", // link-local
  "172.16.0.0/12", // private
  "192.0.0.0/24", // IETF protocol assignments
  "192.0.2.0/24", // TEST-NET-1 (documentation)
  "192.88.99.0/24", // 6to4 relay anycast (deprecated)
  "192.168.0.0/16", // private
  "198.18.0.0/15", // benchmarking
  "198.51.100.0/24", // TEST-NET-2 (documentation)
  "203.0.113.0/24", // TEST-NET-3 (documentation)
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // reserved (includes 255.255.255.255)
] as const;

/**
 * IANA special-use / private IPv6 ranges
 */
const PRIVATE_IPV6_CIDRS = [
  "::/128", // unspecified
  "::1/128", // loopback
  "fc00::/7", // unique local addresses
  "fe80::/10", // link-local
  "ff00::/8", // multicast
  "2001:db8::/32", // documentation
] as const;

/**
 * Check if an IP address belongs to a private, loopback or IANA-reserved range.
 * Supports IPv4, IPv6 and IPv4-mapped IPv6 addresses.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  if (normalized === "localhost") {
    return true;
  }

  // Strip zone identifier (e.g. fe80::1%eth0)
  const noZone = normalized.split("%")[0] ?? normalized;

  if (noZone.includes(":")) {
    // IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.1) → check the IPv4 part
    const mapped = noZone.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped?.[1]) {
      return isPrivateOrReservedIp(mapped[1]);
    }
    return PRIVATE_IPV6_CIDRS.some((cidr) => ipv6InCidr(noZone, cidr));
  }

  if (ipv4ToNumber(noZone) < 0) {
    return false;
  }
  return PRIVATE_IPV4_CIDRS.some((cidr) => ipv4InCidr(noZone, cidr));
}

/**
 * Check if IP is in whitelist
 * Supports exact IP match and CIDR notation
 */
export function isIpWhitelisted(ip: string, whitelist: string[]): boolean {
  if (whitelist.length === 0) {
    return true; // No whitelist means all IPs are allowed
  }

  // Check for localhost/private IPs - always allowed
  const localhostIps = ["127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1"];
  if (localhostIps.includes(ip)) {
    return true;
  }

  // Check against whitelist
  return whitelist.some((allowedIp) => {
    if (allowedIp.includes("/")) {
      // CIDR notation
      return ipv4InCidr(ip, allowedIp);
    }
    // Exact match
    return ip === allowedIp;
  });
}

/**
 * Get country code from IP address.
 *
 * Goes through the internal geofence route handler (Node.js runtime), which
 * keeps a filesystem cache of lookups to respect the third-party geolocation
 * API rate limits.
 *
 * Note: private/reserved IPs are filtered out by the middleware before this
 * is called - they never reach the geolocation provider.
 */
export async function getCountryFromIp(
  ip: string,
  endpointUrl: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `${endpointUrl}?ip=${encodeURIComponent(ip)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        // Add timeout
        signal: AbortSignal.timeout(3000),
      }
    );

    if (!response.ok) {
      console.error(`Geolocation lookup error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.countryCode || null;
  } catch (error) {
    console.error("Error fetching country from IP:", error);
    return null;
  }
}

/**
 * Check if country is in whitelist
 */
export function isCountryWhitelisted(
  countryCode: string | null,
  whitelist: string[]
): boolean {
  if (whitelist.length === 0) {
    return true; // No whitelist means all countries are allowed
  }

  if (!countryCode) {
    return false; // No country detected, deny access
  }

  return whitelist.includes(countryCode.toUpperCase());
}
