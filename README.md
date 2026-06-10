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

## Flow Sensor (Zeek)

A passive Zeek sensor on `en0` records connection metadata (the `NetworkFlow` table): WebRTC/UDP media, DoH-by-IP, TLS SNI hostnames, and connections with no DNS provenance. Passive capture changes no routing — safe to leave on.

```bash
brew install zeek                      # one-time install
sudo scripts/zeek-sensor.sh start      # capture on en0 (set ZEEK_IFACE to override)
scripts/zeek-sensor.sh status          # pid + log line counts
sudo scripts/zeek-sensor.sh stop
```

Zeek writes JSON `conn.log`/`ssl.log` to `zeek/logs/` (gitignored); the API's `flow/` module tails them every `FLOW_POLL_INTERVAL_MS` (default 30s) and ingests internet-egress flows. The collector keeps working if the sensor is off — it just logs a warning at startup.

For local development, use one lifecycle command:

```bash
pnpm run dev:flow
```

That starts Zeek with `sudo`, starts native AdGuard Home if it is not already running, runs the API dev server as your normal user, and stops Zeek plus AdGuard Home on exit/Ctrl-C so port `3000` is free for other local apps.

## Useful Commands

```bash
pnpm run infra:up             # start containers (Postgres + Grafana); AdGuard runs natively
pnpm run infra:up:postgres    # start Postgres only
pnpm run infra:down           # stop all containers
pnpm run infra:logs           # tail container logs
pnpm run db:migrate           # run Prisma migrations
pnpm run db:seed              # seed Device table with registered devices
pnpm run dev                  # start AdGuard if needed + API collector
pnpm run dev:flow             # start Zeek sensor + AdGuard if needed + API collector
pnpm run typecheck            # typecheck all workspaces
pnpm run geoip:update         # download/update MaxMind GeoLite2 .mmdb databases
pnpm run test:infra           # smoke test — checks all services are healthy
pnpm run test                 # unit tests for collector + flow modules
scripts/zeek-sensor.sh status          # passive flow sensor status
sudo scripts/zeek-sensor.sh start|stop # passive flow sensor control (Zeek on en0)
```

## Roadmap

Phase 1 (DNS pipeline), Phase 2a (DoH blocking), and Phase 2b flow capture for the Mac (Task 19, see above) are complete. Planned next — see `docs/tasks/` and `ARCHITECTURE.md`:

- **Gateway investigation mode (Task 21):** optionally route another device (the phone) *through* the Mac so the same sensor sees its traffic. On-demand only — the routed device depends on the Mac while enabled.
- **Phase 5:** move the stack to an always-on Raspberry Pi gateway for network-wide capture without the per-device routing tradeoff.
