# Task 12 — Grafana Alert Panels

**Phase:** 1 — Foundation  
**Group:** Grafana  
**Status:** In Progress  
**Date:** 2026-06-10

---

## What and Why

The `Alert` table is now populated by `AnomalyService` (Task 11), but no Grafana dashboard queries it — alerts are invisible outside `psql`. ARCHITECTURE.md §7.3 planned alert panels that Task 10 left out:

1. **Overview dashboard** — "Open Alerts" table (type, device, title, risk score, created) + an "Open Alerts" stat panel in the top row
2. **Per-Device dashboard** — "Alert History" table for the selected `$device`, all statuses

This closes the "basic alerting" gap in the Phase 1 deliverable.

---

## Files Changed

| File | Change |
|---|---|
| `grafana/provisioning/dashboards/overview.json` | Add "Open Alerts" stat (top row) + "Open Alerts" table panel |
| `grafana/provisioning/dashboards/device.json` | Add "Alert History" table panel |

---

## Panel Specs

**Overview — stat "Open Alerts"** (top row alongside existing stats; row becomes 5 × w=4 panels, or stat appended at w=4 with existing four narrowed):

```sql
SELECT count(*) FROM "Alert" WHERE status = 'OPEN'
```

**Overview — table "Open Alerts"** (full width, below the two existing tables):

```sql
SELECT a."createdAt" AS time, d.name AS device, a.type, a.title, a."riskScore" AS risk
FROM "Alert" a JOIN "Device" d ON d.id = a."deviceId"
WHERE a.status = 'OPEN'
ORDER BY a."riskScore" DESC, a."createdAt" DESC
```

Risk score column gets threshold coloring matching the ARCHITECTURE.md scale (0–30 info, 31–60 yellow, 61–80 orange, 81–100 red).

**Per-Device — table "Alert History"** (full width, below existing tables, filtered by the existing `$device` variable):

```sql
SELECT a."createdAt" AS time, a.type, a.status, a.title, a."riskScore" AS risk
FROM "Alert" a JOIN "Device" d ON d.id = a."deviceId"
WHERE d.name = '$device'
ORDER BY a."createdAt" DESC
```

---

## Decisions

- **No time-range filter on the Open Alerts table** — an open alert is relevant regardless of the dashboard's selected window; closing it is a status change, not a time decay.
- **Alert History shows all statuses** — the per-device view is for investigation; resolved/acknowledged history is part of the story.
- **No alert management (acknowledge/resolve) in Grafana** — that's Phase 4 (REST API + Web UI). Grafana is read-only here.

---

## How to Verify

```bash
docker compose restart grafana
```

Open http://localhost:3001 → Overview shows the Open Alerts stat + table; Per-Device shows Alert History for the selected device. Seeded/real alerts from the collector should appear.

---

## Next Task

**Task 13** — unknown-IP drop logging + unstable client IP investigation. **Task 14** — update `scripts/seed.ts` with real device IPs; last open Phase 1 checklist item.
