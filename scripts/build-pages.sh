#!/usr/bin/env bash
# Собирает публичную часть сайта в dist/ для Cloudflare (Worker со статикой, см. wrangler.jsonc).
# Запускается автоматически из wrangler.jsonc (build.command) при `wrangler deploy`.
# server/, docs/ и preview/ наружу не публикуются.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist
cp ./*.html dist/
cp -r assets js dist/

echo "dist: $(find dist -type f | wc -l) файлов"
