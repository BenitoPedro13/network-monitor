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

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '[bootstrap] erro: comando "%s" nao encontrado no PATH.\n' "$1" >&2
    exit 1
  fi
}

require_cmd pnpm
require_cmd docker

if ! docker info >/dev/null 2>&1; then
  printf '[bootstrap] erro: Docker nao esta rodando. Abra o Docker Desktop e tente novamente.\n' >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  log ".env nao encontrado, copiando de .env.example"
  cp .env.example .env
fi

if [[ ! -f apps/api/.env ]]; then
  log "apps/api/.env nao encontrado, gerando com DATABASE_URL padrao"
  cat > apps/api/.env <<'EOF'
DATABASE_URL=postgresql://network_monitor:network_monitor@localhost:5433/network_monitor?schema=public
EOF
fi

log "Instalando dependencias com pnpm"
pnpm install

if [[ "$WITH_ADGUARD" == "true" ]]; then
  log "Subindo containers (postgres + adguardhome)"
  docker compose up -d
else
  log "Subindo container do postgres"
  docker compose up -d postgres
fi

log "Aguardando Postgres ficar disponivel"
until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-network_monitor}" -d "${POSTGRES_DB:-network_monitor}" >/dev/null 2>&1; do
  sleep 2
done

log "Gerando Prisma Client"
pnpm --filter @network-monitor/api run db:generate

log "Aplicando migrations"
pnpm --filter @network-monitor/api run db:migrate

log "Executando seed"
pnpm --filter @network-monitor/api run db:seed

log "Rodando typecheck"
pnpm run typecheck

log "Concluido com sucesso."
printf '[bootstrap] Dica: rode "pnpm run dev" para iniciar a API.\n'
