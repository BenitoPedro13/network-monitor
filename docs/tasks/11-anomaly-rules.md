# Task 11 — Anomaly Detection Rules

**Phase:** 1 — Foundation  
**Group:** Collector  
**Status:** In Progress  
**Date:** 2026-06-10

---

## What and Why

Build the `collector/anomaly/` module: three detection rules that run synchronously after each batch write, creating `Alert` rows. This is the last collector item in the Phase 1 checklist — without it the `Alert` table is never populated and the Grafana alert panels stay empty.

Rules (from `ARCHITECTURE.md` §6.3):

| Rule | Trigger | Risk | Dedup window |
|---|---|---|---|
| `UNKNOWN_DOMAIN` | Domain never seen from that device in last 30 days | 30 | one alert per `(deviceId, queriedHost)` per 24h |
| `HIGH_FREQUENCY` | >100 queries to same domain from same device in 5 min | 65 | one alert per `(deviceId, queriedHost)` per 1h |
| `THREAT_MATCH` | Event has `blocked = true` | 80 | one alert per `(deviceId, queriedHost)` per 24h |

---

## CLI Commands

Run from `apps/api/` (delete each generated `.spec.ts` immediately after):

```bash
nest g module collector/anomaly
nest g service collector/anomaly/anomaly --flat
```

---

## Design

```
apps/api/src/collector/anomaly/
├── anomaly.module.ts      ← imports PrismaModule; exports AnomalyService
└── anomaly.service.ts     ← runRules(batch): applies all three rules
```

`AnomalyService.runRules(batch: DnsEventInput[])` is called by `CollectorService.runPoll()` after `WriterService.write()` succeeds. Each rule:

1. Groups the batch by unique `(deviceId, queriedHost)` pairs
2. Evaluates its trigger condition (Prisma queries for historical context)
3. Checks dedup: skip if an `Alert` of the same `type` for the same device + host already exists within the dedup window
4. Creates `Alert` rows for the survivors

### Rule logic detail

- **`UNKNOWN_DOMAIN`** — for each pair, count `DnsEvent` rows for that `(deviceId, queriedHost)` with `queriedAt` in the last 30 days but older than the current batch's oldest event. Zero rows → domain is new for this device.
- **`HIGH_FREQUENCY`** — for each pair, count `DnsEvent` rows for that `(deviceId, queriedHost)` with `queriedAt` in the last 5 minutes. Count > 100 → alert.
- **`THREAT_MATCH`** — pairs where any batch event has `blocked = true`.

---

## Decisions

- **Single `AnomalyService`, three private rule methods** — the rules share the same shape (group → evaluate → dedup → insert); separate services per rule would be abstraction beyond what the task requires.
- **Host stored in `Alert.title`** — `Alert` has no `queriedHost` column, so the title follows a fixed format (e.g. `UNKNOWN_DOMAIN: api.github.com`) and dedup queries match on `(deviceId, type, title, createdAt > window)`. Avoids a schema migration for Phase 1.
- **Rules run on the mapped batch, not re-read from DB** — `WriterService.write()` uses `createMany` (returns no rows), and the `DnsEventInput[]` batch already has everything the rules need (`deviceId`, `queriedHost`, `queriedAt`, `blocked`).
- **Rule failure must not kill the poll loop** — `runRules` is wrapped so a rule error is logged but the cursor still advances; losing one alert evaluation is better than re-processing the batch forever.
- **Sequential, not parallel** — three rules per 30s batch is trivial load; no need for `Promise.all` complexity.

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/src/collector/anomaly/anomaly.module.ts` | Generated |
| `apps/api/src/collector/anomaly/anomaly.service.ts` | Generated + implemented |
| `apps/api/src/collector/collector.module.ts` | Import `AnomalyModule` |
| `apps/api/src/collector/collector.service.ts` | Call `anomaly.runRules(mapped)` after write |
| `apps/api/tests/anomaly.test.ts` | Unit tests for the three rules |

---

## How to Verify

```bash
pnpm run typecheck
pnpm run test
pnpm run dev   # browse on a registered device, confirm Alert rows appear:
               # - UNKNOWN_DOMAIN for first-time domains
               # - THREAT_MATCH after visiting a domain on AdGuard's blocklist
```

---

## Next Task

**Task 12** — update `scripts/seed.ts` with real device IPs (MacBook, iPhone, iPad) and remove the dummy `DnsEvent`/`Alert` seed rows. That closes out the Phase 1 checklist.
