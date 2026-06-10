#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
GEOIP_DIR="$ROOT_DIR/geoip"

# Load .env
if [ -f "$ROOT_DIR/.env" ]; then
  set -o allexport
  source "$ROOT_DIR/.env"
  set +o allexport
fi

if [ -z "${MAXMIND_LICENSE_KEY:-}" ]; then
  echo "Error: MAXMIND_LICENSE_KEY is not set."
  echo "  1. Register free at https://www.maxmind.com/en/geolite2/signup"
  echo "  2. Generate a license key: Account > Manage License Keys"
  echo "  3. Add to .env: MAXMIND_LICENSE_KEY=your_key_here"
  exit 1
fi

MAXMIND_BASE="https://download.maxmind.com/app/geoip_download"

download_db() {
  local edition="$1"
  local dest="$GEOIP_DIR/${edition}.mmdb"
  local url="${MAXMIND_BASE}?edition_id=${edition}&license_key=${MAXMIND_LICENSE_KEY}&suffix=tar.gz"

  echo "[geoip] Downloading ${edition}..."
  tmp=$(mktemp -d)
  curl -fsSL "$url" -o "$tmp/${edition}.tar.gz"
  tar -xzf "$tmp/${edition}.tar.gz" -C "$tmp"
  find "$tmp" -name "*.mmdb" -exec mv {} "$dest" \;
  rm -rf "$tmp"
  echo "[geoip] Saved $(du -sh "$dest" | cut -f1) → $dest"
}

download_db "GeoLite2-City"
download_db "GeoLite2-ASN"

echo ""
echo "[geoip] Done. Re-run weekly to keep data fresh: pnpm run geoip:update"
