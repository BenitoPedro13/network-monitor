# Claude Code Guidelines — Network Monitor

This file is read automatically by Claude Code at the start of every session.
Follow these rules strictly for every task in this project.

---

## Project Context

Home network DNS monitoring tool. Captures DNS queries from personal devices via AdGuard Home, stores them in PostgreSQL, enriches with IP geolocation (MaxMind GeoLite2), and visualizes in Grafana.

- **Architecture reference:** `ARCHITECTURE.md` — read this before starting any task
- **Task documents:** `docs/tasks/` — one file per task, created before implementation begins
- **Memory:** Persistent session context is in `.claude/projects/memory/`

---

## Workflow Rules (follow in order, every time)

### Before touching any file

1. Read `ARCHITECTURE.md` to understand where the task fits
2. Check `docs/tasks/` for an existing task document for this work
3. If no task document exists, **create it first** before writing any code or running any command
4. Check if any tool, CLI, or official script exists for what you're about to scaffold manually — don't create boilerplate by hand if there's a better way

### Task document convention

- Location: `docs/tasks/NN-short-name.md` where `NN` is zero-padded sequence (01, 02, ...)
- Must include: what, why, files changed, decisions made, how to verify, next task
- Status field: `Pending` → `In Progress` → `Done`
- Create the document, wait for user confirmation, then implement

### After completing a task

- Run the relevant tests and wait for user confirmation before marking anything done:
  - Infrastructure tasks → `pnpm run test:infra`
  - Collector / code tasks → `pnpm run test`
  - Both when the task touches both layers
- Only mark done after the user explicitly gives the OK
- Update the task document status to `Done`
- Check off the corresponding item in `ARCHITECTURE.md` Phase 1 checklist
- Update `README.md` if any command, setup step, service, or env var changed
- Update `.env.example` if any new env var was introduced or an existing one changed
- Update `ARCHITECTURE.md` if any design decision, schema, or component changed
- Summarize what changed in one or two sentences — no long recaps

---

## Project Structure

```
apps/api/          ← collector service + Prisma schema
apps/web/          ← future frontend (placeholder for now)
packages/config/   ← shared TypeScript config
grafana/
└── provisioning/
    ├── datasources/   ← postgres.yaml
    └── dashboards/    ← overview.json, device.json, geomap.json
geoip/             ← GeoLite2-City.mmdb, GeoLite2-ASN.mmdb (gitignored, binary)
docs/
└── tasks/         ← one markdown file per implementation task
docker-compose.yml
ARCHITECTURE.md    ← source of truth for all design decisions
CLAUDE.md          ← this file
```

---

## Key Commands

```bash
pnpm run infra:up           # start Postgres + AdGuard + Grafana
pnpm run infra:up:postgres  # start Postgres only
pnpm run infra:down         # stop all containers
pnpm run infra:logs         # tail container logs
pnpm run db:migrate         # run Prisma migrations
pnpm run db:seed            # seed Device table with registered devices
pnpm run typecheck          # typecheck all workspaces
```

---

## API Framework — NestJS

`apps/api` uses **NestJS**. Always use the NestJS CLI to generate code — never create modules, services, controllers, or providers by hand.

```bash
# From apps/api/ directory:
nest g module collector
nest g service collector/geo
nest g service collector/poll
nest g service collector/mapper
nest g service collector/cursor
nest g service collector/writer
nest g module prisma
nest g service prisma
```

**Do NOT use `tsx` to run the NestJS app** — esbuild (used by tsx) does not support `emitDecoratorMetadata`, which breaks NestJS constructor injection silently. Always use `nest start --watch` for dev and `node dist/main` for prod.

After every `nest g` command: **delete the generated `.spec.ts` file** — we use `tests/*.test.ts` with Node.js built-in test runner, not Jest. The `.spec.ts` files cause type errors and are excluded from tsconfig.

NestJS conventions:
- Every domain area is a **module** (`@Module`)
- Business logic lives in **services** (`@Injectable`)
- The collector polling loop starts via `onModuleInit()` lifecycle hook
- Prisma is wrapped in a `PrismaService` (extends `PrismaClient`) shared across modules
- Use `ConfigModule` from `@nestjs/config` for env vars — never read `process.env` directly outside of config
- Use `@nestjs/schedule` for the GeoIP auto-updater interval (replaces `setInterval`)

---

## Coding Conventions

- **TypeScript strict mode** everywhere — no `any`, no type assertions without comment
- **No comments** unless the WHY is non-obvious (hidden constraint, workaround, invariant)
- **No error handling for impossible states** — trust TypeScript and Prisma guarantees
- **Validate only at system boundaries** — AdGuard API responses, env vars on startup
- **Fail fast on startup** — if a required env var or file (e.g. `.mmdb`) is missing, log a clear error and exit; don't silently degrade
- **No half-finished implementations** — a module is done when it's wired up and tested end-to-end

---

## Environment Variables

All vars live in `.env` (gitignored). Source of truth for required vars is `.env.example`.
Never hardcode credentials. Never commit `.env`.

Key vars:
- `DATABASE_URL` — Prisma connection string
- `ADGUARD_URL`, `ADGUARD_USER`, `ADGUARD_PASSWORD` — collector auth
- `GEO_UPDATE_INTERVAL_DAYS` — how often to refresh MaxMind databases (default 7). Paths are resolved automatically via `INIT_CWD` — no path env vars needed.
- `COLLECTOR_POLL_INTERVAL_MS` — polling cadence (default 30000)
- `GRAFANA_PORT`, `GRAFANA_USER`, `GRAFANA_PASSWORD` — Grafana access

---

## What NOT to Do

- Do not create directories or files without first checking if an official tool handles it
- Do not implement Phase 2+ features while Phase 1 is incomplete
- Do not add abstractions or helper utilities beyond what the current task requires
- Do not push to remote without explicit user confirmation
- Do not amend commits — always create new ones
- Do not skip the task document step even for small changes
