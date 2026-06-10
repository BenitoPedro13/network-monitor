# Task 05 — Geo Module (lookup, cache, auto-updater)

**Phase:** 1 — Foundation  
**Group:** Collector  
**Status:** In Progress  
**Date:** 2026-06-10

---

## What and Why

This task builds the entire `collector/geo/` module — the layer responsible for turning a raw IP address (e.g. `140.82.112.5`) into geographic and network context (country, city, lat/lon, ASN, ISP). It also auto-updates the MaxMind `.mmdb` files from within the running process so no external cron or manual intervention is needed.

Three responsibilities, three files:

| File | Responsibility |
|---|---|
| `updater.ts` | Checks `.mmdb` file age on startup and every 24h. Downloads fresh files if older than 7 days. |
| `lookup.ts` | Opens the `.mmdb` files once and exposes a fast synchronous lookup function. Skips private/RFC1918 IPs. |
| `cache.ts` | Checks `IpGeoCache` in Postgres before calling lookup. Writes new entries. Respects 30-day TTL for re-resolution. |
| `index.ts` | Exports the public API: `enrichIp(ip)` and `startGeoUpdater()`. |

---

## What This Task Does

### `apps/api/src/collector/geo/updater.ts`

On startup:
1. Reads `mtime` (last modified time) of both `.mmdb` files
2. If either file is missing or older than `GEO_UPDATE_INTERVAL_DAYS` (default: 7), downloads both
3. After download, signals `lookup.ts` to reload the readers (so the running process picks up new data)
4. Sets a `setInterval` of 24h to recheck

Download logic reuses the same MaxMind URL as the shell script — uses Node.js `https` + `zlib` + `tar` (all built-in), no extra packages.

### `apps/api/src/collector/geo/lookup.ts`

- Opens `GeoLite2-City.mmdb` and `GeoLite2-ASN.mmdb` using the `maxmind` npm package on module load
- Exports `lookupIp(ip: string): GeoResult | null`
- Returns `null` for RFC1918 ranges (`10.x`, `172.16-31.x`, `192.168.x`, `127.x`, `::1`) — no MaxMind data for these
- Returns `null` gracefully if MaxMind has no record for the IP (not all IPs are in the DB)
- Exposes `reloadReaders()` so `updater.ts` can hot-reload after a download without restarting the process

```ts
type GeoResult = {
  country:     string | null   // "United States"
  countryCode: string | null   // "US"
  city:        string | null   // "Seattle"
  lat:         number | null
  lon:         number | null
  asn:         string | null   // "AS13335"
  isp:         string | null   // "Cloudflare, Inc."
}
```

### `apps/api/src/collector/geo/cache.ts`

- `enrichIp(ip: string, prisma: PrismaClient): Promise<GeoResult | null>`
  1. If IP is private → return `null` immediately (skip DB lookup too)
  2. Check `IpGeoCache` by `ip` — if found and `resolvedAt` < 30 days ago → return cached result
  3. If miss or stale → call `lookupIp(ip)` → upsert `IpGeoCache` row → return result

### `apps/api/src/collector/geo/index.ts`

Public exports only:
```ts
export { enrichIp } from "./cache.ts"
export { startGeoUpdater } from "./updater.ts"
```

### `apps/api/package.json`

Adds `maxmind` as a runtime dependency.

### New env vars used

| Var | Default | Purpose |
|---|---|---|
| `GEOIP_CITY_DB_PATH` | — | Absolute path to `GeoLite2-City.mmdb` |
| `GEOIP_ASN_DB_PATH` | — | Absolute path to `GeoLite2-ASN.mmdb` |
| `GEO_UPDATE_INTERVAL_DAYS` | `7` | Days before re-downloading `.mmdb` files |

Paths are resolved as absolute — the collector validates both paths exist on startup and exits with a clear error if missing.

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/src/collector/geo/updater.ts` | New |
| `apps/api/src/collector/geo/lookup.ts` | New |
| `apps/api/src/collector/geo/cache.ts` | New |
| `apps/api/src/collector/geo/index.ts` | New |
| `apps/api/package.json` | Add `maxmind` dependency |
| `apps/api/tests/geo.test.ts` | New — unit tests for lookup and cache logic |
| `.env.example` | Add `GEO_UPDATE_INTERVAL_DAYS` |

---

## Decisions

- **`maxmind` npm package** — the official MaxMind Node.js reader. Reads `.mmdb` binary format natively, no subprocess needed.
- **Paths as absolute** — avoids the `./` relative-path ambiguity when pnpm runs the process from `apps/api/`. The `updater.ts` resolves paths from env vars and validates them at startup.
- **Hot-reload after update** — rather than restarting the process, `updater.ts` calls `reloadReaders()` so the running collector picks up fresh geo data without downtime.
- **Both City + ASN always downloaded together** — they go stale at the same rate and the ASN database is small (~12MB). No point downloading one without the other.
- **30-day cache TTL** — IP ownership changes are rare. A 30-day TTL means Postgres `IpGeoCache` stays accurate without hammering the `.mmdb` reader on every event.

---

## How to Verify

```bash
# Install the new dependency
pnpm install

# Run unit tests
pnpm run test

# Typecheck
pnpm run typecheck
```

Expected: all geo unit tests pass, no type errors.

Manual smoke — start the collector and look for startup logs:
```
[geo] GeoLite2-City.mmdb last updated X days ago — OK
[geo] GeoLite2-ASN.mmdb last updated X days ago — OK
[geo] Next freshness check in 24h
```

---

## Next Task

**Task 06** — Build `collector/poll.ts` (fetch AdGuard API) and `collector/mapper.ts` (map raw event → DnsEvent shape).
