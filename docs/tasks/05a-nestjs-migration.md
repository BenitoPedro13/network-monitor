# Task 05a — Migrate apps/api to NestJS

**Phase:** 1 — Foundation  
**Group:** Collector  
**Status:** Done  
**Date:** 2026-06-10

---

## What and Why

`apps/api` is currently a plain TypeScript placeholder. Before building any collector modules we need to scaffold it as a proper NestJS application so all future code is generated with the NestJS CLI and follows its conventions.

NestJS gives us:
- **Dependency injection** — services are injected, not imported directly, making testing and swapping easy
- **Lifecycle hooks** — `onModuleInit()` is the right place to start the polling loop; `onModuleDestroy()` for graceful shutdown
- **`@nestjs/schedule`** — built-in cron/interval decorator for the GeoIP auto-updater
- **`@nestjs/config`** — typed env var access, never reads `process.env` directly
- **CLI-generated structure** — consistent, reviewable boilerplate

Because the collector has no HTTP endpoints yet, we bootstrap with `NestFactory.createApplicationContext()` (no HTTP server bound). When Phase 3 adds the REST API we switch to `NestFactory.create()`.

---

## What This Task Does

1. **Scaffolds NestJS in a temp dir** using `nest new` to get the canonical file structure
2. **Copies NestJS structure into `apps/api/`** — `src/app.module.ts`, `src/main.ts`, `nest-cli.json`, updated `tsconfig.json`
3. **Installs NestJS dependencies** into `apps/api/package.json`
4. **Keeps existing Prisma setup** — `prisma/`, `scripts/seed.ts`, `tests/` are untouched
5. **Deletes the old `src/index.ts` placeholder**

### Final `apps/api/src/` structure after this task

```
apps/api/src/
├── app.module.ts       ← root module, imports all feature modules
└── main.ts             ← bootstraps with createApplicationContext (no HTTP)
```

### Key dependency decisions

| Package | Purpose |
|---|---|
| `@nestjs/common`, `@nestjs/core` | Core framework |
| `reflect-metadata` | Required by NestJS decorators |
| `rxjs` | Required by NestJS internals |
| `@nestjs/config` | Typed env var access via `ConfigService` |
| `@nestjs/schedule` | `@Interval()` decorator for GeoIP updater |
| `@nestjs/cli` (dev) | CLI for generating modules/services |
| `@nestjs/schematics` (dev) | Schematics used by CLI |
| `@nestjs/testing` (dev) | Testing utilities |

No HTTP adapter (`platform-express` / `platform-fastify`) — not needed until Phase 3.

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/src/main.ts` | Replace placeholder — NestJS bootstrap |
| `apps/api/src/app.module.ts` | New — root module |
| `apps/api/src/index.ts` | Deleted — replaced by main.ts |
| `apps/api/package.json` | Add NestJS dependencies, update scripts |
| `apps/api/tsconfig.json` | Add NestJS-required compiler options (`emitDecoratorMetadata`, `experimentalDecorators`) |
| `apps/api/nest-cli.json` | New — NestJS CLI config |

---

## Decisions

- **`createApplicationContext` not `create`** — no HTTP server needed for a background collector. Avoids binding to a port and keeps the process focused.
- **`@nestjs/config`** — env vars are validated and typed at startup. The `ConfigModule` is imported in `AppModule` with `isGlobal: true` so every service can inject `ConfigService` without re-importing.
- **`@nestjs/schedule`** — cleaner than raw `setInterval` for the GeoIP updater. Survives module lifecycle correctly.
- **Keep Prisma files untouched** — Prisma is framework-agnostic. The existing schema, migrations, and seed script continue to work unchanged.

---

## How to Verify

```bash
# From monorepo root:
pnpm run typecheck
pnpm run test
```

Expected: no type errors, 1 unit test passes (collector placeholder).

Also verify the app boots:
```bash
pnpm run dev
```

Expected log:
```
[NestApplication] Starting application context...
[AppModule] Network Monitor API ready.
```

---

## Next Task

**Task 05b** — Build the geo module using NestJS CLI (`nest g module geo`, `nest g service geo/lookup`, etc.)
