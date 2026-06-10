# Task 19 — Network Flow Capture (Mac's own traffic)

**Phase:** 2 — Monitoring Coverage (flow layer)  
**Group:** Sensor + Collector  
**Status:** Done  
**Date:** 2026-06-10

---

## What and Why

DNS monitoring sees *intentions* (names looked up) but not *connections*. It is structurally blind to: WebRTC/UDP media (Discord voice), DoH-by-hardcoded-IP, connections reusing cached DNS, and anything to a raw IP. The fix is a second sensor that reads the actual packets and records **flows** (connection metadata, not payload).

The Mac's own outbound traffic already crosses its `en0` interface — we just aren't capturing it. This task adds a passive packet sensor on `en0` and ingests its flow logs into a new `NetworkFlow` table, alongside the existing DNS pipeline. **Passive capture changes no routing and carries no availability risk** — it is safe to run always-on for the Mac (unlike gateway mode for the phone, Task 21).

Context: this is personal monitoring of the owner's own machine on the owner's own LAN. Capture is metadata-level (IPs, ports, byte counts, TLS SNI) — not payload inspection.

---

## Why Zeek (not raw tcpdump / a hand-rolled parser)

Per CLAUDE.md ("use the official tool, don't hand-roll boilerplate"): **Zeek** turns packets into structured connection logs out of the box. Its `conn.log` *is* the `NetworkFlow` schema (src/dst/port/proto/bytes/duration), and its `ssl.log` gives the **TLS SNI server name** — the unencrypted hostname — for free. That single tool covers both the flow capture here AND the old Phase 2b "SNI extraction" idea, which is now retired in favor of Zeek's `ssl.log`. Install: `brew install zeek`.

