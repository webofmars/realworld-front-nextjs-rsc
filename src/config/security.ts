/**
 * Security configuration for IP whitelisting and logging
 */

export const securityConfig = {
  // Enable/disable IP whitelisting
  enableIpWhitelist: process.env.ENABLE_IP_WHITELIST === "true",

  // Enable/disable request logging
  enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== "false", // enabled by default

  // IP whitelist - add allowed IPs or CIDR ranges
  // Leave empty to allow all IPs
  ipWhitelist: (process.env.IP_WHITELIST || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter((ip) => ip.length > 0),

  // Country whitelist (ISO 3166-1 alpha-2 codes)
  // Leave empty to allow all countries
  // Example: ["FR", "BE", "CH"] for France, Belgium, Switzerland
  countryWhitelist: (process.env.COUNTRY_WHITELIST || "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter((code) => code.length > 0),

  // Enable/disable geofencing
  enableGeofencing: process.env.ENABLE_GEOFENCING === "true",

  // Geofencing API endpoint (free tier: ip-api.com)
  // Rate limit: 45 requests per minute
  geofencingApiUrl: process.env.GEOFENCING_API_URL || "http://ip-api.com/json",

  // Internal endpoint used by the middleware to resolve the country of an IP.
  // Points to the /api/geofence route handler of this app (Node.js runtime,
  // filesystem cache). Defaults to the loopback address on the server port -
  // do NOT derive this from the request Host header (it can be spoofed).
  geofencingInternalUrl:
    process.env.GEOFENCING_INTERNAL_URL ||
    `http://127.0.0.1:${process.env.PORT || 3000}/api/geofence`,

  // Filesystem cache directory for geolocation lookups
  // (relative to the app working directory, or absolute)
  geofencingCacheDir:
    process.env.GEOFENCING_CACHE_DIR || ".next/cache/geofencing",

  // How long a successful IP → country lookup is cached (default: 24h)
  geofencingCacheTtlMs:
    Number(process.env.GEOFENCING_CACHE_TTL_MS) || 24 * 60 * 60 * 1000,

  // How long a failed lookup (API error / rate limit) is cached (default: 1min)
  geofencingCacheNegativeTtlMs:
    Number(process.env.GEOFENCING_CACHE_NEGATIVE_TTL_MS) || 60 * 1000,
} as const;
