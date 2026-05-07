# Network Monitor Monorepo

Monorepo base for a home network monitor project with:

- `apps/api`: backend workspace
- `apps/web`: frontend workspace placeholder
- `packages/config`: shared config workspace
- `docker-compose.yml`: local infra (Postgres + AdGuard Home)
- strict TypeScript across all workspaces

## Quick Start

1. Copy env file:

```bash
cp .env.example .env
```

2. Bootstrap the project:

```bash
pnpm run bootstrap
```

3. Validate DNS on AdGuard Home (after wizard setup in `http://127.0.0.1:3000`):

```bash
dig google.com @127.0.0.1 -p 18053
```

## Useful Commands

- `pnpm run infra:up`
- `pnpm run infra:down`
- `pnpm run infra:logs`
- `pnpm run db:migrate`
- `pnpm run db:seed`
- `pnpm run typecheck`
