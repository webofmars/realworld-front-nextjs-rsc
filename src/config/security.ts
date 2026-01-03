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
} as const;
