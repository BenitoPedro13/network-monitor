# Task 04 — GeoIP Directory and MaxMind Setup

**Phase:** 1 — Foundation  
**Group:** Infrastructure  
**Status:** Done  
**Date:** 2026-06-09

---

## What and Why

The collector uses MaxMind GeoLite2 `.mmdb` binary files to resolve IP addresses to country, city, and ASN data — entirely offline, no HTTP calls at runtime. These files are not in the repo (binary, ~60MB combined, updated weekly). This task creates the directory scaffold and a download script so anyone can get the files in one command.

---

## What This Task Does

1. **Creates `./geoip/` directory** with a `.gitkeep` so git tracks it but ignores `*.mmdb` files (already in `.gitignore`)

2. **Adds `geoip:update` script** (`scripts/update-geoip.sh`) — downloads both `.mmdb` files from MaxMind using the license key from `.env`. Requires `MAXMIND_LICENSE_KEY` to be set.

3. **Adds `geoip:update` to root `package.json`** so it can be run with `pnpm run geoip:update`

4. **Updates `README.md`** — the download step was already documented as a placeholder; this task wires it to the actual script

---

## Files Changed

| File | Change |
|---|---|
| `geoip/.gitkeep` | New — keeps directory in git |
| `scripts/update-geoip.sh` | New — downloads GeoLite2-City and GeoLite2-ASN |
| `package.json` | Add `geoip:update` script |
| `README.md` | Update step 4 to reference the actual script |

---

## Decisions

- **Direct MaxMind download URL** over `geoipupdate` CLI — `geoipupdate` requires a separate install. A plain `curl` download needs only standard Unix tools and works everywhere.
- **Download both City and ASN** — City gives country/city/lat/lon; ASN gives the ISP/organization name which is the most actionable field for detecting suspicious traffic ("Hetzner Cloud" vs "Amazon AWS" vs "Unknown bulletproof host").
- **Script reads from `.env`** — `MAXMIND_LICENSE_KEY` lives in `.env`, not hardcoded. Script fails fast with a clear error if the key is missing.

---

## How to Verify

```bash
# Set MAXMIND_LICENSE_KEY in .env first, then:
pnpm run geoip:update

# Check both files downloaded
ls -lh geoip/
# Expected:
# GeoLite2-ASN.mmdb    ~8MB
# GeoLite2-City.mmdb   ~60MB
```

Then run smoke test to confirm nothing broke:
```bash
pnpm run test:infra
```

---

## Next Task

**Task 05** — Install `maxmind` npm package and build `collector/geo/` module (lookup + cache).
