# Network Monitor

Home network DNS monitoring tool. Captures DNS queries from personal devices via AdGuard Home, stores them in PostgreSQL enriched with IP geolocation (MaxMind GeoLite2), and visualizes traffic in Grafana — including a world map of where your devices are talking to.

**Architecture:** `ARCHITECTURE.md` | **Task log:** `docs/tasks/`

## Services

| Service | URL | Purpose |
|---|---|---|
| AdGuard Home | http://localhost:3000 | DNS sinkhole + query logger |
| Grafana | http://localhost:3001 | Dashboards and visualization |
| PostgreSQL | localhost:5433 | Data store |

## Quick Start

1. Copy env file and fill in credentials (`ADGUARD_USER`/`ADGUARD_PASSWORD`, `MAXMIND_LICENSE_KEY`):

```bash
cp .env.example .env
```

2. Bootstrap the project:

```bash
pnpm run bootstrap
```

This automatically: installs dependencies, starts Postgres, generates Prisma Client, applies migrations, runs seed, downloads the GeoLite2 databases (if `MAXMIND_LICENSE_KEY` is set), and typechecks. At the end it prints the checklist of manual host-level steps (DNS setting, Docker host-networking toggle).

To also start AdGuard Home and Grafana:

```bash
pnpm run bootstrap:full
```

3. AdGuard runs with host networking and binds ports 53 (DNS) and 3000 (web UI) directly on the host. On macOS, enable **Docker Desktop → Settings → Resources → Network → Enable host networking** first (one-time). Its config is rendered automatically from `adguardhome/AdGuardHome.template.yaml` using your `.env` credentials — no setup wizard. (The wizard only appears if you start AdGuard without `ADGUARD_USER`/`ADGUARD_PASSWORD` set.)

4. Download MaxMind GeoLite2 databases (free, requires registration):
   - Register at maxmind.com → Account → Manage License Keys → Create new key
   - Add `MAXMIND_LICENSE_KEY=your_key` to `.env`
   - Then run:

```bash
pnpm run geoip:update
```

Files (`GeoLite2-City.mmdb` ~60MB, `GeoLite2-ASN.mmdb` ~8MB) are saved to `./geoip/` (gitignored). Re-run weekly to keep geolocation data fresh.

5. Validate DNS is working through AdGuard:

```bash
dig google.com @127.0.0.1
```

## Useful Commands

```bash
pnpm run infra:up             # start all services (Postgres + AdGuard + Grafana)
pnpm run infra:up:postgres    # start Postgres only
pnpm run infra:down           # stop all containers
pnpm run infra:logs           # tail container logs
pnpm run db:migrate           # run Prisma migrations
pnpm run db:seed              # seed Device table with registered devices
pnpm run typecheck            # typecheck all workspaces
pnpm run geoip:update         # download/update MaxMind GeoLite2 .mmdb databases
pnpm run test:infra           # smoke test — checks all services are healthy
pnpm run test                 # unit tests for collector modules
```
