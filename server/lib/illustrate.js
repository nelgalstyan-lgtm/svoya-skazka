// Генерация «геройской» иллюстрации (с настоящим лицом ребёнка): OpenAI gpt-image (основной, если есть ключ)
// или Gemini image-модель («Nano Banana») — второй служит запасным.
//
// Работает поверх уже готового текста книги: story.js и bigstory.js сами решают, какая страница
// геройская, и присылают сюда только фото ребёнка + короткое английское описание сцены (brief/heroBrief).
// Инструкции по сохранению сходства и правила промпт-инжиниринга — из docs/story-prompt-template.md,
// проверены на практике вручную; здесь они зашиты как константы, а не генерируются моделью, чтобы
// формулировки не «поплыли» от заказа к заказу.
//
// Если фото нет, ключа нет или Gemini недоступен — просто возвращаем null: книга всё равно уходит
// клиенту с текстом и декоративным фоном на месте геройского разворота (тот же принцип, что и у текста).

import { GoogleGenAI } from '@google/genai';

const IDENTITY_BLOCK = (eyes, count = 1) => `Preserve the child's exact identity from the reference photo${count > 1 ? 's (all of them show the same child from different angles)' : ''}: keep the facial structure and proportions, the eye shape and eye color${eyes ? ` (${eyes})` : ''}, the nose shape, the lips and mouth shape, the hairstyle and hair color, the age, and any distinctive features exactly as in the reference photo such as freckles, a gap between the teeth, dimples, moles or birthmarks if present. The child must remain instantly recognizable as the exact same person from the reference photo — do not beautify, idealize, or stylize the face into a generic look, and do not age the character up or down.`;

// Лист персонажа идёт последним изображением в запросе: по нему держим одинаковыми одежду, причёску и спутников во всей книге
const SHEET_BLOCK = 'The last attached image is the character reference sheet for this book: draw the child with exactly the same outfit, colors, hairstyle and proportions as on that sheet, and draw any companion (pet, toy, friend) shown there exactly the same way. The face must still match the reference photo first of all.';

// Эмоция следует за сценой: на восьми-десяти страницах одно и то же «сосредоточенное» лицо выглядит мёртво
const EMOTION_BLOCK = 'Facial expression: take it from this exact moment of the story, not from the reference photo — the photo only defines who the child is. Depending on the scene it can be quiet curiosity, calm focus, surprise, wonder, a small smile or open joy; bright engaged eyes.';

const COMPOSITION_BLOCK = 'Composition: a single vertical book page illustration, portrait aspect ratio approximately 2:3 like a standard book page, not a wide landscape spread. Frame the child from the waist up or in full figure, whichever suits the action, at a natural eye-level or slightly low heroic angle. The illustration must be completely free of any text, letters, words, or empty space reserved for text overlay — text always lives on a separate neighboring page.';

// Обложка: название книги накладывается поверх картинки вёрсткой (кириллицу модель рисует с ошибками), поэтому верх — спокойный
const COVER_COMPOSITION = 'Composition: the front cover illustration of a children’s book, portrait aspect ratio approximately 3:4. The child is the clear hero in the lower two thirds of the picture, in a confident, inviting pose that hints at the adventure. The upper third is a calm, softly detailed area of sky or background, because the book title will be typeset over it later. The illustration itself must contain no text, letters or words.';

const SHEET_COMPOSITION = 'Composition: a character reference sheet on a plain warm off-white background — the child shown in full figure from the front, and a second smaller three-quarter view beside, standing in a relaxed natural pose, evenly lit. Any companion described below stands next to the child in full view. No scenery, no text, no labels.';

const AVOID_BLOCK = 'Avoid: photorealistic rendering, extra or malformed fingers, blurry or distorted anatomy, watermarks, signatures, logos, brand names, characters from existing cartoons, films or games, and any text or lettering.';

// Два стиля на запуск: фирменная акварель и объёмная 3D-анимация (самый востребованный на рынке)
const STYLE_TECHNIQUE = {
  watercolor: 'traditional hand-painted watercolor children’s book illustration, smooth transparent washes that blend softly into each other, soft wet-on-wet edges, visible cold-press paper texture only in the lightest areas, delicate fine ink linework accents, warm natural light; clean painterly surfaces with no pixelation, mosaic, dotted or blocky texture',
  animated3d: 'stylized 3D computer animation like a still frame from a modern animated feature film — clearly a CG cartoon render, never a photograph: simplified smooth forms, soft matte skin without pores, hair sculpted into soft clumps, clean saturated colors, soft global illumination and gentle rim light, a slightly miniature, toy-like world'
};

