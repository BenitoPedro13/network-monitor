# Task 08 — CursorService + WriterService

**Phase:** 1 — Foundation  
**Group:** Collector  
**Status:** Done  
**Date:** 2026-06-10

---

## What and Why

These two services complete the data pipeline — after polling and mapping, we need to:

1. **`CursorService`** — persists the "last processed timestamp" to `SystemState` in Postgres so the collector never re-processes the same events after a restart. On first run it defaults to `now() - COLLECTOR_BACKFILL_HOURS`.

2. **`WriterService`** — takes a batch of mapped `DnsEventInput` records, enriches each `responseIp` with geo data via `CacheService`, then bulk-inserts into `DnsEvent` using Prisma's `createMany` with `skipDuplicates: true` (the unique constraint on `deviceId + queriedAt + queriedHost` handles dedup cleanly).

---

## CLI Commands

Run from `apps/api/`:

```bash
nest g service collector/cursor --flat
nest g service collector/writer --flat
```

Delete generated `.spec.ts` files immediately after.

---

## What Each Service Does

### `CursorService`

```ts
getCursor(): Promise<string | null>
// Reads SystemState where key = 'collector_cursor'
// Returns value (RFC3339 string) or null if first run

setCursor(timestamp: string): Promise<void>
// Upserts SystemState { key: 'collector_cursor', value: timestamp }

defaultCursor(): string
// Returns new Date(Date.now() - backfillHours * 3_600_000).toISOString()
// backfillHours from COLLECTOR_BACKFILL_HOURS env var (default 24)
```

### `WriterService`

```ts
write(events: DnsEventInput[]): Promise<{ written: number }>
```

Steps:
1. Load all registered `Device` rows once per call
2. For each unique `responseIp` in the batch — call `CacheService.enrich(ip)` (hits Postgres cache or MaxMind)
3. Attach geo data to each event (stored separately in `IpGeoCache`, not on `DnsEvent` itself)
4. `prisma.dnsEvent.createMany({ data: events, skipDuplicates: true })`
5. Return count of actually written rows

**Important:** `createMany` with `skipDuplicates` silently skips rows that violate the unique constraint — this is intentional. On restart the collector re-fetches recent events; duplicates are discarded cleanly without errors.

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/src/collector/cursor.service.ts` | Generated + implemented |
| `apps/api/src/collector/writer.service.ts` | Generated + implemented |
| `apps/api/src/collector/collector.module.ts` | Add new services to providers |

---

## Decisions

- **`skipDuplicates: true`** over manual dedup — Prisma's `createMany` with this flag is atomic and fast. The unique constraint is the source of truth; no need to query before insert.
- **Geo enrichment in `WriterService` not `MapperService`** — geo lookup is async and hits Postgres/MaxMind. `MapperService` stays pure (synchronous, no I/O). Separation of concerns.
- **Load devices once per write call** — devices change rarely; no need to cache them across calls, but also no need to query per event. One query per batch is the right level.
- **`SystemState` key is a string constant** — `'collector_cursor'` is the only key for now. No enum needed yet.

---

## How to Verify

```bash
pnpm run typecheck
pnpm run test
pnpm run dev    # boots clean, no new errors
```

After Task 09 (the orchestrating service) wires everything together, we'll do a live end-to-end test where actual DNS events appear in Postgres.

---

## Next Task

**Task 09** — `CollectorService`: the main polling loop that orchestrates `CursorService`, `PollService`, `MapperService`, `WriterService` on a 30s interval.
