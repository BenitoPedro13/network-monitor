#!/usr/bin/env bash
# Passive flow sensor (Task 19): Zeek on en0 writing JSON conn.log/ssl.log
# to zeek/logs/ for the flow ingest module. Requires sudo (BPF access).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT/zeek/logs"
PID_FILE="$LOG_DIR/zeek.pid"
IFACE="${ZEEK_IFACE:-en0}"

usage() {
  echo "Usage: scripts/zeek-sensor.sh status | sudo scripts/zeek-sensor.sh {start|stop}" >&2
  exit 1
}

running_pid() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE")"
  local kill_output
  if kill_output="$(kill -0 "$pid" 2>&1)"; then
    echo "$pid"
    return 0
  fi
  if [[ "$kill_output" == *"Operation not permitted"* || "$kill_output" == *"operation not permitted"* ]]; then
    echo "$pid"
    return 0
  fi
  return 1
}

require_root_for_stop() {
  if [[ "$EUID" -ne 0 ]]; then
    echo "Error: stopping packet capture needs root. Run: sudo scripts/zeek-sensor.sh stop" >&2
    exit 1
  fi
}

cmd_start() {
  if ! command -v zeek >/dev/null 2>&1; then
    echo "Error: zeek not found. Install it with: brew install zeek" >&2
    exit 1
  fi
  if [[ "$EUID" -ne 0 ]]; then
    echo "Error: packet capture needs root. Run: sudo scripts/zeek-sensor.sh start" >&2
    exit 1
  fi
  if pid="$(running_pid)"; then
    echo "Already running (pid $pid)"
    exit 0
  fi
  mkdir -p "$LOG_DIR"
  cd "$LOG_DIR"
  nohup zeek -i "$IFACE" "$ROOT/zeek/local.zeek" >zeek.out 2>&1 &
  echo $! >"$PID_FILE"
  sleep 2
  if pid="$(running_pid)"; then
    echo "Zeek capturing on $IFACE (pid $pid), logs in zeek/logs/"
  else
    echo "Error: Zeek exited immediately — check zeek/logs/zeek.out" >&2
    tail -5 zeek.out >&2 || true
    exit 1
  fi
}

cmd_stop() {
  if pid="$(running_pid)"; then
    require_root_for_stop
    kill "$pid"
    rm -f "$PID_FILE"
    echo "Stopped (pid $pid)"
  else
    echo "Not running"
  fi
}

cmd_status() {
  if pid="$(running_pid)"; then
    echo "Running (pid $pid) on $IFACE"
    for f in conn.log ssl.log; do
      if [[ -f "$LOG_DIR/$f" ]]; then
        echo "  $f: $(wc -l <"$LOG_DIR/$f" | tr -d ' ') lines"
      else
        echo "  $f: not created yet"
      fi
    done
  else
    echo "Not running"
    exit 1
  fi
}

case "${1:-}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  *) usage ;;
esac
