#!/usr/bin/env bash
# Start the passive Zeek sensor for the lifetime of the API dev server.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

stop_on_exit=0

cleanup() {
  if [[ "$stop_on_exit" -eq 1 ]]; then
    echo "Stopping Zeek sensor..."
    sudo scripts/zeek-sensor.sh stop
  fi
}
trap cleanup EXIT

if scripts/zeek-sensor.sh status >/dev/null 2>&1; then
  echo "Zeek sensor already running; it will stop when the API exits."
  stop_on_exit=1
else
  echo "Starting Zeek sensor..."
  sudo scripts/zeek-sensor.sh start
  stop_on_exit=1
fi

pnpm run dev
