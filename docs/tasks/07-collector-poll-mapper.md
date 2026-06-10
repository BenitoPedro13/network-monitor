# Task 07 — CollectorModule: PollService + MapperService

**Phase:** 1 — Foundation  
**Group:** Collector  
**Status:** Done  
**Date:** 2026-06-10

---

## What and Why

The collector needs two focused services before it can write anything to the database:

1. **`PollService`** — knows how to talk to the AdGuard Home API. Fetches a page of query log events using a cursor timestamp. Returns raw AdGuard events. Nothing else.

2. **`MapperService`** — knows how to turn a raw AdGuard event into the shape Prisma expects for `DnsEvent`. Pure transformation, no I/O.

Keeping these separate means each can be unit-tested in isolation: `PollService` with a mocked HTTP client, `MapperService` with raw fixture data and no network at all.

---

## CLI Commands

Run from `apps/api/`:

```bash
nest g module collector
nest g service collector/poll --flat
nest g service collector/mapper --flat
```

Delete generated `.spec.ts` files immediately after.

---

## AdGuard Home API

```
GET /control/querylog
  ?limit=1000
  &older_than=<RFC3339 timestamp>   ← cursor; omit on first fetch
  &response_status=all

Authorization: Basic <base64(user:password)>
```

Response shape (relevant fields only):

```ts
interface AdGuardEvent {
  time: string;           // RFC3339 — maps to queriedAt
  question: {
    name: string;         // domain — maps to queriedHost
    type: string;         // "A", "AAAA", etc — maps to queryType
  };
  client: string;         // source IP — maps to sourceIp
  status: string;         // "NOERROR", "NXDOMAIN", etc
  reason: string;         // "FilteredBlackList" etc — used to derive blocked
  answer?: Array<{
    type: string;
    value: string;        // first A/AAAA answer — maps to responseIp
  }>;
}

interface AdGuardQueryLogResponse {
  data: AdGuardEvent[];
  oldest: string;         // RFC3339 of oldest event in this page
}
```

---

## What Each Service Does

### `PollService`

- `fetchSince(cursor: string | null): Promise<AdGuardEvent[]>`
  - Builds URL with `older_than=cursor` (omits param if cursor is null = first fetch)
  - Authenticates with Basic auth from `ConfigService` (`ADGUARD_URL`, `ADGUARD_USER`, `ADGUARD_PASSWORD`)
  - Uses Node.js built-in `fetch` (available since Node 18) — no axios needed
  - Throws a descriptive error if AdGuard returns non-200 (not running, wrong credentials, wizard not done)
  - Returns `response.data` — raw events sorted newest-first

### `MapperService`

- `toDeviceMap(devices: Device[]): Map<string, string>` — builds `ip → deviceId` lookup map
- `toDnsEvent(event: AdGuardEvent, deviceId: string): DnsEventCreateInput | null`
  - Returns `null` if event has no matching device (caller skips it)
  - Maps fields per the table in `ARCHITECTURE.md`
  - `blocked = true` when `reason` starts with `"Filtered"`
  - `responseIp` = first answer with type `"A"` or `"AAAA"`, or `null`

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/src/collector/collector.module.ts` | Generated + configured |
| `apps/api/src/collector/poll.service.ts` | Generated + implemented |
| `apps/api/src/collector/mapper.service.ts` | Generated + implemented |
| `apps/api/src/app.module.ts` | Import `CollectorModule` |
| `apps/api/tests/mapper.test.ts` | Unit tests for mapper (pure functions, no I/O) |

---

## Decisions

- **Node.js built-in `fetch`** — available since Node 18, Node 24 is in use. No extra dependency.
- **`MapperService` is pure** — no injected dependencies. Stateless transformation only. Makes it trivially testable.
- **`null` return on unknown device** — the mapper doesn't throw on unknown IPs; it returns `null` so the caller can filter. Keeps the mapper dumb and the writer smart.
- **`blocked` derived from `reason`** — AdGuard's `reason` field is the canonical source: `"FilteredBlackList"`, `"FilteredBlockedService"`, etc. all start with `"Filtered"`.

---

## How to Verify

```bash
pnpm run test       # mapper unit tests pass
pnpm run typecheck  # no errors
pnpm run dev        # app still boots clean
```

---

## Next Task

**Task 08** — `CursorService` (read/write SystemState) + `WriterService` (bulk insert DnsEvent with geo enrichment).
