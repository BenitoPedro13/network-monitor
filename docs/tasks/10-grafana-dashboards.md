# Task 10 — Grafana Provisioning & Dashboards

**Phase:** 1 — Foundation  
**Group:** Grafana  
**Status:** Pending  
**Date:** 2026-06-10

---

## What and Why

Wire up Grafana so it auto-connects to Postgres on startup and loads dashboards from version-controlled JSON — no manual UI setup required.

Three dashboards:
1. **Overview** — live query volume, top domains, top countries, device breakdown
2. **Per-device** — drill-down into a single device's DNS history
3. **World Map** — destination IPs plotted on a Geomap panel

---

## Files Changed

| File | Change |
|---|---|
| `grafana/provisioning/datasources/postgres.yaml` | Postgres datasource config |
| `grafana/provisioning/dashboards/dashboard.yaml` | Dashboard provider (points Grafana at JSON files) |
| `grafana/provisioning/dashboards/overview.json` | Overview dashboard |
| `grafana/provisioning/dashboards/device.json` | Per-device dashboard |
| `grafana/provisioning/dashboards/geomap.json` | World map dashboard |
| `docker-compose.yml` | Pass Postgres credentials to Grafana container |

---

## Decisions

- **Provisioning over UI** — datasources and dashboards are version-controlled JSON/YAML, applied automatically on container start. No click-ops.
- **Grafana gets Postgres creds via env vars** — `docker-compose.yml` passes `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` into the Grafana container; the datasource YAML reads `${POSTGRES_USER}` etc.
- **Internal Docker hostname** — Grafana connects to `postgres:5432` (the Docker service name), not `localhost`.
- **`POSTGRES_PORT` is NOT used** — that port is the host-side binding. Inside Docker, Postgres always listens on `5432`.
- **Dashboard JSON generated from scratch** — no Grafana UI export needed. Panels use raw SQL against the Postgres datasource.

---

## How to Verify

```bash
pnpm run infra:down && pnpm run infra:up
```

Open http://localhost:3001 → login admin / network_monitor → Dashboards → confirm all three load with data.
