// Озвучка книги-образца «Сказки» тем же путём, что у покупателей (worker/voice.js): Ермиль, интонация «Сказки».
//   node --env-file=server/.env scripts/voice_example.mjs assets/examples/max-3d/book.js OUT.mp3
// Файл потом загружается в R2 (media/<папка>/…mp3) и подключается в book.js как audio: [{ title, src: '/api/media/…' }].
// Платно: 0,1626 ₽ за каждые 250 символов (у «Сказки» Макса ≈ 6 тыс. символов ≈ 4 ₽).
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
import { voiceTracks, splitText, synthesize, roleFor } from '../worker/voice.js';

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error('usage: voice_example.mjs book.js OUT.mp3');
if (!process.env.YANDEX_API_KEY) throw new Error('YANDEX_API_KEY is missing (server/.env)');

// book.js — это window.SKAZKA_…_BOOK = {...}: выполняем в пустой песочнице и берём объект
const sandbox = { window: {} };
vm.runInNewContext(await readFile(src, 'utf8'), sandbox);
const data = Object.values(sandbox.window)[0];
const role = roleFor({ tariff: 'short' }, process.env);

const tracks = voiceTracks(data.book);
if (tracks.length !== 1) throw new Error(`expected one track, got ${tracks.length}`);
const chunks = splitText(tracks[0].text);
console.log(`${tracks[0].title}: ${tracks[0].text.length} символов, ${chunks.length} кусков, интонация ${role}`);

const parts = [];
for (const [i, text] of chunks.entries()) {
  parts.push(await synthesize(process.env, text, role));
  console.log(`кусок ${i + 1}/${chunks.length} готов`);
}
const total = parts.reduce((n, p) => n + p.length, 0);
const mp3 = new Uint8Array(total);
let at = 0;
for (const p of parts) { mp3.set(p, at); at += p.length; }
await writeFile(out, mp3);
console.log(`${out}: ${Math.round(total / 1024)} КБ`);
