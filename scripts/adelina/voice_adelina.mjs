// Озвучка книги Аделины из tekst-ru.md тем же путём, что у покупателей «Большой истории» (worker/voice.js).
//   node --env-file=server/.env voice_adelina.mjs tekst-ru.md OUT_DIR [--dry]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { voiceTracks, splitText, synthesize, roleFor } from 'file:///C:/Users/Asus/svoya-skazka/worker/voice.js';

const [src, outDir, flag] = process.argv.slice(2);
// текст — из собранной книги (assets/examples/adelina/book.js), чтобы озвучка совпадала с листами
import vm from 'node:vm';
const sb = { window: {} };
vm.runInNewContext(await readFile(src, 'utf8'), sb);
const book = sb.window.SKAZKA_ADELINA_BOOK;

const role = roleFor({ tariff: 'big', age: 4 }, process.env);
const tracks = voiceTracks({ book });
let total = 0;
for (const t of tracks) total += splitText(t.text).reduce((n, c) => n + Math.ceil(c.length / 250), 0);
console.log(`${tracks.length} дорожек, интонация ${role}, единиц по 250 символов: ${total} ≈ ${(total * 0.1626).toFixed(1)} ₽`);
for (const t of tracks) console.log(`  ${t.title}: ${t.text.length} симв. | начало: ${t.text.slice(0, 90).replace(/\n/g, ' / ')}`);
if (flag === '--dry') process.exit(0);

await mkdir(outDir, { recursive: true });
for (const [i, t] of tracks.entries()) {
  const name = i === 0 && t.title === 'Посвящение' ? '0-posvyashchenie' : `${i}-glava-${i}`;
  const parts = [];
  for (const text of splitText(t.text)) parts.push(await synthesize(process.env, text.replace(/Аделин/g, 'Адэлин'), role)); // твёрдое «д» (просьба владелицы 06.10)
  const mp3 = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { mp3.set(p, at); at += p.length; }
  await writeFile(path.join(outDir, `${name}.mp3`), mp3);
  console.log(`${name}.mp3: ${Math.round(mp3.length / 1024)} КБ`);
}
