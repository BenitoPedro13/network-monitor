# Task 06 — PrismaModule + PrismaService

**Phase:** 1 — Foundation  
**Group:** Collector  
**Status:** Done  
**Date:** 2026-06-10

---

## Note

Built as part of Task 05b — needed by `CacheService` before that task could be completed.

`PrismaService` extends `PrismaClient` and implements `OnModuleInit` / `OnModuleDestroy` for connection lifecycle.
`PrismaModule` is decorated `@Global()` so every module can inject `PrismaService` without re-importing the module.

Files: `apps/api/src/prisma/prisma.service.ts`, `apps/api/src/prisma/prisma.module.ts`

---

## Next Task

**Task 07** — Build `CollectorModule`: `poll.service.ts` (AdGuard API fetch) and `mapper.service.ts` (raw event → DnsEvent shape).
