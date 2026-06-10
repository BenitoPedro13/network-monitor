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

1. Copy env file and fill in credentials:

```bash
cp .env.example .env
```

2. Bootstrap the project:

```bash
pnpm run bootstrap
```

This automatically: installs dependencies, starts Postgres, generates Prisma Client, applies migrations, runs seed, and typechecks.

To also start AdGuard Home and Grafana:

```bash
pnpm run bootstrap:full
```

3. Complete the AdGuard Home wizard at `http://localhost:3000`, then set `ADGUARD_USER` and `ADGUARD_PASSWORD` in your `.env`.

4. Download MaxMind GeoLite2 databases (free, requires registration at maxmind.com):

```bash
# After setting MAXMIND_LICENSE_KEY in .env:
pnpm run geoip:update
```

Files are saved to `./geoip/` (gitignored). Update weekly for accurate geolocation data.

5. Validate DNS is working through AdGuard:

```bash
dig google.com @127.0.0.1 -p 18053
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
pnpm run test:infra           # smoke test — checks all services are healthy
pnpm run test                 # unit tests for collector modules
```