export const STYLE_LABELS = { watercolor: 'Акварель', animated3d: '3D-мультфильм' };

export function pickStyleKey(styleLabel) {
  const s = String(styleLabel || '').toLowerCase();
  if (/3d|3д|пластилин|clay|мульт|animated/.test(s)) return 'animated3d';
  return 'watercolor';
}

const lookLine = (look) => (String(look || '').trim() ? `The child's outfit and companions for the whole book: ${String(look).trim()}` : '');

/** Собирает полный английский image_prompt по правилам из docs/story-prompt-template.md. */
export function buildHeroPrompt({ styleLabel, eyes, brief, look, photoCount = 1, withSheet = false, kind = 'scene' } = {}) {
  const styleKey = pickStyleKey(styleLabel);
  const scene = String(brief || '').trim()
    || 'The child stands confidently at the story’s key moment, caught in an active, dynamic pose that fits the scene, surrounded by details from the adventure around them.';
  const composition = kind === 'cover' ? COVER_COMPOSITION : kind === 'sheet' ? SHEET_COMPOSITION : COMPOSITION_BLOCK;

  return [
    IDENTITY_BLOCK(eyes, photoCount),
    withSheet && kind !== 'sheet' ? SHEET_BLOCK : '',
    kind === 'sheet' ? 'Facial expression: a friendly open smile, bright engaged eyes.' : EMOTION_BLOCK,
    kind === 'sheet' ? '' : scene,
    lookLine(look),
    `Art style and rendering technique: ${STYLE_TECHNIQUE[styleKey]}.`,
    composition,
    AVOID_BLOCK
  ].filter(Boolean).join(' ');
}

/** Раскраска из готовой иллюстрации: тот же рисунок, только чистый контур для печати. */
export function buildColoringPrompt() {
  return 'Turn the attached children’s book illustration into a clean black-and-white coloring page: keep the same composition, the same child and all key objects, redraw everything as clear, closed, smooth black outlines of even medium thickness on a pure white background. No shading, no gray fills, no color, no hatching, no text. Simplify tiny background details so that a child of 5–10 can color it with pencils.';
}

/** Фото из анкеты: { mime, data } с data в base64 без префикса "data:...;base64,". */
export function normalizePhoto(photo) {
  if (!photo || typeof photo !== 'object') return null;
  const mime = String(photo.mime || '');
  const data = String(photo.data || '');
  if (!/^image\/(jpeg|png|webp)$/.test(mime) || !data) return null;
  return { mime, data };
}

export const MAX_PHOTOS = 3;

/** Все фото ребёнка из анкеты (photos[] или старое одиночное photo), не больше MAX_PHOTOS. */
export function photosFrom(input) {
  const list = Array.isArray(input?.photos) ? input.photos : [];
  return [...list, input?.photo].map(normalizePhoto).filter(Boolean).slice(0, MAX_PHOTOS);
}

const dataUrl = (image) => `data:${image.mime};base64,${image.data}`;

/** data:URL иллюстрации обратно в { mime, data } — чтобы передать её модели как образец. */
export function fromDataUrl(src) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(String(src || ''));
  return m ? { mime: m[1], data: m[2] } : null;
}

async function callGemini({ apiKey, model, images, prompt, timeoutMs, retries }) {
  const ai = new GoogleGenAI({ apiKey });
  let attempt = 0;

  while (true) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: [{
            role: 'user',
            parts: [
              { text: prompt },
              ...images.map((im) => ({ inlineData: { mimeType: im.mime, data: im.data } }))
            ]
          }]
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('image generation timed out')), timeoutMs))
      ]);

      const parts = response?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p) => p?.inlineData?.data);
      if (!imagePart) throw new Error('no image in Gemini response');
      return { data: imagePart.inlineData.data, mime: imagePart.inlineData.mimeType || 'image/png' };
    } catch (error) {
      const msg = error?.message || 'unknown error';
      const temporary = /503|429|UNAVAILABLE|timed out|timeout/i.test(msg);
      if (temporary && attempt < retries) {
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
        continue;
      }
      throw error;
    }
  }
}

// Размер картинки OpenAI под задачу: страницы и обложка — книжный портрет, лист персонажа — горизонтальный
const OPENAI_SIZE = { scene: '1024x1536', cover: '1024x1536', coloring: '1024x1536', sheet: '1536x1024' };

