# Task 17 — Run AdGuard Home Natively on macOS (real per-device attribution)

**Phase:** 1 — Foundation  
**Group:** Infrastructure  
**Status:** Done  
**Date:** 2026-06-10

---

## What and Why

Task 15's conclusion: AdGuard inside Docker Desktop on macOS can never see real client IPs. Port-forwarding stamps rotating bogus sources; host networking is a userspace relay that collapses every client (Mac *and* LAN devices — verified with the Android phone) to `::1`. Per-device attribution — the core premise of the pipeline — is impossible with a containerized AdGuard on this machine.

Fix: run AdGuard Home as a **native macOS service** (launchd). It binds `en0` directly, so LAN clients appear with their true IPs. Postgres and Grafana stay in Docker; the collector is unchanged (`ADGUARD_URL=http://localhost:3000` still holds).

This unblocks Task 14 (seeding real device IPs).

---

## Plan

1. **Install the official binary** — check `brew search adguardhome` first (per CLAUDE.md "use official tooling"); fall back to the `AdguardTeam/AdGuardHome` GitHub release tarball (`darwin-arm64`) into `/usr/local/bin/` or a repo-local `bin/` (gitignored)
2. **Reuse the repo config** — run with `-c <repo>/adguardhome/conf/AdGuardHome.yaml -w <repo>/adguardhome/work`, so the Task 16 template/render flow and all existing settings (users, DoH upstream, query log) carry over untouched
3. **Register as a service** — `sudo AdGuardHome -s install -c ... -w ...` (AdGuard's built-in service installer creates the launchd daemon; root is required anyway to bind port 53). Needs the user's sudo — bootstrap prints the command instead of running it
4. **Remove the `adguardhome` service from `docker-compose.yml`** (stop the container first — port 53 conflict otherwise)
5. **Update bootstrap** — `--with-adguard` keeps rendering the config but prints the native install command + checklist instead of `docker compose up adguardhome`; Docker Desktop's host-networking toggle is no longer required (drop from checklist/README)
6. **Verify attribution, then fix Device rows** — Mac keeps arriving as loopback (`::1`/`127.0.0.1`, stable); the Android phone must now show its real LAN IP in the querylog. Update/clean `Device` rows (the `149.112.112.10` artifact row becomes historical)

---

## Files Changed

| File | Change |
|---|---|
| `docker-compose.yml` | Remove `adguardhome` service |
| `scripts/bootstrap.sh` | Native AdGuard install instructions instead of container start |
| `README.md` | Native AdGuard setup section; drop host-networking toggle step |
| `ARCHITECTURE.md` | §2 diagram + §6.2 note: AdGuard native on host, containers for the rest |
| `.gitignore` | Add repo-local `bin/` if the binary lands there |

---

## Decisions

- **Native service, not a login app** — DNS must survive reboots/logouts; launchd daemon (`-s install`) is AdGuard's supported mechanism and handles root binding of port 53.
- **Keep conf/work inside the repo** — config provisioning (Task 16) stays valid; the daemon runs as root and will own files under `adguardhome/work`, which is already gitignored.
- **Docker host-networking toggle becomes unnecessary** — can be left on or off; no longer documented as a requirement.
- **Rollback** — the compose service definition lives in git history; `sudo AdGuardHome -s uninstall` + restore the compose block returns to the container setup.

---

## Risks

| Risk | Mitigation |
|---|---|
| Port 53/3000 conflict during migration | Stop the AdGuard container before starting the native service |
| macOS firewall prompt blocks DNS | Allow incoming connections for AdGuardHome when prompted |
| Root-owned files appear under `adguardhome/work` | Already gitignored; document `sudo` for manual cleanup |
| AdGuard self-update changes binary out-of-band | Disable auto-update in UI or accept it (config is version-controlled either way) |

---

## Implementation Notes (2026-06-10)

- Homebrew has no AdGuard Home (only the `adguard` app cask) — used the official GitHub release binary v0.107.77 (`darwin_arm64.zip`; darwin assets are zip, linux are tar.gz). Bootstrap now downloads it into `bin/` automatically.
- **macOS TCC gotcha:** a launchd daemon cannot read `~/Documents` — running with binary/config inside the repo crash-looped with `getting current directory: open ..: operation not permitted`. Everything (binary, config copy, work dir) must live in `/Applications/AdGuardHome/`.
- **Installer cwd gotcha:** AdGuard's `-s install` derives the plist `WorkingDirectory` from the shell's current directory, not from `-w`. The install command must be run from inside `/Applications/AdGuardHome` (this is what its "service must be started from within the /Applications directory" warning means).
- Config render flow unchanged: bootstrap renders `adguardhome/conf/AdGuardHome.yaml` from the template; the install command copies it to `/Applications/AdGuardHome/conf/`. Query-log/work state now lives outside the repo; Postgres remains the source of truth.
- **Verified result:** Mac queries arrive as `127.0.0.1`; the Android phone arrives as its real static LAN IP `192.168.1.21` (registered as device `android-benito`). Per-device attribution finally works.

---

## How to Verify

```bash
dig @127.0.0.1 example.com            # resolves via native AdGuard
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000   # 302/200
# from the Android phone: browse, then check the querylog client IP
# → must be the phone's real LAN IP (e.g. 192.168.1.21), not ::1
pnpm run test:infra
pnpm run dev                          # collector ingests; phone events attribute to its own Device row
```

---

## Next Task

**Task 14** — seed real device IPs (now meaningful: real LAN sources are visible).
