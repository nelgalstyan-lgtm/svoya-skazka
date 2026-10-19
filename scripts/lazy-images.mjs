// Скорость главной на телефоне (19.10): на проде каждый запрос через шлюз ждёт ≈0,4 с, обложка первого экрана грузится
// долго, и Chrome параллельно тянет картинки с loading="lazy" (он начинает их за 1250–2500 px до экрана) — ≈600 КБ
// разворота, «по фото → в книге», Макса делят канал с обложкой. Здесь (только в dist/) у таких картинок src/srcset
// уходят в data-src/data-srcset, на месте — прозрачная заглушка тех же пропорций; js/site.js подставляет настоящий адрес
// за ~600 px до экрана. Без JS — обычная картинка из <noscript>. Запуск: node scripts/lazy-images.mjs dist
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] || 'dist';
const PAGES = ['index.html'];

let total = 0;
for (const file of PAGES) {
  const path = join(dist, file);
  let html = readFileSync(path, 'utf8');
  let n = 0;
  html = html.replace(/<img\b[^>]*\bloading="lazy"[^>]*>/g, (tag) => {
    const w = tag.match(/\bwidth="(\d+)"/);
    const h = tag.match(/\bheight="(\d+)"/);
    if (!w || !h || /\bdata-src=/.test(tag)) return tag;
    const blank = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${w[1]}' height='${h[1]}' viewBox='0 0 ${w[1]} ${h[1]}'/%3E`;
    const lazy = tag
      .replace(/\ssrcset="/, ' data-srcset="')
      .replace(/\ssrc="/, ` src="${blank}" data-src="`)
      .replace(/\sloading="lazy"/, '');
    n++;
    return `${lazy}<noscript>${tag}</noscript>`;
  });
  if (n) html = html.replace('</head>', '<noscript><style>img[data-src]{display:none}</style></noscript>\n</head>');
  writeFileSync(path, html);
  total += n;
}
console.log(`lazy-images: ${total} картинок грузятся при подлистывании`);
