#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WITH_ADGUARD="false"

if [[ "${1:-}" == "--with-adguard" ]]; then
  WITH_ADGUARD="true"
fi

cd "$ROOT_DIR"

log() {
  printf '\n[bootstrap] %s\n' "$1"
}

warn() {
  printf '\n[bootstrap] warning: %s\n' "$1" >&2
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '[bootstrap] error: command "%s" not found in PATH.\n' "$1" >&2
    exit 1
  fi
}

require_cmd pnpm
require_cmd docker

if ! docker info >/dev/null 2>&1; then
  printf '[bootstrap] error: Docker is not running. Start Docker Desktop and try again.\n' >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  log ".env not found, copying from .env.example"
  cp .env.example .env
  log "Fill in the credentials in .env (ADGUARD_*, MAXMIND_LICENSE_KEY), then rerun bootstrap."
  exit 0
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ ! -f apps/api/.env ]]; then
  log "apps/api/.env not found, generating with default DATABASE_URL"
  cat > apps/api/.env <<'EOF'
DATABASE_URL=postgresql://network_monitor:network_monitor@localhost:5433/network_monitor?schema=public
EOF
fi

bcrypt_hash() {
  if command -v htpasswd >/dev/null 2>&1; then
    htpasswd -B -n -b x "$1" | cut -d: -f2
  else
    docker run --rm httpd:2.4-alpine htpasswd -Bbn x "$1" | cut -d: -f2
  fi
}

render_adguard_config() {
  if [[ -f adguardhome/conf/AdGuardHome.yaml ]]; then
    return 0
  fi
  if [[ -z "${ADGUARD_USER:-}" || -z "${ADGUARD_PASSWORD:-}" ]]; then
    warn "ADGUARD_USER/ADGUARD_PASSWORD not set in .env — skipping AdGuard config render (the web wizard will run instead)"
    return 0
  fi
  log "Rendering adguardhome/conf/AdGuardHome.yaml from template (skips the AdGuard wizard)"
  local hash
  hash="$(bcrypt_hash "$ADGUARD_PASSWORD")"
  mkdir -p adguardhome/conf
  sed -e "s|__ADGUARD_USER__|$ADGUARD_USER|" \
      -e "s|__ADGUARD_PASSWORD_HASH__|$hash|" \
      adguardhome/AdGuardHome.template.yaml > adguardhome/conf/AdGuardHome.yaml
  chmod 600 adguardhome/conf/AdGuardHome.yaml
}

log "Installing dependencies with pnpm"
pnpm install

if [[ "$WITH_ADGUARD" == "true" ]]; then
  render_adguard_config
  log "Starting containers (postgres + adguardhome + grafana)"
  docker compose up -d
else
  log "Starting postgres container"
  docker compose up -d postgres
fi

log "Waiting for Postgres to become available"
until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-network_monitor}" -d "${POSTGRES_DB:-network_monitor}" >/dev/null 2>&1; do
  sleep 2
done

log "Generating Prisma Client"
pnpm --filter @network-monitor/api run db:generate

log "Applying migrations"
pnpm --filter @network-monitor/api run db:migrate

log "Running seed"
pnpm --filter @network-monitor/api run db:seed

if [[ -n "${MAXMIND_LICENSE_KEY:-}" ]]; then
  if [[ -f geoip/GeoLite2-City.mmdb && -f geoip/GeoLite2-ASN.mmdb ]]; then
    log "GeoLite2 databases already present — skipping download"
  else
    log "Downloading MaxMind GeoLite2 databases"
    pnpm run geoip:update
  fi
else
  warn "MAXMIND_LICENSE_KEY not set in .env — skipping GeoLite2 download (collector needs the .mmdb files to start)"
fi

log "Running typecheck"
pnpm run typecheck

if [[ "$WITH_ADGUARD" == "true" ]]; then
  log "Running infra smoke tests"
  pnpm run test:infra
fi

log "Done."
cat <<'EOF'

Manual steps that cannot be automated:
  1. Docker Desktop -> Settings -> Resources -> Network -> "Enable host networking"
     (required: AdGuard runs with network_mode: host), then Apply & restart.
  2. Point this machine's DNS to 127.0.0.1 (System Settings -> Network -> DNS).
  3. For other devices: set their DNS to this machine's LAN IP and give them
     static IPs (router DHCP reservation), then register them in the seed.

URLs:  AdGuard http://localhost:3000  |  Grafana http://localhost:3001
Next:  pnpm run dev   (starts the collector)
EOF
