#!/usr/bin/env bash
# Run before committing PiBuddy extension changes.
# Usage: ./check.sh
set -euo pipefail
REPO="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO"

echo "=== PiBuddy extension checks ==="

echo ""
echo "-- Unit tests --"
node --test --experimental-strip-types extension/tests/*.test.ts 2>&1 | tail -8

echo ""
echo "-- Type check (errors in changed files only) --"
# Requires peer deps installed: npm install --save-dev @mariozechner/pi-coding-agent @mariozechner/pi-tui
# For local path overrides, create tsconfig.local.json (gitignored) extending tsconfig.json.
ERRORS=$(tsc --noEmit 2>&1 | grep -E "editor\.ts|index\.ts" | grep -vE "TS5097|TS2347|TS7006|TS2345" || true)
if [ -n "$ERRORS" ]; then
  echo "FAIL - new type errors found:"
  echo "$ERRORS"
  exit 1
else
  echo "OK - no new type errors in editor.ts / index.ts"
fi

echo ""
echo "=== All checks passed ==="
