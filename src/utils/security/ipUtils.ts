import { NextRequest } from "next/server";

/**
 * Extract real IP address from request headers
 * Checks common proxy headers in order of priority
 */
export function getClientIp(request: NextRequest): string {
  // Check for Cloudflare
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Check for X-Real-IP (nginx)
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) {
    return xRealIp;
  }

  // Check for X-Forwarded-For (standard proxy header)
  // Format: client, proxy1, proxy2
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const ips = xForwardedFor.split(",").map((ip) => ip.trim());
    const clientIp = ips[0];
    if (clientIp) {
      return clientIp; // Return the first (client) IP
    }
  }

  // Fallback
  return "unknown";
}

/**
 * Check if IP address is in a CIDR range
 */
function ipInCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) {
    // Not a CIDR, exact match
    return ip === cidr;
  }

  const parts = cidr.split("/");
  const range = parts[0];
  const bits = parts[1];
  
  if (!range || !bits) {
    return false;
  }
  
  const mask = ~(2 ** (32 - parseInt(bits)) - 1);

  const ipNum = ipToNumber(ip);
  const rangeNum = ipToNumber(range);

  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Convert IP address to number
 */
function ipToNumber(ip: string): number {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return 0;
  }
  return parts.reduce((acc, part) => (acc << 8) + parseInt(part), 0);
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
      return ipInCidr(ip, allowedIp);
    }
    // Exact match
    return ip === allowedIp;
  });
}

/**
 * Get country code from IP address using free geolocation API
 * Note: This makes an external HTTP request - use with rate limiting
 */
export async function getCountryFromIp(
  ip: string,
  apiUrl: string
): Promise<string | null> {
  try {
    // Skip for localhost
    if (
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip === "localhost" ||
      ip.startsWith("::ffff:127")
    ) {
      return null;
    }

    const response = await fetch(`${apiUrl}/${ip}?fields=countryCode`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      // Add timeout
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      console.error(`Geolocation API error: ${response.status}`);
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
