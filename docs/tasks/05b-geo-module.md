# Task 05b — Geo Module (NestJS)

**Phase:** 1 — Foundation  
**Group:** Collector  
**Status:** Done  
**Date:** 2026-06-10

---

## What and Why

Builds the `GeoModule` — the NestJS module responsible for:
1. **Resolving IPs to geo data** (country, city, lat/lon, ASN, ISP) using MaxMind GeoLite2 offline databases
2. **Caching results** in the `IpGeoCache` Postgres table (30-day TTL) so the same IP is never looked up twice unnecessarily
3. **Auto-updating** the `.mmdb` files from within the running process when they are older than 7 days, using `@nestjs/schedule`

---

## CLI Commands to Generate Structure

Run from `apps/api/`:

```bash
nest g module geo
nest g service geo/lookup --flat
nest g service geo/cache --flat
nest g service geo/updater --flat
```

This generates:
```
apps/api/src/geo/
├── geo.module.ts
├── lookup.service.ts
├── cache.service.ts
└── updater.service.ts
```

---

## What Each File Does

### `lookup.service.ts`

- `@Injectable()` service
- Opens both `.mmdb` readers once on `onModuleInit()` using the `maxmind` package
- Exposes `lookup(ip: string): GeoResult | null`
- Skips RFC1918 private IPs (returns `null`)
- Exposes `reloadReaders()` called by `updater.service.ts` after a fresh download

```ts
type GeoResult = {
  country:     string | null
  countryCode: string | null
  city:        string | null
  lat:         number | null
  lon:         number | null
  asn:         string | null   // e.g. "AS13335"
  isp:         string | null   // e.g. "Cloudflare, Inc."
}
```

### `cache.service.ts`

- `@Injectable()` service, injects `LookupService` and `PrismaService`
- Exposes `enrich(ip: string): Promise<GeoResult | null>`
  1. Private IP → return `null` immediately
  2. Check `IpGeoCache` — if found and age < 30 days → return cached
  3. Miss or stale → call `lookup()` → upsert `IpGeoCache` → return result

### `updater.service.ts`

- `@Injectable()` service, injects `LookupService` and `ConfigService`
- On `onModuleInit()`: checks `mtime` of both `.mmdb` files, downloads if older than `GEO_UPDATE_INTERVAL_DAYS` (default: 7)
- `@Interval(86_400_000)` (24h): rechecks and downloads if stale
- Download: uses Node.js built-in `https` + `zlib` + `tar` — no extra packages
- After download: calls `lookupService.reloadReaders()` so the running process picks up fresh data

### `geo.module.ts`

- Imports `PrismaModule` (to be created in Task 06)
- Provides `LookupService`, `CacheService`, `UpdaterService`
- Exports `CacheService` (the only public surface the collector needs)

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/src/geo/geo.module.ts` | Generated + configured |
| `apps/api/src/geo/lookup.service.ts` | Generated + implemented |
| `apps/api/src/geo/cache.service.ts` | Generated + implemented |
| `apps/api/src/geo/updater.service.ts` | Generated + implemented |
| `apps/api/src/app.module.ts` | Import `GeoModule` |
| `apps/api/tests/geo.test.ts` | New unit tests |
| `.env.example` | Add `GEO_UPDATE_INTERVAL_DAYS` |

---

## Decisions

- **`onModuleInit()` for reader startup** — NestJS guarantees this runs after DI is resolved, before the app is considered ready. Safe place to open file handles.
- **`@Interval()` over `setInterval`** — integrates with NestJS lifecycle, gets cleaned up on `onModuleDestroy` automatically.
- **Built-in Node.js for download** — avoids adding `axios` or `node-fetch` just for one download call. `https.get` + `zlib.createGunzip` + `tar` extract is sufficient.
- **`PrismaModule` as a dependency** — `CacheService` needs Prisma. Rather than injecting `PrismaClient` directly, it will use a shared `PrismaService` (built in Task 06). For now, `GeoModule` will declare this dependency and Task 06 will fulfill it.

---

## How to Verify

```bash
pnpm run test          # geo unit tests pass
pnpm run typecheck     # no type errors
pnpm run dev           # app boots, updater logs .mmdb file ages on startup
```

Expected startup log:
```
[GeoUpdater] GeoLite2-City.mmdb is 0 days old — OK
[GeoUpdater] GeoLite2-ASN.mmdb is 0 days old — OK
[GeoUpdater] Next freshness check in 24h
```

---

## Next Task

**Task 06** — Create `PrismaModule` + `PrismaService` using NestJS CLI.
