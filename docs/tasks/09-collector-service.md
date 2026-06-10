# Task 09 — CollectorService (main polling loop)

**Phase:** 1 — Foundation  
**Group:** Collector  
**Status:** Done  
**Date:** 2026-06-10

---

## What and Why

`CollectorService` is the final orchestrating layer of the data pipeline. It wires together all the services built in previous tasks and runs the polling loop on a configurable interval.

Without this service, nothing drives the pipeline — `PollService`, `MapperService`, `CursorService`, and `WriterService` all exist but are never invoked.

---

## CLI Commands

Run from `apps/api/`:

```bash
nest g service collector/collector --flat
```

Delete generated `.spec.ts` immediately after.

---

## What CollectorService Does

```ts
@Injectable()
export class CollectorService implements OnModuleInit {
  async onModuleInit(): Promise<void>
  // Kick off first poll immediately on startup

  @Interval(POLL_INTERVAL_MS)
  async poll(): Promise<void>
  // Called by scheduler every COLLECTOR_POLL_INTERVAL_MS (default 30000)
}
```

### Loop steps (each `poll()` call):

1. Load cursor via `CursorService.getCursor()` — fallback to `defaultCursor()` if null
2. Fetch events via `PollService.fetch(cursor)` — returns raw AdGuard log entries
3. If empty batch → log `"no new events"` and return early (do not advance cursor)
4. Map via `MapperService.map(rawEvents, devices)` — devices loaded via Prisma in this step
5. Write via `WriterService.write(mappedEvents)` — enriches geo, bulk-inserts
6. Advance cursor: `CursorService.setCursor(newestTimestamp)` — newest `queriedAt` in the batch

### Device loading

Load all `Device` rows once per `poll()` call (not per event). Pass them to `MapperService.map()` for the IP→Device lookup. This keeps `MapperService` pure while still avoiding per-event DB queries.

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/src/collector/collector.service.ts` | Generated + implemented |
| `apps/api/src/collector/collector.module.ts` | Add `CollectorService` to providers |

---

## Decisions

- **`onModuleInit` + `@Interval`** — `onModuleInit` fires the first poll immediately on startup (no 30s wait); `@Interval` handles subsequent polls. This matches the pattern already used in `UpdaterService`.
- **Empty batch early return** — if AdGuard returns no events newer than the cursor, skip the write and do not advance the cursor. Avoids unnecessary DB writes and prevents the cursor from jumping to `now()` with no data.
- **Devices loaded per poll call** — devices change rarely, so one query per 30s is negligible. No in-memory caching needed between polls; a fresh Prisma query keeps the device list current if someone adds a device while the collector is running.
- **`MapperService.map` signature change** — currently `MapperService` doesn't receive devices. The signature will be updated to `map(rawEvents: RawAdGuardEvent[], devices: Device[]): DnsEventInput[]`. This is a pure function that filters unknown IPs and maps the rest.
- **No anomaly rules yet** — anomaly detection (Task 10) will be wired in after this task. The `poll()` method will have a clear `// TODO: run anomaly rules` comment placeholder removed in Task 10.

---

## How to Verify

```bash
pnpm run typecheck
pnpm run dev      # collector boots, first poll fires immediately, logs "no new events" or write count
```

After verifying the loop starts and logs correctly, do a live test: check that AdGuard has DNS events, confirm they appear in `DnsEvent` table via `psql`.

---

## Next Task

**Task 10** — `AnomalyModule`: `unknownDomain`, `highFrequency`, and `threatMatch` detection rules wired into the poll loop.
