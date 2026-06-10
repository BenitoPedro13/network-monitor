# Task 16 — Setup Automation (new-machine bootstrap)

**Phase:** 1 — Foundation  
**Group:** Infrastructure  
**Status:** Pending  
**Date:** 2026-06-10

---

## What and Why

Setting this stack up on a new machine currently requires a scavenger hunt: AdGuard's web wizard, manual `.env` creation, GeoIP download, migrations, seeding, plus host-level settings. Most of that is automatable; this task automates everything that doesn't require human hands.

Two deliverables:

1. **AdGuard config provisioning** — eliminate the web wizard
2. **`pnpm run bootstrap`** — one command from clone to running stack

What stays manual (inherently host-level, documented in README instead):
- Docker Desktop "Enable host networking" toggle
- macOS DNS setting (point to `127.0.0.1` / LAN IP)
- MaxMind account + license key
- Router DHCP reservations for monitored devices

---

## Part 1 — AdGuard Provisioning

AdGuard Home reads `/opt/adguardhome/conf/AdGuardHome.yaml` on start; if present, the setup wizard is skipped. The repo currently gitignores `adguardhome/` entirely (runtime state).

- Add a version-controlled template `adguardhome/AdGuardHome.template.yaml`: listen config (DNS 53, web 3000), upstream DoH (Quad9), query log enabled, user block with bcrypt password hash
- Bootstrap renders the template → `adguardhome/conf/AdGuardHome.yaml` with credentials from `.env` (`ADGUARD_USER` / `ADGUARD_PASSWORD`; hash generated via `htpasswd -B -n -b` or a small Node script using `bcryptjs`)
- Wizard never runs; `ADGUARD_URL/control/...` works immediately with `.env` credentials

## Part 2 — Extend Existing Bootstrap Script

`scripts/bootstrap.sh` already exists (prereq checks, `.env` copy, `pnpm install`, infra up, Postgres wait, prisma generate/migrate/seed, typecheck). Missing pieces to add:

1. Render AdGuard config (Part 1) if `adguardhome/conf/AdGuardHome.yaml` missing — removes the wizard step
2. `pnpm run geoip:update` (skip with warning if `MAXMIND_LICENSE_KEY` empty)
3. `pnpm run test:infra` at the end (when `--with-adguard`)
4. Print the manual-steps checklist (macOS DNS setting, Docker Desktop host-networking toggle, Grafana/AdGuard URLs)
5. Translate log messages to English for consistency with the rest of the repo

Keep it idempotent — safe to rerun after fixing any step.

---

## Files Changed

| File | Change |
|---|---|
| `adguardhome/AdGuardHome.template.yaml` | New — version-controlled AdGuard config template |
| `scripts/bootstrap.sh` | Extended — AdGuard render, geoip, test:infra, checklist |
| `.gitignore` | Un-ignore the template (keep `adguardhome/work` + rendered conf ignored) |
| `README.md` | Replace setup steps with `pnpm run bootstrap` + manual checklist |

---

## Decisions

- **Template + render, not a checked-in AdGuardHome.yaml** — the real file contains a password hash and accumulates runtime mutations made via the UI; the template holds only the bootstrap shape.
- **Shell script, not Node** — it orchestrates CLIs (`docker`, `pnpm`); no business logic.
- **Carries over to Phase 5** — the same bootstrap runs on the Raspberry Pi (Linux), where the host-networking toggle step disappears.

---

## How to Verify

```bash
# simulate a fresh machine
pnpm run infra:down
rm -rf adguardhome/conf adguardhome/work .env
pnpm run bootstrap   # follow prompts
pnpm run test:infra
dig @127.0.0.1 example.com   # resolves; querylog shows the query
```

---

## Next Task

**Task 14** — seed real device IPs (after verifying how LAN devices appear under host networking).
