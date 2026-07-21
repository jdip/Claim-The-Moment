#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGING="$ROOT/dist/claim-the-moment"

npm --prefix "$ROOT" run verify

rm -rf "$ROOT/dist"
mkdir -p "$STAGING/docs"

cp "$ROOT/module.json" "$ROOT/LICENSE" "$ROOT/README.md" "$ROOT/CHANGELOG.md" "$ROOT/ATTRIBUTIONS.md" "$STAGING/"
cp "$ROOT/docs/USER_GUIDE.md" "$STAGING/docs/"
cp -R "$ROOT/assets" "$ROOT/lang" "$ROOT/scripts" "$ROOT/sounds" "$ROOT/styles" "$ROOT/templates" "$STAGING/"

(
  cd "$STAGING"
  find . -exec touch -t 202001010000 {} +
  find . -type f | LC_ALL=C sort | zip -X -q "$ROOT/dist/claim-the-moment.zip" -@
)

cp "$ROOT/module.json" "$ROOT/dist/module.json"
node "$ROOT/tools/verify-release.mjs" --dist

echo "Created dist/claim-the-moment.zip and dist/module.json"
