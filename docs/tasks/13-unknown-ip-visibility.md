# Task 13 — Unknown-IP Drop Visibility + Unstable Client IP Investigation

**Phase:** 1 — Foundation  
**Group:** Collector  
**Status:** In Progress  
**Date:** 2026-06-10

---

## What and Why

On 2026-06-10 ingestion silently stopped for ~11 hours: the Docker NAT client IP that AdGuard reports for the MacBook's traffic changed from `185.199.108.153` to `149.112.112.10`, the new IP wasn't registered in `Device`, and the mapper dropped every event with **no log line** while the cursor kept advancing. The dashboards showed "No data" and nothing in the collector logs explained why.

Two parts:

1. **Drop logging (code)** — make unknown-IP drops visible in every poll cycle
2. **Investigation (research)** — understand why the MacBook's queries arrive with unstable, bogus public source IPs (`185.199.108.153` is GitHub Pages, `149.112.112.10` is Quad9 — these are not normal NAT addresses)

---

## Part 1 — Drop Logging

In `CollectorService.runPoll()`, after mapping, compare raw vs mapped counts and log the unknown source IPs:

```
WARN [CollectorService] Dropped 410/1000 events from unregistered IPs: 149.112.112.10 (410)
```

- Log at `warn` level — this is the signal that ingestion is broken for a device
- Aggregate per IP with counts; one line per poll, not per event
- Only log when at least one event was dropped (quiet when everything maps)
- Logic lives in `MapperService` (it already owns the device map) or computed in `CollectorService` from the count difference — decide at implementation time, keep it to a count + grouped IP list

### Files Changed

| File | Change |
|---|---|
| `apps/api/src/collector/collector.service.ts` | Log dropped count + unknown IPs per poll |
| `apps/api/src/collector/mapper.service.ts` | Possibly expose dropped-IP info from mapping |
| `apps/api/tests/mapper.test.ts` or `collector.test.ts` | Cover the dropped-IP aggregation |

---

## Part 2 — Unstable Client IP Investigation

Questions to answer (no code, findings go in this doc):

1. How does the MacBook's DNS traffic actually reach AdGuard? (`scutil --dns`, system DNS settings, port 53 vs published `18053`)
2. Why does AdGuard see public IPs as the client? Hypotheses:
   - Docker Desktop port-forward proxy rewrites the source address oddly
   - macOS resolver behavior with multiple configured DNS servers (the "client" IPs seen so far are both public DNS/CDN addresses — `149.112.112.10` is literally Quad9's resolver, suggesting the Mac may be multipathing DNS and AdGuard is misattributing, or traffic is being redirected)
3. Can the client IP be made stable? Candidate fixes to evaluate:
   - Docker Desktop host networking (supported in recent versions) so AdGuard sees real LAN IPs
   - Binding AdGuard's DNS port directly to the host LAN IP
   - Registering devices by AdGuard client-ID instead of raw IP (AdGuard supports client identification)

### Findings (2026-06-10)

**How the Mac's DNS reaches AdGuard:** macOS resolver #1 is `127.0.0.1` (then router `192.168.1.1` as fallback). The AdGuard container publishes `53:53` (tcp+udp), and Docker Desktop's `com.docker.backend` process listens on host port 53 and forwards into the VM. There is no pf redirect or third-party proxy involved.

**Why the client IP is bogus:** AdGuard's upstream is DoH `https://dns10.quad9.net/dns-query` with `bootstrap_dns` including `149.112.112.10` — which is exactly the "client" IP AdGuard reports (its rDNS even resolves to `dns10.quad9.net`). The container keeps long-lived flows to that Quad9 endpoint, and Docker Desktop's userspace network forwarding misattributes the source address of forwarded host→container packets, stamping them with the address of an existing container↔external flow. The earlier artifact `185.199.108.153` (GitHub Pages) was the same bug with a different hot flow. Conclusion: **the client IP for host-originated queries is an arbitrary echo of the container's own outbound connections — it is meaningless and will change whenever those flows change** (Docker restart, upstream change, etc.).

**Implication:** any traffic entering AdGuard through the Docker port-forward (including LAN devices, despite the older ARCHITECTURE note) may be subject to the same misattribution. IP-based device mapping is only trustworthy if the source address survives the forwarding path.

### Mitigation options (decision → Task 15)

1. **Docker Desktop host networking** for the AdGuard container (supported in Docker Desktop ≥ 4.34) — AdGuard would bind the host interfaces directly and see real source IPs. Cleanest fix; needs verifying UDP support and compose changes.
2. **Point the Mac's DNS at its LAN IP** (`192.168.1.6`) instead of `127.0.0.1` — may or may not dodge the misattribution since it still traverses the same forwarder; cheap to test.
3. **Status quo + visibility (current state):** register artifact IPs as `Device` rows as they appear; the new WARN drop-log makes breakage visible within one poll cycle.

### Outcome

Part 1 (drop logging) implemented. Root cause documented above; mitigation decision deferred to **Task 15** (evaluate host networking for AdGuard).

---

## How to Verify

```bash
pnpm run typecheck
pnpm run test
pnpm run dev   # temporarily rename a Device row's IP → WARN line appears within one poll
```

---

## Next Task

**Task 14** — update `scripts/seed.ts` with real device IPs; last open Phase 1 checklist item.
