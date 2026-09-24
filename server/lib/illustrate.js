// Генерация «геройской» иллюстрации (с настоящим лицом ребёнка) через Gemini image-модель («Nano Banana»).
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
const EMOTION_BLOCK = 'Facial expression: a natural, warm expression that fits this exact moment of the story — curiosity, joy, focus, surprise or wonder — with bright engaged eyes.';

const COMPOSITION_BLOCK = 'Composition: a single vertical book page illustration, portrait aspect ratio approximately 2:3 like a standard book page, not a wide landscape spread. Frame the child from the waist up or in full figure, whichever suits the action, at a natural eye-level or slightly low heroic angle. The illustration must be completely free of any text, letters, words, or empty space reserved for text overlay — text always lives on a separate neighboring page.';

// Обложка: название книги накладывается поверх картинки вёрсткой (кириллицу модель рисует с ошибками), поэтому верх — спокойный
const COVER_COMPOSITION = 'Composition: the front cover illustration of a children’s book, portrait aspect ratio approximately 3:4. The child is the clear hero in the lower two thirds of the picture, in a confident, inviting pose that hints at the adventure. The upper third is a calm, softly detailed area of sky or background, because the book title will be typeset over it later. The illustration itself must contain no text, letters or words.';

const SHEET_COMPOSITION = 'Composition: a character reference sheet on a plain warm off-white background — the child shown in full figure from the front, and a second smaller three-quarter view beside, standing in a relaxed natural pose, evenly lit. Any companion described below stands next to the child in full view. No scenery, no text, no labels.';

const AVOID_BLOCK = 'Avoid: photorealistic rendering, extra or malformed fingers, blurry or distorted anatomy, watermarks, signatures, logos, brand names, characters from existing cartoons, films or games, and any text or lettering.';

// Два стиля на запуск: фирменная акварель и объёмная 3D-анимация (самый востребованный на рынке)
const STYLE_TECHNIQUE = {
  watercolor: 'traditional watercolor illustration technique, soft visible paper texture, gentle color bleeds and granulation, loose expressive brushstrokes with soft edges, translucent glazes of color, delicate ink linework accents',
  animated3d: 'modern 3D animated feature film style, smooth stylized character rendering with soft rounded proportions, subtle subsurface scattering on the skin, soft global illumination, gentle specular highlights on hair and fabric, rich cinematic lighting'
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
  photo,
  photos,
  sheet = null,
  source = null,
  kind = 'scene',
  styleLabel,
  eyes,
  brief,
  look,
  timeoutMs = 45_000,
  retries = 1,
  log = () => {}
} = {}) {
  if (!apiKey) return null;
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

  try {
    return await callGemini({ apiKey, model, images, prompt, timeoutMs, retries });
  } catch (error) {
    log(`[illustrate] ${kind} image failed: ${error?.message || error}`);
    return null;
  }
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

/**
 * Все иллюстрации книги с ребёнком: сначала лист персонажа (по нему одежда и спутники одинаковые на всех страницах),
 * потом обложка и страницы — параллельно. Не укладываемся в срок — оставшиеся страницы пропускаем, книга не ждёт.
 *
 * scenes: [{ brief }]. Возвращает { sheet, cover, scenes: [dataURL|null], coloring: [dataURL|null] } — всё data:URL.
 */
export async function illustrateBook(input, {
  scenes = [],
  coverBrief = '',
  look = '',
  illustrate = generateHeroImage,
  concurrency = Number(process.env.IMAGE_CONCURRENCY || 3),
  deadlineAt = Infinity,
  coloring = false,
  onProgress = () => {},
  log = () => {}
} = {}) {
  const photos = photosFrom(input);
  const empty = { sheet: null, cover: null, scenes: scenes.map(() => null), coloring: [] };
  if (!photos.length) return empty;

  const base = { photos, styleLabel: input.style, eyes: input.eyes, look, log };
  const total = scenes.length + (coverBrief ? 1 : 0) + 1;
  let done = 0;
  const tick = () => { done += 1; onProgress(done, total); };

  const sheetImg = await illustrate({ ...base, kind: 'sheet', brief: 'character reference sheet' });
  tick();
  const sheet = sheetImg || null;

  const jobs = [
    ...(coverBrief ? [{ kind: 'cover', brief: coverBrief }] : []),
    ...scenes.map((s) => ({ kind: 'scene', brief: s.brief }))
  ];
  const results = await pool(jobs, concurrency, async (job) => {
    if (Date.now() > deadlineAt) return null; // время вышло — страница останется с фоновой сценой
    const image = await illustrate({ ...base, kind: job.kind, brief: job.brief, sheet });
    tick();
    return image ? dataUrl(image) : null;
  });

  const cover = coverBrief ? results.shift() : null;
  let coloringPages = [];
  if (coloring) {
    const sources = results.filter(Boolean).slice(0, 6);
    coloringPages = (await pool(sources, concurrency, async (src) => {
      if (Date.now() > deadlineAt) return null;
      const image = await illustrate({ kind: 'coloring', source: fromDataUrl(src), log });
      return image ? dataUrl(image) : null;
    })).filter(Boolean);
  }

  return { sheet: sheet ? dataUrl(sheet) : null, cover, scenes: results, coloring: coloringPages };
}
