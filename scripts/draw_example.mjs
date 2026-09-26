// Картинки для книги-образца на сайте по списку заданий (JSON). ПЛАТНО: ≈ $0,07–0,08 за картинку (OpenAI).
// Правила стиля — те же, что у заказов (server/lib/illustrate.js), поэтому образец честно показывает, что получит покупатель.
//
//   node --env-file=server/.env scripts/draw_example.mjs scripts/examples/alex-3d.json [имя задания ...]
//
// Задание: { name, mode: 'restyle' | 'new' | 'coloring', source?, keepTop?, refs?: [путь], scene?, people?, kind?: 'cover' }
//   restyle  — перерисовать source (иллюстрацию книги) в 3D, сохранив сцену и людей; scene — что поменять (например, добавить героя)
//   new      — новая сцена по описанию scene; refs — образцы внешности героев
//   coloring — раскраска-контур из готовой картинки source
// Пути в source/refs: относительно проекта; {ref} — папка с образцами внешности (--refdir, по умолчанию %TEMP%/alexref).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { STYLE_TECHNIQUE, buildColoringPrompt } from '../server/lib/illustrate.js';

const [jobsFile, ...only] = process.argv.slice(2);
const config = JSON.parse(await readFile(jobsFile, 'utf8'));
const refDir = process.env.REF_DIR || path.join(process.env.TEMP || '/tmp', 'alexref');
const resolve = (p) => p.replace('{ref}', refDir);
await mkdir(config.outDir, { recursive: true });

const IDENTITY = 'Keep every person instantly recognizable as the same person: the same eyes and eye color, hairstyle and hair color, age, skin tone, distinctive features and the same clothes in every picture; face and body proportions may be gently stylized as the art style below describes.';
const GAZE = 'Keep each person’s facial expression natural for the moment; eyes must be natural human proportions — not enlarged, bulging or wide-open cartoon eyes.';
const STYLE = `Art style and rendering technique: ${STYLE_TECHNIQUE.animated3d}.`;
const PLATE = 'The lowest quarter of the frame must stay calm and simple (table surface, floor, ground or road) because a caption plate will be placed over it — no faces or important details there.';
const COVER = 'Composition: the front cover of a children’s book, portrait. The hero is the clear center of attention in the lower two thirds; the upper third is calm sky or soft background because the book title will be typeset over it.';
const CLEAN = 'Portrait book page. No text, letters, captions, logos, watermarks or signatures anywhere in the image.';

function cropTop(file, share) {
  const out = path.join(refDir, `${path.basename(file, path.extname(file))}-top.jpg`);
  execFileSync('python', ['-c', `
from PIL import Image
im = Image.open(r'''${file}''').convert('RGB')
im.crop((0, 0, im.width, round(im.height * ${share}))).save(r'''${out}''', quality=92)
`]);
  return out;
}

function promptFor(job) {
  if (job.mode === 'coloring') return buildColoringPrompt();
  const people = job.people ? `People in the picture and their real ages, which must stay readable: ${job.people}.` : '';
  const refsNote = job.refs?.length ? 'The additional reference image(s) show how the characters look in this book (face, hair, clothes, art style) — draw them exactly like that.' : '';
  const lead = job.mode === 'restyle'
    ? ['Re-render the first reference illustration from a children’s book as a still frame from a modern 3D animated feature film.',
       'Keep the same scene, composition, camera angle, time of day and lighting mood, the same objects and setting.',
       'The first reference was cropped at the bottom: extend the scene naturally downward.']
    : ['A new illustration for the same children’s book, as a still frame from a modern 3D animated feature film.'];
  return [...lead, job.scene || '', refsNote, IDENTITY, people, GAZE, STYLE, job.kind === 'cover' ? COVER : PLATE, CLEAN].filter(Boolean).join(' ');
}

async function draw(job) {
  const images = [];
  if (job.source) images.push(job.mode === 'restyle' ? cropTop(resolve(job.source), job.keepTop ?? 0.74) : resolve(job.source));
  for (const r of job.refs || []) images.push(resolve(r));
  const form = new FormData();
  form.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5');
  form.append('prompt', promptFor(job));
  for (const [i, file] of images.entries()) {
    const ext = path.extname(file).toLowerCase();
    const mime = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg';
    form.append('image[]', new Blob([await readFile(file)], { type: mime }), `ref-${i + 1}${ext}`);
  }
  form.append('size', '1024x1536');
  form.append('quality', 'medium');
  if (job.mode !== 'coloring') form.append('input_fidelity', 'high');
  form.append('output_format', 'webp');
  form.append('output_compression', '88');
  const started = Date.now();
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(300_000)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${job.name}: OpenAI ${res.status}: ${data?.error?.message}`);
  const out = path.join(config.outDir, `${job.name}.webp`);
  await writeFile(out, Buffer.from(data.data[0].b64_json, 'base64'));
  return { name: job.name, seconds: Math.round((Date.now() - started) / 1000), in: data.usage?.input_tokens, out: data.usage?.output_tokens };
}

const jobs = config.jobs.filter((j) => !only.length || only.includes(j.name));
for (let k = 0; k < jobs.length; k += 3) {
  const results = await Promise.allSettled(jobs.slice(k, k + 3).map(draw));
  for (const r of results) console.log(r.status === 'fulfilled' ? JSON.stringify(r.value) : `ОШИБКА ${r.reason?.message}`);
}
