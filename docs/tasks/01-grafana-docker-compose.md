# Task 01 — Add Grafana to docker-compose.yml

**Phase:** 1 — Foundation  
**Group:** Infrastructure  
**Status:** Done  
**Date:** 2026-06-09

---

## What and Why

Grafana is the visualization layer. It connects directly to PostgreSQL as a native data source and renders the dashboards. Adding it to `docker-compose.yml` means it starts alongside Postgres and AdGuard Home with a single `pnpm run infra:up`, and its configuration is version-controlled.

We are also creating the provisioning directory scaffold now so later tasks (datasource + dashboard JSONs) have a place to land without touching `docker-compose.yml` again.

---

## What This Task Does

1. **Adds a `grafana` service** to `docker-compose.yml` with:
   - Image: `grafana/grafana:11-oss` (open source, no license required)
   - Port: `3001` on the host → `3000` inside the container (avoids collision with AdGuard Home which already owns host port `3000`)
   - Admin credentials from env vars with safe defaults
   - Sign-up disabled (single-user local tool)
   - Two volumes: one for persistent Grafana data (dashboards saved in UI, plugins, etc.) and one bind-mount for provisioning files
   - `depends_on` with `service_healthy` on Postgres so Grafana only starts after the DB is ready

2. **Adds a `grafana_data` named volume** to the `volumes:` block so Grafana state survives `docker compose down` (but not `docker compose down -v`)

3. **Creates the provisioning directory scaffold** on disk:
   ```
   grafana/
   └── provisioning/
       ├── datasources/       ← Task 05 will add postgres.yaml here
       └── dashboards/        ← Tasks 06-08 will add JSON files here
   ```
   Grafana reads these directories on startup. They are bind-mounted into the container at `/etc/grafana/provisioning`.

4. **Adds a `.gitkeep`** in each empty directory so git tracks the scaffold.

---

## Files Changed

| File | Change |
|---|---|
| `docker-compose.yml` | Add `grafana` service + `grafana_data` volume |
| `grafana/provisioning/datasources/.gitkeep` | New (empty, git placeholder) |
| `grafana/provisioning/dashboards/.gitkeep` | New (empty, git placeholder) |

---

## Decisions

- **`grafana/grafana:latest`** — the `-oss` suffix tag does not exist on Docker Hub; OSS is the default `grafana/grafana` image (enterprise is a separate image `grafana/grafana-enterprise`). Using `latest` for now; pin to a specific version (e.g. `grafana/grafana:11.5.0`) once the stack is stable.
- **Port 3001** — AdGuard Home already binds host port `${ADGUARD_WEB_PORT:-3000}`. Grafana gets 3001 to avoid conflict.
- **`depends_on: postgres: condition: service_healthy`** — Grafana will attempt to connect to Postgres at startup. Without this guard it can start before Postgres is ready and log misleading connection errors. Postgres already has a `healthcheck` configured in `docker-compose.yml`.
- **Named volume for data, bind-mount for provisioning** — Grafana's internal state (user preferences, manually-created dashboards, plugin installs) goes in the named volume so it survives restarts. Provisioning files are bind-mounted so we can edit them in the repo without rebuilding the container.

---

## Env Vars Used

These will be added to `.env.example` in Task 02. Defaults are set inline in `docker-compose.yml` as fallbacks so the stack works even before `.env` is configured.

| Var | Default | Purpose |
|---|---|---|
| `GRAFANA_PORT` | `3001` | Host port for Grafana UI |
| `GRAFANA_USER` | `admin` | Grafana admin username |
| `GRAFANA_PASSWORD` | `network_monitor` | Grafana admin password |

---

## How to Verify

After this task, running:

```bash
pnpm run infra:up
```

Should start three containers: `network_monitor_postgres`, `network_monitor_adguardhome`, `network_monitor_grafana`.

```bash
docker compose ps
```

Expected output: all three services with status `Up` or `healthy`.

Grafana UI should be reachable at `http://localhost:3001` with credentials `admin / network_monitor`.

---

## Next Task

**Task 02** — Add new env vars to `.env.example` (AdGuard credentials, MaxMind license key, Grafana vars).
