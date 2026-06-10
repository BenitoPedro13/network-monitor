#!/usr/bin/env bash
set -euo pipefail

PASS="\033[0;32mPASS\033[0m"
FAIL="\033[0;31mFAIL\033[0m"

ok=true

# Load .env if present so we can read port overrides
if [ -f "$(dirname "$0")/../.env" ]; then
  set -o allexport
  source "$(dirname "$0")/../.env"
  set +o allexport
fi

ADGUARD_WEB_PORT="${ADGUARD_WEB_PORT:-3000}"
GRAFANA_PORT="${GRAFANA_PORT:-3001}"
POSTGRES_USER="${POSTGRES_USER:-network_monitor}"
POSTGRES_DB="${POSTGRES_DB:-network_monitor}"

# ── Postgres ──────────────────────────────────────────────────────────────────
printf "[infra] Checking Postgres...      "
if docker exec network_monitor_postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q 2>/dev/null; then
  printf "$PASS\n"
else
  printf "$FAIL\n"
  echo "        Hint: run 'pnpm run infra:up' and wait for Postgres to be healthy"
  ok=false
fi

# ── AdGuard Home ──────────────────────────────────────────────────────────────
printf "[infra] Checking AdGuard Home...  "
status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${ADGUARD_WEB_PORT}/control/status" 2>/dev/null || echo "000")
# 200 = wizard done and authenticated
# 302/303 = wizard not done yet (redirect to /install.html) — service is up
# 401/403 = wizard done but unauthenticated — service is up
if [ "$status" = "200" ] || [ "$status" = "302" ] || [ "$status" = "303" ] || [ "$status" = "401" ] || [ "$status" = "403" ]; then
  printf "$PASS\n"
  if [ "$status" = "302" ] || [ "$status" = "303" ]; then
    echo "        Note: AdGuard wizard not completed yet — visit http://localhost:${ADGUARD_WEB_PORT} to set it up"
  fi
else
  printf "$FAIL\n"
  echo "        Hint: AdGuard runs as a native service — check 'pgrep AdGuardHome' and /var/log/AdGuardHome.stderr.log (got HTTP $status)"
  ok=false
fi

# ── Grafana ───────────────────────────────────────────────────────────────────
printf "[infra] Checking Grafana...       "
grafana_health=$(curl -s "http://localhost:${GRAFANA_PORT}/api/health" 2>/dev/null || echo "")
if echo "$grafana_health" | grep -q '"database"[[:space:]]*:[[:space:]]*"ok"'; then
  printf "$PASS\n"
else
  printf "$FAIL\n"
  echo "        Hint: Grafana may still be starting — wait 10s and retry (response: $grafana_health)"
  ok=false
fi

# ── Result ────────────────────────────────────────────────────────────────────
echo ""
if [ "$ok" = true ]; then
  echo "[infra] All checks passed."
  exit 0
else
  echo "[infra] One or more checks failed. Fix the issues above before marking the task done."
  exit 1
fi
