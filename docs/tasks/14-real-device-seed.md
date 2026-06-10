# Task 14 — Seed Real Devices

**Phase:** 1 — Foundation  
**Group:** Devices  
**Status:** Done  
**Date:** 2026-06-10

---

## What and Why

Last open Phase 1 checklist item. `scripts/seed.ts` currently seeds a fictional `mac-mini-monitor` device plus dummy `DnsEvent` and `Alert` rows (which pollute dashboards with May-dated artifacts on every run). Replace it with the real device fleet as verified under native AdGuard (Task 17), and make it purely idempotent — upserts only, no fake data.

## Real device fleet

| name | ipAddress | type | why |
|---|---|---|---|
| `macbook-loopback` | `127.0.0.1` | laptop | MacBook's own queries arrive via loopback (IPv4) |
| `macbook-loopback-v6` | `::1` | laptop | same, IPv6 loopback path |
| `macbook-benito` | `192.168.1.6` | laptop | MacBook's LAN IP (if anything queries via the LAN interface) |
| `android-benito` | `192.168.1.21` | phone | Android phone, static Wi-Fi IP |

All four already exist in the live DB (added ad hoc during Tasks 15/17) — the seed codifies them so a fresh machine reproduces the same state.

## Cleanup

- Remove dummy `DnsEvent` + `Alert` creation from the seed
- Stale device rows in the live DB (`mac-mini-monitor`, `macbook-docker-nat`) are **left in place** — `Device` deletion cascades to `DnsEvent`/`Alert` (`onDelete: Cascade`), which would erase real captured history. They simply receive no new traffic. The seed stops creating them.

## Files Changed

| File | Change |
|---|---|
| `apps/api/scripts/seed.ts` | Real device upserts; remove dummy event/alert seeding |

## How to Verify

```bash
pnpm run db:seed     # runs clean, idempotent (run twice — no errors, no duplicates)
docker exec network_monitor_postgres psql -U network_monitor -d network_monitor \
  -c 'SELECT name, "ipAddress" FROM "Device" ORDER BY name;'
```

## Next Task

Phase 1 complete. Next: Phase 2a (block DoH providers in AdGuard) per ARCHITECTURE.md.
