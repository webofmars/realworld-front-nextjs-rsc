import { NextRequest, NextResponse } from "next/server";
import { securityConfig } from "@/config/security";
import { isPrivateOrReservedIp } from "@/utils/security/ipUtils";
import { lookupCountryCode } from "@/utils/security/geofenceLookup";

// Must always execute (never prerendered/cached by Next itself) - caching is
// handled explicitly by the filesystem cache in geofenceLookup.
export const dynamic = "force-dynamic";

const IP_MAX_LENGTH = 45; // longest possible IPv6 string

/**
 * Internal geolocation resolver used by the middleware.
 *
 * Keeps the third-party geolocation call (and its filesystem cache) in the
 * Node.js runtime, since the Edge middleware has no filesystem access.
 *
 * GET /api/geofence?ip=203.0.113.10 → { "countryCode": "FR" | null, "cached": ... }
 */
export async function GET(request: NextRequest) {
  if (!securityConfig.enableGeofencing) {
    return NextResponse.json({ error: "Geofencing disabled" }, { status: 404 });
  }

  const ip = request.nextUrl.searchParams.get("ip")?.trim();
  if (!ip || ip.length > IP_MAX_LENGTH) {
    return NextResponse.json(
      { error: "Missing or invalid ip parameter" },
      { status: 400 }
    );
  }

  // Private/reserved IPs never leave the server - no external API call
  if (isPrivateOrReservedIp(ip)) {
    return NextResponse.json({ countryCode: null, private: true });
  }

  const countryCode = await lookupCountryCode(ip, {
    apiUrl: securityConfig.geofencingApiUrl,
    cacheDir: securityConfig.geofencingCacheDir,
    ttlMs: securityConfig.geofencingCacheTtlMs,
    negativeTtlMs: securityConfig.geofencingCacheNegativeTtlMs,
  });

  return NextResponse.json({ countryCode });
}
