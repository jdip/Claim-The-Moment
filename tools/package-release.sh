#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGING="$ROOT/dist/claim-the-moment"

rm -rf "$ROOT/dist"
mkdir -p "$STAGING"

cp "$ROOT/module.json" "$ROOT/LICENSE" "$ROOT/README.md" "$STAGING/"
cp -R "$ROOT/assets" "$ROOT/lang" "$ROOT/scripts" "$ROOT/sounds" "$ROOT/styles" "$ROOT/templates" "$STAGING/"

(
  cd "$STAGING"
  zip -rq "$ROOT/dist/claim-the-moment.zip" .
)

cp "$ROOT/module.json" "$ROOT/dist/module.json"

echo "Created dist/claim-the-moment.zip and dist/module.json"
