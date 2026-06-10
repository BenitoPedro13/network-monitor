# Task 15 — AdGuard Host Networking (stable client IPs)

**Phase:** 1 — Foundation  
**Group:** Infrastructure  
**Status:** In Progress  
**Date:** 2026-06-10

---

## What and Why

Task 13 found that Docker Desktop's port-forwarding stamps host-originated DNS packets with bogus, unstable source addresses (echoes of the container's own outbound flows). The whole pipeline keys device mapping on `DnsEvent.sourceIp`, so this breaks ingestion silently whenever the artifact IP rotates — and may also misattribute LAN devices.

Fix candidate: run the AdGuard container with **host networking** (Docker Desktop ≥ 4.34 supports it) so AdGuard binds host interfaces directly and sees real client source IPs.

This must land before Task 14 (registering real device IPs) — there is no point registering IPs that arrive mangled.

---

## Evaluation Steps

1. Verify Docker Desktop host networking is enabled and UDP source addresses survive:
   - run a throwaway host-network UDP listener, send packets from the host (loopback + LAN IP), record observed source
2. If sources are real → switch `adguardhome` service to `network_mode: host`, drop its `ports:` block
3. AdGuard listens on 53 (DNS) and 3000 (web UI) directly on host interfaces — confirm no conflicts (Grafana is on 3001, collector connects to `localhost:3000` unchanged)
4. Re-test: Mac query → AdGuard querylog shows a stable, real client IP; update `Device` rows accordingly

### Experiment results

- **2026-06-10, attempt 1:** Docker 29.2.0 on Docker Desktop. `--net=host` container starts, but its "host" namespace is the **Linux VM** (eth0 `192.168.65.3`), not macOS — UDP packets sent to `127.0.0.1:5354` and `192.168.1.6:5354` never arrived. Cause: Docker Desktop's host-networking feature is **disabled** (default; no key in `settings-store.json`). It must be enabled in Docker Desktop UI: *Settings → Resources → Network → Enable host networking* → Apply & restart. Restart briefly stops Postgres/AdGuard/Grafana (Mac DNS falls back to router during the gap).
- **Attempt 2 (after enabling, 2026-06-10):** host-network UDP listener now receives packets on Mac ports. Mac-originated probes arrive as `127.0.0.1` (IPv4) — loopback, **stable**. After switching AdGuard to `network_mode: host`, real queries from the Mac log client `::1` (macOS resolver prefers IPv6 loopback). DNS resolution (NOERROR) and web UI (port 3000) both confirmed working.
- **Decision:** host networking adopted. Mac traffic is keyed on loopback (`::1` registered as device `macbook-loopback-v6`; `127.0.0.1` row kept for IPv4 fallback). The rotating-public-IP artifact is gone. **Open question:** what source IP LAN devices (iPhone/iPad) appear with through the host-networking relay — verify with a real device before Task 14 registers them.
- Obsolete env vars `ADGUARD_WEB_PORT` / `ADGUARD_DNS_PORT` removed from `.env.example` (host networking binds 53/3000 directly).

---

## Files Changed

| File | Change |
|---|---|
| `docker-compose.yml` | `adguardhome`: `network_mode: host`, remove `ports:` |
| `.env.example` / `README.md` | Update if AdGuard port semantics change |

---

## Risks

- Docker Desktop host networking may not preserve UDP source addresses either (it still traverses the VM boundary) — the experiment in step 1 decides before any compose change
- If host networking is a dead end: fall back to Task 13 mitigation 3 (artifact-IP registration + WARN visibility), and consider running AdGuard natively on the host (brew) as Phase 2 infra change

---

## How to Verify

```bash
pnpm run infra:down && pnpm run infra:up
dig @localhost example.com   # then check querylog client IP via AdGuard API
pnpm run test:infra
```

---

## Next Task

**Task 14** — seed real device IPs (unblocked once client IPs are trustworthy).
