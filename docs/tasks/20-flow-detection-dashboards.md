# Task 20 — Flow Detection Rule + Grafana Flow Dashboards

**Phase:** 2 — Monitoring Coverage (flow layer)  
**Group:** Anomaly + Grafana  
**Status:** Pending  
**Date:** 2026-06-10

---

## What and Why

Task 19 lands `NetworkFlow` rows but nothing reads them. This task makes them actionable: one new anomaly rule and a Grafana flow view. This is where flow capture pays off — WebRTC, DoH-by-IP, and "connections with no DNS provenance" become visible and alertable.

---

## Part 1 — `NO_DNS_CONNECTION` anomaly rule

New `AlertType.NO_DNS_CONNECTION` (Prisma enum migration). Wired into the flow pipeline (after `flow/writer` writes a batch), same `AnomalyService`-style shape as Task 11.

- **Trigger:** a device makes repeated connections (≥ N, default 5 within the batch window) to the same public `dstIp` where every flow has `hadDnsQuery = false` — i.e. a destination that was never resolved via DNS.
- **Risk:** 55 (elevated-but-noisy — see caveat). The honest framing: this is the signature of hidden name resolution (DoH-by-IP, hardcoded C2, custom resolver), but also of CDNs and cached DNS. Treat as "worth a look," not "confirmed bad."
- **Dedup:** one alert per `(deviceId, dstIp)` per 24h. Title carries the IP + SNI if known (e.g. `NO_DNS_CONNECTION: 1.2.3.4 (sni: cdn.example)`).
- **Suppression:** skip well-known CDN ASNs (optional allowlist via IpGeoCache.asn) to cut false positives — tunable, off by default.

## Part 2 — Grafana flow dashboard (`flows.json`)

New provisioned dashboard, linked from Overview:

- **Egress flows over time** (timeseries, by device)
- **Top destinations by bytes** (table: serverName ?? dstIp, country, ISP, bytes, flows)
- **Protocol/port breakdown** (bar: tcp/udp/quic; highlight UDP media + port 853)
- **Connections with no DNS provenance** (table: device, dstIp, SNI, country, flows — the `hadDnsQuery = false` view)
- **TLS destinations by SNI** (table — the "names from flows" payoff, complements DNS)
- World-map reuse: `NetworkFlow.dstIp` joins the same `IpGeoCache` as DNS, so flows can plot on the existing geomap.

Also add a `NO_DNS_CONNECTION` slice to the existing Open Alerts panels (no panel change needed — they already select all open alerts).

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/prisma/schema.prisma` | `NO_DNS_CONNECTION` enum value + migration |
| `apps/api/src/flow/anomaly.service.ts` (or extend collector AnomalyService) | New rule |
| `apps/api/src/flow/flow.service.ts` | Call rule after write |
| `grafana/provisioning/dashboards/flows.json` | New dashboard |
| `grafana/provisioning/dashboards/overview.json` | Link to flows dashboard |
| `apps/api/tests/flow-anomaly.test.ts` | Rule unit tests |
| `ARCHITECTURE.md` | Document the rule + dashboard |

---

## How to Verify

```bash
pnpm run typecheck && pnpm run test
# with the sensor running and some hardcoded-IP traffic (e.g. a DoH client by IP):
# Grafana → Flows dashboard shows the no-DNS-provenance table populated
# and a NO_DNS_CONNECTION alert appears in Open Alerts
```

---

## Next Task

**Task 21** — Gateway investigation mode: route the phone through the Mac so the same sensor sees its traffic.
