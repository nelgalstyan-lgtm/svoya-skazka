// Ускорение первой отрисовки (редизайн 19.10, Lighthouse на телефоне): на страницах сайта (те, что подключают
// assets/base.css) свои стили встраиваются в <head> вместо 3–4 отдельных файлов, а Google Fonts грузятся без
// блокировки (preload → stylesheet, шрифт до загрузки — системный, display=swap).
// В исходниках страницы остаются с обычными <link> — правится только dist/. Запуск: node scripts/inline-css.mjs dist
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] || 'dist';
const cache = new Map();

/** CSS-файл с путями url(...), переписанными от корня сайта (файл лежит в assets/, страница — в корне). */
function css(href) {
  const abs = href.startsWith('/');
  const rel = href.replace(/^\//, '').replace(/\?.*$/, '');
  if (!cache.has(rel)) {
    const dir = rel.slice(0, rel.lastIndexOf('/') + 1);
    const text = readFileSync(join(dist, rel), 'utf8')
      // только ссылки на файлы (brand/star.svg); url(%23n) внутри встроенных SVG не трогаем
      .replace(/url\((['"]?)([\w./-]+\.(?:svg|png|webp|jpe?g|gif|avif|woff2?))\1\)/g, (m, q, p) => `url(${q}__ROOT__${dir}${p}${q})`);
    cache.set(rel, text);
  }
  return cache.get(rel).replaceAll('__ROOT__', abs ? '/' : '');
}

let pages = 0;
for (const file of readdirSync(dist).filter((f) => f.endsWith('.html'))) {
  const path = join(dist, file);
  let html = readFileSync(path, 'utf8');
  if (!/href="\/?assets\/base\.css"/.test(html)) continue;
  html = html.replace(/<link rel="stylesheet" href="(\/?assets\/(?:base|site-extra|geroenok|pages-extra)\.css)">/g,
    (m, href) => `<style>/* ${href} */\n${css(href)}</style>`);
  html = html.replace(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/[^"]+)">/g,
    (m, href) => `<link rel="preload" as="style" href="${href}" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="${href}"></noscript>`);
  writeFileSync(path, html);
  pages++;
}
console.log(`inline-css: стили встроены в ${pages} страниц`);
