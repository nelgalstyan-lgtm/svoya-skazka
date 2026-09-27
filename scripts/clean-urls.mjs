// Чистые адреса на сайте: в собранном dist/ ссылки «pricing.html» → «pricing», «index.html» → «/».
// Cloudflare и так открывает страницы без .html, а на адрес с .html отвечает переадресацией 307 — лишний шаг
// для посетителя и поисковиков. В исходниках ссылки остаются с .html, чтобы локально работал python -m http.server.
// Запускается из scripts/build-pages.sh: node scripts/clean-urls.mjs dist
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] || 'dist';
const pages = readdirSync(dist).filter((f) => f.endsWith('.html') && f !== '404.html').map((f) => f.slice(0, -5));
// имя страницы после кавычки, скобки, «=», пробела или «/» и перед ?, #, кавычкой, скобкой или пробелом
const re = new RegExp(`(^|[\\s"'\`(=/])(${pages.map((p) => p.replace(/[-.]/g, '\\$&')).join('|')})\\.html(?=[?#"'\`)\\s]|$)`, 'gm');
const clean = (text) => text.replace(re, (_, before, page) => (page === 'index' ? (before === '/' ? '/' : `${before}/`) : before + page));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'examples') walk(path, out); // в образцах книг (book.js) страниц сайта нет, файлы большие
    } else if (/\.(html|js)$/.test(name)) out.push(path);
  }
  return out;
}

let changed = 0;
for (const file of walk(dist)) {
  const text = readFileSync(file, 'utf8');
  const next = clean(text);
  if (next !== text) { writeFileSync(file, next); changed += 1; }
}
console.log(`clean-urls: ${changed} файлов, страницы: ${pages.join(', ')}`);
