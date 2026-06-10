# Task 22 — Start AdGuard from Dev Command

**Status:** In Progress

## What

Update the local development lifecycle so `pnpm run dev` starts the native AdGuard Home service before launching the API collector. Keep `pnpm run dev:flow` on the same path so the Zeek + API workflow also restores AdGuard automatically.

## Why

AdGuard Home owns port `3000` and is required by the collector API polling loop, but it currently runs outside the repo scripts as a macOS `launchd` service. After temporarily stopping AdGuard for another process, the expected local workflow should restore it with the dev command instead of requiring a separate manual start.

## Files Changed

- `package.json`
- `scripts/dev-with-adguard.sh` (new)
- `README.md`

## Decisions Made

- Keep AdGuard native, not Dockerized, so per-device source IP attribution stays intact.
- Use AdGuard Home's service command from `/Applications/AdGuardHome/AdGuardHome`.
- Let the script continue if AdGuard is already running.
- Stop AdGuard on dev exit so port `3000` is released for other local apps.
- Keep `pnpm run dev:flow` focused on Zeek + API, but route it through `pnpm run dev` so both dev paths share the same AdGuard startup behavior.

## How To Verify

```bash
sudo /Applications/AdGuardHome/AdGuardHome -s stop
pnpm run dev
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/control/status
```

Expected: `pnpm run dev` starts AdGuard first, then starts the API collector. The status endpoint returns `200`. On Ctrl-C, AdGuard stops and port `3000` is released.

Also verify the flow lifecycle uses the same AdGuard startup path:

```bash
sudo /Applications/AdGuardHome/AdGuardHome -s stop
pnpm run dev:flow
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/control/status
```

Expected: `pnpm run dev:flow` starts Zeek, starts AdGuard via `pnpm run dev`, then starts the API collector. On Ctrl-C, Zeek and AdGuard stop, and port `3000` is released.

## Next Task

None.
