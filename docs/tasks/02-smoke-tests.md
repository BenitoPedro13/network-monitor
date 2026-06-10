# Task 02 — Infrastructure Smoke Tests + Test Workflow

**Phase:** 1 — Foundation  
**Group:** Infrastructure  
**Status:** Done  
**Date:** 2026-06-09

---

## What and Why

Before marking any task done we need a way to verify the stack is actually working — not just that files were written correctly. This task adds:

1. **`scripts/test-infra.sh`** — a shell script that checks every running service's health endpoint and exits non-zero if anything is down. Run this before approving any infrastructure task.
2. **Unit test scaffold** — wires up Node.js built-in test runner (`node --test`) in `apps/api` so collector unit tests have a home from the start.
3. **`CLAUDE.md` update** — bakes "run the relevant test before marking done" into the workflow so it's never skipped.

---

## What This Task Does

### `scripts/test-infra.sh`

Checks each service in order:

| Check | How |
|---|---|
| Postgres | `pg_isready` via `docker exec` |
| AdGuard Home | `GET /control/status` (returns 200 when wizard is complete, 404 before — both mean the container is up) |
| Grafana | `GET /api/health` — returns `{"database":"ok"}` when ready |

- Prints a clear PASS / FAIL line per service
- Exits `0` only if all checks pass
- Exits `1` on first failure with a hint about what to check

### Unit test scaffold

- Adds a `tests/` directory inside `apps/api/`
- Adds a placeholder `tests/collector.test.ts` — imports nothing yet, just confirms the test runner works
- The `test` script in `apps/api/package.json` already runs `tsx --test` — we point it at the `tests/` glob

### `CLAUDE.md` update

Adds to the "after completing a task" section:
- Run `pnpm run test:infra` for infrastructure tasks before marking done
- Run `pnpm run test` for collector/code tasks before marking done

### `package.json` update (root)

Adds:
- `"test:infra": "bash ./scripts/test-infra.sh"` — runs the smoke test from anywhere

---

## Files Changed

| File | Change |
|---|---|
| `scripts/test-infra.sh` | New — smoke test script |
| `apps/api/tests/collector.test.ts` | New — placeholder unit test |
| `apps/api/package.json` | Update `test` script to target `tests/` glob |
| `package.json` | Add `test:infra` script |
| `CLAUDE.md` | Add test-before-done rule |

---

## Decisions

- **Shell script over a Node.js test** for infra checks — `curl` and `docker exec` are the right tools here; no need to pull in a test framework for health checks.
- **`node --test` (built-in) over Jest/Vitest** — already wired in `apps/api/package.json`, zero new dependencies, sufficient for pure function unit tests.
- **Smoke test exits on first failure** — fast feedback; no point checking Grafana if Postgres is down since Grafana depends on it.

---

## How to Verify This Task

```bash
# Start the stack first
pnpm run infra:up

# Run the smoke test
pnpm run test:infra
```

Expected output:
```
[infra] Checking Postgres...   PASS
[infra] Checking AdGuard Home... PASS
[infra] Checking Grafana...    PASS
[infra] All checks passed.
```

Also verify the unit test scaffold works:
```bash
pnpm run test
```

Expected: test runner finds `apps/api/tests/collector.test.ts` and reports 0 failures.

---

## Next Task

**Task 03** — Add `IpGeoCache` and `SystemState` models to Prisma schema + run migration.