async function callOpenAI({ apiKey, model, images, prompt, kind, quality, timeoutMs, retries }) {
  let attempt = 0;
  // input_fidelity=high лучше держит лицо; если модель параметр не знает — повторяем без него.
  // OPENAI_INPUT_FIDELITY=low — если фото клиентов часто маленькие: high переносит в рисунок и их пиксели
  let fidelity = (process.env.OPENAI_INPUT_FIDELITY || 'high') === 'high';

  while (true) {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    images.forEach((im, i) => form.append('image[]', new Blob([Buffer.from(im.data, 'base64')], { type: im.mime }), `ref-${i + 1}.${im.mime.split('/')[1]}`));
    form.append('size', OPENAI_SIZE[kind] || OPENAI_SIZE.scene);
    form.append('quality', quality);
    if (fidelity) form.append('input_fidelity', 'high');

    try {
      const response = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(timeoutMs)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = data?.error?.message || `HTTP ${response.status}`;
        if (response.status === 400 && fidelity && /input_fidelity/i.test(msg)) { fidelity = false; continue; }
        // «no credits» — не временная ошибка, повторять бессмысленно
        const error = new Error(`OpenAI ${response.status}: ${msg}`);
        error.temporary = response.status >= 500 || (response.status === 429 && !/credit|quota|billing/i.test(msg));
        throw error;
      }
      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) throw new Error('no image in OpenAI response');
      return { data: b64, mime: 'image/png' };
    } catch (error) {
      const temporary = error.temporary || /timed? ?out|aborted|fetch failed/i.test(error?.message || '');
      if (temporary && attempt < retries) {
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Сервисы картинок по порядку: IMAGE_PROVIDER=openai|gemini задаёт первый, второй — запасной.
 * По умолчанию сначала OpenAI (если есть ключ), потом Gemini.
 */
function imageProviders({ apiKey, model, openaiKey, openaiModel, openaiQuality }) {
  const list = [];
  if (openaiKey) list.push({ name: 'openai', call: (o) => callOpenAI({ ...o, apiKey: openaiKey, model: openaiModel, quality: openaiQuality }) });
  if (apiKey) list.push({ name: 'gemini', call: (o) => callGemini({ ...o, apiKey, model }) });
  if (process.env.IMAGE_PROVIDER === 'gemini') list.reverse();
  return list;
}

/**
 * Генерирует одну иллюстрацию. НИКОГДА не бросает — при любой ошибке отдаёт null,
 * а книга остаётся с декоративным фоном на этой странице вместо лица ребёнка.
 *
 * kind: 'scene' (страница книги) | 'cover' (обложка) | 'sheet' (лист персонажа) | 'coloring' (раскраска из source)
 * photos — фото ребёнка (1–3), sheet — лист персонажа (образец одежды и спутников), source — картинка для раскраски.
 */
export async function generateHeroImage({
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
  openaiKey = process.env.OPENAI_API_KEY,
  openaiModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5', // сравнили с gpt-image-2: чистая акварель без «мозаики», эмоция по сцене, вдвое быстрее
  openaiQuality = process.env.OPENAI_IMAGE_QUALITY || 'medium',
  photo,
  photos,
  sheet = null,
  source = null,
  kind = 'scene',
  styleLabel,
  eyes,
  brief,
  look,
  timeoutMs = Number(process.env.IMAGE_TIMEOUT_MS || 180_000), // высокое качество OpenAI рисует дольше полутора минут
  retries = 1,
  log = () => {}
} = {}) {
  const providers = imageProviders({ apiKey, model, openaiKey, openaiModel, openaiQuality });
  if (!providers.length) return null;
  let images;
  let prompt;
  if (kind === 'coloring') {
    const src = normalizePhoto(source);
    if (!src) return null;
    images = [src];
    prompt = buildColoringPrompt();
  } else {
    const refs = photosFrom({ photos, photo });
    // перерисовка после генерации: фото ребёнка уже удалено, лицо и одежду держит лист персонажа
    const safeSheet = normalizePhoto(sheet);
    if (!refs.length && !safeSheet) return null;
    images = safeSheet && kind !== 'sheet' ? [...refs, safeSheet] : refs;
    prompt = refs.length
      ? buildHeroPrompt({ styleLabel, eyes, brief, look, photoCount: refs.length, withSheet: Boolean(safeSheet) && kind !== 'sheet', kind })
      : buildHeroPrompt({ styleLabel, eyes, brief, look, withSheet: true, kind }).replace(/reference photo/g, 'character reference sheet');
  }

  for (const provider of providers) {
    try {
      return await provider.call({ images, prompt, kind, timeoutMs, retries });
    } catch (error) {
      log(`[illustrate] ${kind} image failed via ${provider.name}: ${error?.message || error}`);
    }
  }
  return null;
}

/** Выполняет задачи по несколько штук одновременно, сохраняя порядок результатов. */
async function pool(items, limit, worker) {
  const out = new Array(items.length).fill(null);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
  return out;
}

/** Раскраска: контурные версии готовых иллюстраций (не больше 6). */
export async function coloringPages(sources, { illustrate = generateHeroImage, concurrency = Number(process.env.IMAGE_CONCURRENCY || 3), deadlineAt = Infinity, log = () => {} } = {}) {
  const list = sources.filter(Boolean).slice(0, 6);
  return (await pool(list, concurrency, async (src) => {
    if (Date.now() > deadlineAt) return null;
    const image = await illustrate({ kind: 'coloring', source: fromDataUrl(src), log });
    return image ? dataUrl(image) : null;
  })).filter(Boolean);
}

/**
 * Иллюстрации книги с ребёнком: сначала лист персонажа (по нему одежда и спутники одинаковые на всех страницах),
 * потом обложка и страницы — параллельно. Не укладываемся в срок — оставшиеся страницы пропускаем, книга не ждёт.
 *
 * scenes: [{ brief }]. only — номера страниц, которые рисуем сейчас (превью до оплаты); остальные — null, дорисуются потом.
 * sheet — уже готовый лист персонажа (data:URL): при дорисовке после оплаты новый не рисуем.
 * Возвращает { sheet, cover, scenes: [dataURL|null], coloring: [dataURL] } — всё data:URL.
 */
export async function illustrateBook(input, {
  scenes = [],
  coverBrief = '',
  look = '',
  illustrate = generateHeroImage,
  concurrency = Number(process.env.IMAGE_CONCURRENCY || 3),
  deadlineAt = Infinity,
  coloring = false,
  only = null,
  sheet: readySheet = null,
  onProgress = () => {},
  log = () => {}
} = {}) {
  const photos = photosFrom(input);
  const empty = { sheet: readySheet, cover: null, scenes: scenes.map(() => null), coloring: [] };
  // после оплаты фото может уже не быть (истёк срок хранения) — тогда рисуем по листу персонажа
  if (!photos.length && !readySheet) return empty;

  const base = { photos, styleLabel: input.style, eyes: input.eyes, look, log };
  const wanted = scenes.map((_, i) => !only || only.includes(i));
  const total = wanted.filter(Boolean).length + (coverBrief ? 1 : 0) + (readySheet ? 0 : 1);
  let done = 0;
  const tick = () => { done += 1; onProgress(done, total); };

  let sheet = fromDataUrl(readySheet);
  if (!sheet) {
    sheet = await illustrate({ ...base, kind: 'sheet', brief: 'character reference sheet' });
    tick();
  }

  const jobs = [
    ...(coverBrief ? [{ kind: 'cover', brief: coverBrief, draw: true }] : []),
    ...scenes.map((s, i) => ({ kind: 'scene', brief: s.brief, draw: wanted[i] }))
  ];
  const results = await pool(jobs, concurrency, async (job) => {
    if (!job.draw || Date.now() > deadlineAt) return null; // не сейчас (дорисуем после оплаты) или время вышло
    const image = await illustrate({ ...base, kind: job.kind, brief: job.brief, sheet });
    tick();
    return image ? dataUrl(image) : null;
  });

  // вторая попытка для того, что не нарисовалось (сбой сервиса, таймаут) — пока есть время
  const failed = results.map((r, i) => (r || !jobs[i].draw ? -1 : i)).filter((i) => i >= 0);
  if (failed.length && Date.now() < deadlineAt) {
    log(`[illustrate] retrying ${failed.length} failed image(s)`);
    await pool(failed, concurrency, async (i) => {
      if (Date.now() > deadlineAt) return;
      const image = await illustrate({ ...base, kind: jobs[i].kind, brief: jobs[i].brief, sheet });
      if (image) results[i] = dataUrl(image);
    });
  }

  const cover = coverBrief ? results.shift() : null;
  const coloringResult = coloring ? await coloringPages(results, { illustrate, concurrency, deadlineAt, log }) : [];

  return { sheet: sheet ? (readySheet || dataUrl(sheet)) : null, cover, scenes: results, coloring: coloringResult };
}
