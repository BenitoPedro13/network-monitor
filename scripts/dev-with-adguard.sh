#!/usr/bin/env bash
# Start native AdGuard Home before launching the API dev server.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -o allexport
  source .env
  set +o allexport
fi

ADGUARD_BIN="${ADGUARD_BIN:-/Applications/AdGuardHome/AdGuardHome}"
ADGUARD_WEB_PORT="${ADGUARD_WEB_PORT:-3000}"
ADGUARD_URL="${ADGUARD_URL:-http://localhost:${ADGUARD_WEB_PORT}}"
ADGUARD_STATUS_URL="${ADGUARD_URL%/}/control/status"
stop_adguard_on_exit=0

cleanup() {
  if [[ "$stop_adguard_on_exit" -eq 1 ]]; then
    echo "Stopping AdGuard Home service..."
    sudo "$ADGUARD_BIN" -s stop
  fi
}
trap cleanup EXIT

status_code() {
  local status
  status="$(curl -s -o /dev/null -w "%{http_code}" "$ADGUARD_STATUS_URL" 2>/dev/null || true)"
  if [[ "$status" == "000"* ]]; then
    echo "000"
    return
  fi
  echo "$status"
}

is_adguard_up() {
  local status="$1"
  [[ "$status" == "200" || "$status" == "302" || "$status" == "303" || "$status" == "401" || "$status" == "403" ]]
}

status="$(status_code)"
if is_adguard_up "$status"; then
  echo "AdGuard Home already running at ${ADGUARD_URL}."
  stop_adguard_on_exit=1
else
  if [[ "$status" != "000" ]]; then
    echo "Port ${ADGUARD_WEB_PORT} is responding, but not like AdGuard Home (HTTP ${status})." >&2
    echo "Stop the other process first, then rerun pnpm run dev." >&2
    exit 1
  fi

  if [[ ! -x "$ADGUARD_BIN" ]]; then
    echo "AdGuard Home binary not found at ${ADGUARD_BIN}." >&2
    echo "Run pnpm run bootstrap:full to install the native service." >&2
    exit 1
  fi

  echo "Starting native AdGuard Home service..."
  sudo "$ADGUARD_BIN" -s start
  stop_adguard_on_exit=1

  for _ in {1..20}; do
    status="$(status_code)"
    if is_adguard_up "$status"; then
      echo "AdGuard Home is running at ${ADGUARD_URL}."
      break
    fi
    sleep 1
  done

  if ! is_adguard_up "$status"; then
    echo "AdGuard Home did not become ready at ${ADGUARD_STATUS_URL} (HTTP ${status})." >&2
    echo "Check /var/log/AdGuardHome.stderr.log for details." >&2
    exit 1
  fi
fi

pnpm --filter @network-monitor/api run dev
