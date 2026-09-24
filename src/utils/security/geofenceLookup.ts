/**
 * Server-only (Node.js runtime) geolocation lookup with caching.
 *
 * Two-tier cache to respect the third-party API rate limit
 * (ip-api.com free tier: 45 requests/minute):
 *   1. In-memory Map (fastest, per-process)
 *   2. Filesystem cache (survives restarts), stored in `.next/cache/geofencing`
 *      by default so it lives next to the other Next.js caches.
 *
 * Failures (network errors, rate limiting) are also cached, but with a much
 * shorter TTL, to avoid hammering the API while it is unavailable.
 *
 * This module must NOT be imported from middleware (Edge runtime) - it uses
 * Node.js builtins (`fs`, `crypto`, `path`).
 */

import { createHash } from "crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";

export interface GeofenceLookupOptions {
  /** Third-party geolocation API base URL (e.g. http://ip-api.com/json) */
  apiUrl: string;
  /** Cache directory, relative to the app working directory or absolute */
  cacheDir: string;
  /** How long a successful lookup is cached, in milliseconds */
  ttlMs: number;
  /** How long a failed lookup is cached, in milliseconds */
  negativeTtlMs: number;
}

interface CacheEntry {
  countryCode: string | null;
  expiresAt: number;
}

const MEMORY_CACHE_MAX_ENTRIES = 1000;
const memoryCache = new Map<string, CacheEntry>();

function memoryCacheGet(ip: string): CacheEntry | null {
  const entry = memoryCache.get(ip);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(ip);
    return null;
  }
  return entry;
}

function memoryCacheSet(ip: string, entry: CacheEntry): void {
  // Evict the oldest entry when full (Map preserves insertion order)
  if (memoryCache.size >= MEMORY_CACHE_MAX_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey !== undefined) {
      memoryCache.delete(oldestKey);
    }
  }
  memoryCache.set(ip, entry);
}

function cacheFilePath(cacheDir: string, ip: string): string {
  // Hash the IP: safe filename on every filesystem, fixed length
  const hash = createHash("sha256").update(ip).digest("hex");
  return path.join(cacheDir, `${hash}.json`);
}

async function fileCacheGet(
  cacheDir: string,
  ip: string
): Promise<CacheEntry | null> {
  const filePath = cacheFilePath(cacheDir, ip);
  try {
    const raw = await readFile(filePath, "utf8");
    const entry = JSON.parse(raw) as CacheEntry;
    if (
      typeof entry.expiresAt !== "number" ||
      entry.expiresAt <= Date.now()
    ) {
      // Expired or corrupted: drop it
      await unlink(filePath).catch(() => undefined);
      return null;
    }
    return entry;
  } catch {
    return null; // Missing or unreadable file = cache miss
  }
}

async function fileCacheSet(
  cacheDir: string,
  ip: string,
  entry: CacheEntry
): Promise<void> {
  try {
    await mkdir(cacheDir, { recursive: true });
    const filePath = cacheFilePath(cacheDir, ip);
    // Write to a temp file then rename: no partial reads by concurrent requests
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(tmpPath, JSON.stringify(entry), "utf8");
    await rename(tmpPath, filePath);
  } catch (error) {
    // Cache writes are best-effort: never break the request over them
    console.warn("Geofence cache write failed:", error);
  }
}

async function fetchCountryCode(
  ip: string,
  apiUrl: string
): Promise<{ ok: boolean; countryCode: string | null }> {
  try {
    const response = await fetch(
      `${apiUrl}/${encodeURIComponent(ip)}?fields=status,countryCode`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3000),
      }
    );
    if (!response.ok) {
      // e.g. 429 when rate limited
      console.error(`Geolocation API error: ${response.status}`);
      return { ok: false, countryCode: null };
    }
    const data = await response.json();
    return { ok: true, countryCode: data.countryCode || null };
  } catch (error) {
    console.error("Error fetching country from IP:", error);
    return { ok: false, countryCode: null };
  }
}

/**
 * Resolve the country code for a public IP address, using the cache first
 * and calling the third-party API only on cache misses.
 */
export async function lookupCountryCode(
  ip: string,
  options: GeofenceLookupOptions
): Promise<string | null> {
  const { apiUrl, ttlMs, negativeTtlMs } = options;
  const cacheDir = path.resolve(options.cacheDir);

  const cached = memoryCacheGet(ip) ?? (await fileCacheGet(cacheDir, ip));
  if (cached) {
    memoryCacheSet(ip, cached);
    return cached.countryCode;
  }

  const { ok, countryCode } = await fetchCountryCode(ip, apiUrl);

  const entry: CacheEntry = {
    countryCode: ok ? countryCode : null,
    // Failed lookups use the short negative TTL; a successful lookup with no
    // country (e.g. reserved IP unknown to the provider) uses the full TTL
    expiresAt: Date.now() + (ok ? ttlMs : negativeTtlMs),
  };
  memoryCacheSet(ip, entry);
  await fileCacheSet(cacheDir, ip, entry);

  return entry.countryCode;
}
