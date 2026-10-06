#!/usr/bin/env bash
# Собирает публичную часть сайта в dist/ для Cloudflare (Worker со статикой, см. wrangler.jsonc).
# Запускается автоматически из wrangler.jsonc (build.command) при `wrangler deploy`.
# server/, docs/ и preview/ наружу не публикуются. robots.txt и sitemap.xml — для поисковиков.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist
cp ./*.html dist/
cp -r assets js dist/
cp robots.txt sitemap.xml _redirects dist/
node scripts/clean-urls.mjs dist

# Номер версии у скриптов и стилей (?v=…): после выкладки телефоны сразу берут новые файлы, а не старые из кэша
# (01.10 Safari на iPhone показывал книгу со старым js/book-engine.js)
V=$(git rev-parse --short HEAD 2>/dev/null || date +%s)
sed -i -E "s#(src=\"js/[A-Za-z0-9_.-]+\.js)\"#\1?v=$V\"#g; s#(href=\"assets/[A-Za-z0-9_/.-]+\.css)\"#\1?v=$V\"#g" dist/*.html

echo "dist: $(find dist -type f | wc -l) файлов"
