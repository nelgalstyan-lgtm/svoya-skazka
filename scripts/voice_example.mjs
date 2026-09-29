// Озвучка книги-образца «Сказки» тем же путём, что у покупателей (worker/voice.js): Ермиль, интонация «Сказки».
//   node --env-file=server/.env scripts/voice_example.mjs assets/examples/max-3d/book.js OUT_DIR [dedication|skazka ...]
// Дорожки как у покупателей: посвящение → dedication.mp3, вся сказка → skazka.mp3; без списка — все дорожки.
// Файлы потом загружаются в R2 (media/<папка>/…mp3) и подключаются в book.js как audio: [{ title, src: '/api/media/…' }].
// Платно: 0,1626 ₽ за каждые 250 символов (у «Сказки» Макса ≈ 6 тыс. символов ≈ 4 ₽).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { voiceTracks, splitText, synthesize, roleFor } from '../worker/voice.js';

const [src, outDir, ...only] = process.argv.slice(2);
if (!src || !outDir) throw new Error('usage: voice_example.mjs book.js OUT_DIR [dedication|skazka ...]');
if (!process.env.YANDEX_API_KEY) throw new Error('YANDEX_API_KEY is missing (server/.env)');

// book.js — это window.SKAZKA_…_BOOK = {...}: выполняем в пустой песочнице и берём объект
const sandbox = { window: {} };
vm.runInNewContext(await readFile(src, 'utf8'), sandbox);
const data = Object.values(sandbox.window)[0];
const role = roleFor({ tariff: 'short' }, process.env);

for (const track of voiceTracks(data.book)) {
  const name = track.title === 'Посвящение' ? 'dedication' : 'skazka';
  if (only.length && !only.includes(name)) continue;
  const chunks = splitText(track.text);
  console.log(`${track.title}: ${track.text.length} символов, ${chunks.length} кусков, интонация ${role}`);
  const parts = [];
  for (const text of chunks) parts.push(await synthesize(process.env, text, role));
  const mp3 = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { mp3.set(p, at); at += p.length; }
  const out = path.join(outDir, `${name}.mp3`);
  await writeFile(out, mp3);
  console.log(`${out}: ${Math.round(mp3.length / 1024)} КБ`);
}