Alternatives considered and rejected: tcpdump+custom flow assembly (re-implements Zeek), Suricata (heavier, IDS-signature focus we don't need yet).

---

## Design

### Sensor — `scripts/zeek-sensor.sh` (start | stop | status)

- Runs Zeek on `en0` writing **JSON** logs to `zeek/logs/` (gitignored).
- Zeek site config `zeek/local.zeek`: `redef LogAscii::use_json = T;`, disable log rotation (`redef Log::default_rotation_interval = 0 secs;`) so ingest can tail a single append-only file by byte offset, enable `conn` and `ssl` logs, disable the rest (no `dns.log` — AdGuard already owns DNS).
- Requires `sudo` (BPF access). Always-on is fine (passive); a launchd daemon can come later — manual start for now.

### Schema — new Prisma model + migration

```prisma
model NetworkFlow {
  id          String   @id @default(cuid())
  uid         String?  @unique          // Zeek connection uid — joins conn.log ↔ ssl.log
  srcIp       String
  dstIp       String
  dstPort     Int
  protocol    String                    // tcp | udp | icmp
  service     String?                   // Zeek-guessed: ssl, http, quic, ...
  serverName  String?                   // TLS SNI from ssl.log (the hostname — null if not TLS)
  bytes       BigInt                    // orig_bytes + resp_bytes
  duration    Float?                    // seconds
  connState   String?                   // Zeek conn_state (S0, SF, REJ, ...)
  startedAt   DateTime
  deviceId    String?                   // mapped from srcIp; null if unknown
  hadDnsQuery Boolean?                  // enrichment: was dstIp resolved via a recent DnsEvent?
  createdAt   DateTime @default(now())

  @@index([deviceId, startedAt])
  @@index([dstIp, startedAt])
}
```

`SystemState` gains a second cursor key `flow_cursor` — reuses the existing key/value table. **Decision (implementation):** the value is JSON `{"conn": N, "ssl": M}` since both logs need independent byte offsets. The cursor is committed *after* a successful write (at-least-once); `uid @unique` + `skipDuplicates` makes re-ingest idempotent.

### Ingest — new NestJS `flow/` module (mirrors `collector/`)

```
apps/api/src/flow/
├── flow.module.ts
├── flow.service.ts      ← onModuleInit + @Interval; reads new conn.log/ssl.log lines since cursor
├── reader.service.ts    ← tails Zeek JSON logs by byte offset (SystemState flow_cursor); handles truncation/inode change
├── mapper.service.ts    ← Zeek conn record → NetworkFlowInput; srcIp→Device; filters internal/noise
└── writer.service.ts    ← geo-enrich dstIp (reuse geo CacheService) + createMany; ssl.log updates serverName by uid
```

**Reuses:** `PrismaService`, geo `CacheService` (same IpGeoCache, dst IPs), the `toDeviceMap` device-lookup pattern.

**Mapper filtering:**
- Drop flows whose `dstIp` is RFC1918 / loopback / link-local / multicast — keep internet egress only (same skip logic as geo enrichment).
- `srcIp` → `deviceId` via device map (Mac = `192.168.1.6`); keep `deviceId = null` rather than dropping (so unknown-device egress is still visible once gateway mode lands).
- Optionally drop pure-noise flows (`conn_state = S0`, 0 bytes) — tunable.

**hadDnsQuery enrichment (the key correlation):** for each egress flow with a known device, check whether any `DnsEvent` for that device has `responseIp == dstIp` within the last ~60 min (generous TTL window). Found → `true`; none → `false`. A `false` means the connection's destination was never named in DNS — i.e. hardcoded IP, DoH-by-IP, or cache beyond the window. **Honest caveat:** `false` is a *weak per-flow* signal (CDNs return IP A but connect to IP B; long-lived/cached connections) but a *strong aggregate* pattern. The alerting on it lives in Task 20, not here.

### Wiring

`FlowModule` imported in `app.module.ts` next to `CollectorModule`. Same `@Interval` cadence pattern. Geo enrichment shared.

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/prisma/schema.prisma` | Add `NetworkFlow` model |
| `apps/api/prisma/migrations/*` | New migration |
| `apps/api/src/flow/*` | New module (generated via `nest g`, delete `.spec.ts`) |
| `apps/api/src/app.module.ts` | Import `FlowModule` |
| `apps/api/tests/flow-mapper.test.ts` | Mapper filtering + enrichment unit tests |
| `scripts/zeek-sensor.sh` | New — start/stop/status |
| `scripts/dev-with-zeek.sh` | New — starts Zeek + API together and stops Zeek on API exit |
| `zeek/local.zeek` | New — Zeek site config (JSON, no rotation, conn+ssl only) |
| `package.json` | Add `pnpm run dev:flow` lifecycle command |
| `.env.example` | Add `FLOW_POLL_INTERVAL_MS` (default 30000) |
| `README.md` | Zeek install + sensor command |
| `ARCHITECTURE.md` | §4.5 NetworkFlow, §6 flow component, retire standalone 2b (done in prior session) |

`.gitignore` needed no change — the existing `logs/` and `*.log` rules already cover `zeek/logs/`.

## Implementation notes (decisions made during build)

- **ssl↔conn ordering:** `ssl.log` lands at handshake time, `conn.log` at connection end, so SNI usually arrives *before* its flow. The writer keeps an in-memory `pendingSni` map (uid → server_name, capped at 10k) and attaches it when the conn record arrives; the reverse order (conn first) is covered by a per-uid `updateMany`. Pending entries are lost on app restart — acceptable; those flows just have `serverName = null`.
- **`hadDnsQuery` window:** a DnsEvent with matching `(deviceId, responseIp)` whose `queriedAt` is within 60 min before the flow start (+60 s forward skew for log-timing jitter).
- **Noise filter:** `conn_state = S0` with 0 bytes is dropped; S0 with payload is kept.
- **`zeek/local.zeek`** sets `redef ignore_checksums = T` — macOS NIC checksum offloading makes the host's own outgoing packets look corrupt to Zeek, which would otherwise discard exactly the traffic we want.
- **Sensor absence is not an error:** if `conn.log` doesn't exist, the flow module logs one startup warning and polls quietly; the DNS collector is unaffected.
- **Single dev lifecycle:** `pnpm run dev:flow` starts Zeek with `sudo`, runs the API dev server as the normal user, and stops Zeek on exit/Ctrl-C.

---

## How to Verify

```bash
brew install zeek
sudo scripts/zeek-sensor.sh start
# join a Discord voice call on the Mac, browse a few HTTPS sites, then:
pnpm run dev   # flow ingest runs alongside the collector
docker exec network_monitor_postgres psql -U network_monitor -d network_monitor -c \
  'SELECT "dstPort","protocol","serverName","hadDnsQuery",count(*) FROM "NetworkFlow"
   WHERE "startedAt" > now() - interval '"'"'10 min'"'"' GROUP BY 1,2,3,4 ORDER BY 5 DESC LIMIT 20;'
# expect: UDP media flows (Discord), TLS flows with serverName, some hadDnsQuery=false rows
```

**Verified (2026-06-10):** `pnpm run test` 28/28 green, `pnpm run typecheck` clean, app boots with FlowModule, Zeek is installed, and `zeek/local.zeek` parses cleanly with `zeek --parse-only`. Hand-written `conn.log`/`ssl.log` lines were ingested end-to-end into Postgres: DNS-matched flow got `hadDnsQuery=true`, unmatched got `false` plus its SNI from ssl.log, unknown source kept with `deviceId=NULL`, internal destination dropped. Live Zeek run on `en0` produced growing `conn.log`/`ssl.log` files and Postgres `NetworkFlow` rows with TLS SNI including `chatgpt.com`, `discord.com`, `cdn.discordapp.com`, `api2.cursor.sh`, and `dns10.quad9.net`; known-device rows had `hadDnsQuery=false` where no recent DNS match existed.

---

## Next Task

**Task 20** — `NO_DNS_CONNECTION` anomaly rule + Grafana flow dashboards (make the data actionable).
