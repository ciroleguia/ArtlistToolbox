#!/usr/bin/env bash
# Builds the distributable Chrome extension zip under dist/.
set -euo pipefail

VERSION=$(node --input-type=module -e "import { readFileSync } from 'node:fs'; console.log(JSON.parse(readFileSync('manifest.json', 'utf8')).version);")
OUT_DIR="dist"
OUT="${OUT_DIR}/ArtlistToolbox-v${VERSION}.zip"

mkdir -p "${OUT_DIR}"
rm -f "${OUT}"

zip -r "${OUT}" \
  manifest.json \
  icons \
  popup \
  options \
  rankings \
  src \
  README.md \
  LICENSE \
  -x "*.DS_Store" > /dev/null

echo "${OUT}"
