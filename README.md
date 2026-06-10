# Network Monitor

Home network DNS monitoring tool. Captures DNS queries from personal devices via AdGuard Home, stores them in PostgreSQL enriched with IP geolocation (MaxMind GeoLite2), and visualizes traffic in Grafana — including a world map of where your devices are talking to.

**Architecture:** `ARCHITECTURE.md` | **Task log:** `docs/tasks/`

## Services

| Service | URL | Purpose |
|---|---|---|
| AdGuard Home | http://localhost:3000 | DNS sinkhole + query logger (native launchd service, not Docker) |
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

To also start Grafana and set up the native AdGuard Home service:

```bash
pnpm run bootstrap:full
```

3. AdGuard Home runs as a **native macOS service** (launchd daemon), not in Docker — Docker Desktop's network relays destroy client source IPs, which breaks per-device attribution (see `docs/tasks/13-unknown-ip-visibility.md` and `15-adguard-host-networking.md`). Its config is rendered automatically from `adguardhome/AdGuardHome.template.yaml` using your `.env` credentials — no setup wizard. Bootstrap downloads the binary and prints the one-line `sudo` install command (binary + config are copied to `/Applications/AdGuardHome/` — macOS TCC blocks launchd daemons from reading `~/Documents`).

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
pnpm run infra:up             # start containers (Postgres + Grafana); AdGuard runs natively
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

## Roadmap

Phase 1 (DNS pipeline) and Phase 2a (DoH blocking) are complete. Planned next — see `docs/tasks/` and `ARCHITECTURE.md`:

- **Flow capture (Phase 2b, Tasks 19–20):** a passive **Zeek** sensor on `en0` records connection metadata (`NetworkFlow` table) — WebRTC/UDP media, DoH-by-IP, TLS SNI hostnames, and "connections with no DNS provenance" — the things DNS structurally can't see. Passive and always-on-safe for this Mac (no routing change). Adds a Zeek install + `scripts/zeek-sensor.sh`.
- **Gateway investigation mode (Task 21):** optionally route another device (the phone) *through* the Mac so the same sensor sees its traffic. On-demand only — the routed device depends on the Mac while enabled.
- **Phase 5:** move the stack to an always-on Raspberry Pi gateway for network-wide capture without the per-device routing tradeoff.
