# Security Features Documentation

## Overview

This application now includes IP-based security features:
- **Request logging** in Combined Log Format (Apache/nginx standard)
- **IP whitelisting** to restrict access by IP address
- **Geofencing** to restrict access by country (optional)

## Configuration

All security features are configured via environment variables in `.env` or `.env.local`.

### Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
# Enable IP whitelisting
ENABLE_IP_WHITELIST=true
IP_WHITELIST=192.168.1.0/24,10.0.0.100

# Enable request logging (enabled by default)
ENABLE_REQUEST_LOGGING=true

# Enable geofencing (optional)
ENABLE_GEOFENCING=true
COUNTRY_WHITELIST=FR,BE,CH
GEOFENCING_API_URL=http://ip-api.com/json

# Geofencing cache (optional - sane defaults provided)
GEOFENCING_CACHE_DIR=.next/cache/geofencing
GEOFENCING_CACHE_TTL_MS=86400000
GEOFENCING_CACHE_NEGATIVE_TTL_MS=60000
```

## Features

### 1. Request Logging

**Status:** Enabled by default

Logs all incoming requests in Combined Log Format:
```
192.168.1.1 - user [03/Jan/2026:10:30:45 +0100] "GET /article/how-to-train-your-dragon HTTP/1.1" 200 - "https://google.com" "Mozilla/5.0..."
```

Format details:
- IP address (real client IP, extracted from proxy headers)
- Remote user (from authentication, or `-`)
- Timestamp in standard format
- HTTP method, path, and protocol
- Status code
- Referrer header
- User agent

**Configuration:**
```bash
ENABLE_REQUEST_LOGGING=true  # Set to false to disable
```

Logs are written to stdout (visible in console). In production, configure your hosting platform to capture and store these logs.

### 2. IP Whitelisting

**Status:** Disabled by default

Restricts access to specific IP addresses or CIDR ranges.

**Configuration:**
```bash
ENABLE_IP_WHITELIST=true
IP_WHITELIST=192.168.1.100,10.0.0.0/8,172.16.0.0/12
```

**IP Format Support:**
- **Single IP:** `192.168.1.100`
- **CIDR Range:** `192.168.1.0/24` (allows 192.168.1.0 - 192.168.1.255)
- **Multiple entries:** Comma-separated list

**Special handling:**
- Localhost IPs (`127.0.0.1`, `::1`) are always allowed
- Empty whitelist means all IPs are allowed

**IP Detection:**
The middleware checks these headers in order:
1. `CF-Connecting-IP` (Cloudflare)
2. `X-Real-IP` (nginx)
3. `X-Forwarded-For` (standard proxy)

### 3. Geofencing

**Status:** Disabled by default

Restricts access based on geographic location (country).

**Configuration:**
```bash
ENABLE_GEOFENCING=true
COUNTRY_WHITELIST=FR,BE,CH,DE
GEOFENCING_API_URL=http://ip-api.com/json
```

**Country Codes:**
Use ISO 3166-1 alpha-2 codes (2-letter country codes):
- `FR` - France
- `BE` - Belgium  
- `CH` - Switzerland
- `US` - United States
- etc.

**Important Notes:**
- External API calls are cached (see "Geofencing cache" below): only the first
  request for a given public IP hits ip-api.com
- Free tier limit: 45 requests/minute on ip-api.com
- 3-second timeout for API calls
- Private and IANA-reserved IPs (localhost, `127.0.0.0/8`, `10.0.0.0/8`,
  `172.16.0.0/12`, `192.168.0.0/16`, CGNAT `100.64.0.0/10`, link-local,
  `::1`, `fc00::/7`, `fe80::/10`, documentation/multicast/reserved ranges,
  IPv4-mapped IPv6, ...) are **always allowed** and never sent to the
  geolocation provider

**How it works:**

The Edge middleware has no filesystem access, so geolocation resolution is
delegated to an internal route handler running in the Node.js runtime:

1. Middleware checks the client IP. Private/reserved IPs bypass geofencing.
2. For public IPs, the middleware calls `GET /api/geofence?ip=<ip>` on the
   app itself (loopback URL, configurable via `GEOFENCING_INTERNAL_URL`).
3. The route handler resolves the country using a two-tier cache (below) and
   only calls the third-party API on a cache miss.

**Geofencing cache:**

Two-tier cache to respect the third-party rate limit:
1. **In-memory** (per-process Map, fastest)
2. **Filesystem** in `GEOFENCING_CACHE_DIR` (default `.next/cache/geofencing`,
   next to the other Next.js caches - survives restarts)

Each entry is stored as JSON (`{"countryCode": "FR", "expiresAt": ...}`) in a
file named after the SHA-256 of the IP. Writes are atomic (temp file + rename).
Failed lookups (API error, rate limiting) are also cached, but with the much
shorter `GEOFENCING_CACHE_NEGATIVE_TTL_MS`, so an unavailable API is not hit
on every request.

```bash
GEOFENCING_CACHE_DIR=.next/cache/geofencing   # cache location
GEOFENCING_CACHE_TTL_MS=86400000              # successful lookups (24h)
GEOFENCING_CACHE_NEGATIVE_TTL_MS=60000        # failed lookups (1min)
GEOFENCING_INTERNAL_URL=                      # override the internal resolver URL
```

**Production Recommendations:**
- Use a paid geolocation service with higher limits
- Increase `GEOFENCING_CACHE_TTL_MS` (IP → country mappings rarely change)
- Use self-hosted GeoIP database (e.g., MaxMind GeoLite2)
- Note: the filesystem cache is per-instance; with multiple replicas each one
  keeps its own cache

## Testing

### Test IP Logging

1. Enable logging:
```bash
ENABLE_REQUEST_LOGGING=true
```

2. Start dev server:
```bash
npm run dev
```

3. Visit any page and check console output for Combined Log Format entries

### Test IP Whitelisting

1. Enable whitelisting with your IP:
```bash
ENABLE_IP_WHITELIST=true
IP_WHITELIST=127.0.0.1
```

2. Visit the site - should work normally

3. Change to a different IP:
```bash
IP_WHITELIST=192.168.1.100
```

4. Visit the site - should show "Access Denied" (403)

### Test Geofencing

1. Enable geofencing:
```bash
ENABLE_GEOFENCING=true
COUNTRY_WHITELIST=FR,BE
```

2. Visit the site - access depends on your country

**Note:** Private/reserved IPs bypass geofencing, so you may need to test from a real IP address or use a proxy (or send an `X-Forwarded-For` header with a public IP in development).

## Production Deployment

### Vercel

Add environment variables in Vercel dashboard:
1. Go to Project Settings → Environment Variables
2. Add your configuration variables
3. Redeploy

### Docker

Add to `docker-compose.yml`:
```yaml
environment:
  - ENABLE_IP_WHITELIST=true
  - IP_WHITELIST=10.0.0.0/8
  - ENABLE_REQUEST_LOGGING=true
```

### Other Platforms

Set environment variables according to your platform's documentation (AWS, GCP, Azure, etc.)

## Security Considerations

1. **IP Spoofing:** Ensure your reverse proxy (nginx, Cloudflare) is configured correctly and trusted
2. **Rate Limiting:** Geofencing makes external API calls - implement rate limiting or caching
3. **Log Storage:** In production, configure log aggregation (CloudWatch, Datadog, etc.)
4. **Private Networks:** CIDR ranges for private networks:
   - `10.0.0.0/8`
   - `172.16.0.0/12`
   - `192.168.0.0/16`

## Troubleshooting

**Problem:** Wrong IP detected
- Check proxy configuration
- Verify trusted proxy headers are set correctly
- Look at logged IP vs actual IP

**Problem:** Geofencing not working
- Check API rate limits (45 req/min for free tier)
- Verify country codes are uppercase
- Check console for API errors

**Problem:** Localhost always allowed
- This is intentional for development
- Test from real IP address or deploy to staging
