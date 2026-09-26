// Перерисовка готовых иллюстраций книги в стиле «3D-мультфильм» (для образца на сайте).
// Сцена, ракурс и люди сохраняются, меняется только техника — по тем же правилам 3D, что у заказов (server/lib/illustrate.js).
// ПЛАТНО: одна картинка ≈ $0,08. Ключ — OPENAI_API_KEY из server/.env.
//
//   node --env-file=server/.env scripts/restyle_3d.mjs <вход.jpg> <выход.webp> [доля без таблички, по умолч. 0.74] [кто на картинке и сколько лет]

import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { STYLE_TECHNIQUE } from '../server/lib/illustrate.js';

const [input, output, keepShare = '0.74', people = ''] = process.argv.slice(2);
if (!input || !output || !process.env.OPENAI_API_KEY) {
  console.error('Нужно: вход, выход и OPENAI_API_KEY');
  process.exit(1);
}

// Нижняя часть исходника занята табличкой с подписью — отрезаем её (Pillow, как в brand_assets.py)
const cropped = output.replace(/\.webp$/, '.ref.jpg');
execFileSync('python', ['-c', `
from PIL import Image
im = Image.open(r'''${input}''').convert('RGB')
im.crop((0, 0, im.width, round(im.height * ${Number(keepShare)}))).save(r'''${cropped}''', quality=92)
`]);

const prompt = [
  'Re-render this exact illustration from a children’s book as a still frame from a modern 3D animated feature film.',
  'Keep the same scene, composition, camera angle, time of day and lighting mood, the same objects and setting.',
  'Keep every person instantly recognizable as the same person: the same eyes and eye color, hairstyle and hair color, age, skin tone, distinctive features and the same clothes; face and body proportions may be gently stylized as the art style below describes.',
  // первая проба: Макс смеялся, глядя в тетрадь, а в 3D вытаращил огромные глаза вбок — выражение и взгляд держим отдельно
  'Keep each person’s facial expression and gaze exactly as in the reference: where they look, how open or narrowed the eyes are (a laughing person keeps smiling, narrowed eyes), the same smile. Eyes must be natural human proportions — not enlarged, bulging or wide-open cartoon eyes.',
  people ? `People in the picture and their real ages, which must stay readable: ${people}.` : '',
  `Change only the rendering technique: ${STYLE_TECHNIQUE.animated3d}.`,
  'The reference was cropped at the bottom: extend the scene naturally downward. The lowest quarter of the frame must stay calm and simple (table surface, floor, ground or road) because a caption plate will be placed over it — no faces or important details there.',
  'Portrait book page. No text, letters, captions, logos, watermarks or signatures anywhere in the image.'
].filter(Boolean).join(' ');

const form = new FormData();
form.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5');
form.append('prompt', prompt);
form.append('image[]', new Blob([await readFile(cropped)], { type: 'image/jpeg' }), 'ref.jpg');
form.append('size', '1024x1536');
form.append('quality', 'medium');
form.append('input_fidelity', 'high');
form.append('output_format', 'webp');
form.append('output_compression', '88');

const started = Date.now();
const res = await fetch('https://api.openai.com/v1/images/edits', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  body: form,
  signal: AbortSignal.timeout(240_000)
});
const data = await res.json();
if (!res.ok) {
  console.error(`OpenAI ${res.status}: ${data?.error?.message}`);
  process.exit(1);
}
await writeFile(output, Buffer.from(data.data[0].b64_json, 'base64'));
console.log(JSON.stringify({ output, seconds: Math.round((Date.now() - started) / 1000), usage: data.usage }));
