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

// Шрифты (19.10, Lighthouse): Google по параметру text= отдаёт шрифт только с нужными буквами — одним файлом на начертание
// вместо 2–4 (кириллица, латиница, расширенные), всего ≈96 КБ вместо ≈200 КБ, и они не делят канал с обложкой.
// Буквы — все, что есть на страницах сайта, плюс полные алфавиты (имена в формах).
// Caveat (≈77 КБ, на первом экране только имя на обложке) грузится после загрузки страницы, до того — похожий системный.
const ALPHABETS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'
  + '«»—–…№₽“”„‘’·•→←×°ЁАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюяё';
const files = readdirSync(dist).filter((f) => f.endsWith('.html'));
const chars = new Set(ALPHABETS);
for (const file of files) {
  const html = readFileSync(join(dist, file), 'utf8');
  if (!/href="\/?assets\/base\.css"/.test(html)) continue;
  for (const c of html.replace(/<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, '')) if (c.codePointAt(0) > 32) chars.add(c);
}
const text = encodeURIComponent([...chars].sort().join(''));

function fontLinks(href) {
  const url = new URL(href.replaceAll('&amp;', '&'));
  const families = url.searchParams.getAll('family');
  const q = (list) => `https://fonts.googleapis.com/css2?${list.map((f) => 'family=' + f.replaceAll(' ', '+')).join('&')}&display=swap&text=${text}`;
  const main = q(families.filter((f) => !f.startsWith('Caveat')));
  const script = families.filter((f) => f.startsWith('Caveat'));
  let out = `<link rel="preload" as="style" href="${main}" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="${main}"></noscript>`;
  if (script.length) {
    const late = q(script);
    out += `<script>addEventListener('load',function(){var l=document.createElement('link');l.rel='stylesheet';l.href=${JSON.stringify(late)};document.head.appendChild(l)})</script><noscript><link rel="stylesheet" href="${late}"></noscript>`;
  }
  return out;
}

let pages = 0;
for (const file of files) {
  const path = join(dist, file);
  let html = readFileSync(path, 'utf8');
  if (!/href="\/?assets\/base\.css"/.test(html)) continue;
  html = html.replace(/<link rel="stylesheet" href="(\/?assets\/(?:base|site-extra|geroenok|pages-extra)\.css)">/g,
    (m, href) => `<style>/* ${href} */\n${css(href)}</style>`);
  html = html.replace(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/[^"]+)">/g, (m, href) => fontLinks(href));
  writeFileSync(path, html);
  pages++;
}
console.log(`inline-css: стили встроены в ${pages} страниц, шрифты — ${chars.size} знаков`);
