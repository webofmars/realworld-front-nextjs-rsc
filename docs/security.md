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
- Makes external API calls (1 per request from new IP)
- Free tier limit: 45 requests/minute on ip-api.com
- 3-second timeout for API calls
- Consider rate limiting or caching for production
- Localhost IPs skip geofencing

**Production Recommendations:**
- Use a paid geolocation service with higher limits
- Implement caching for IP → country lookups
- Use self-hosted GeoIP database (e.g., MaxMind GeoLite2)

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

**Note:** Localhost IPs bypass geofencing, so you may need to test from a real IP address or use a proxy.

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
