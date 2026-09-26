// Промпты «геройских» иллюстраций (с настоящим лицом ребёнка). Само рисование — в worker/art.js (Cloudflare Worker).
//
// Инструкции по сохранению сходства и правила промпт-инжиниринга — из docs/story-prompt-template.md, проверены
// на практике вручную; здесь они зашиты как константы, а не генерируются моделью, чтобы формулировки не «поплыли»
// от заказа к заказу. Описания сцен (brief) пишет текстовая модель вместе с книгой (story.js, bigstory.js).

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

export const MAX_PHOTOS = 3;

/**
 * Что передать модели: образцы и промпт. null — рисовать не по чему.
 * refs — фото ребёнка, sheet — лист персонажа, source — картинка для раскраски; формат картинок любой ({ mime, data } или { mime, bytes }).
 */
export function imageRequest({ refs = [], sheet = null, source = null, kind = 'scene', styleLabel, eyes, brief, look } = {}) {
  if (kind === 'coloring') return source ? { images: [source], prompt: buildColoringPrompt() } : null;
  // перерисовка после генерации: фото ребёнка уже удалено, лицо и одежду держит лист персонажа
  if (!refs.length && !sheet) return null;
  const images = sheet && kind !== 'sheet' ? [...refs, sheet] : refs;
  const prompt = refs.length
    ? buildHeroPrompt({ styleLabel, eyes, brief, look, photoCount: refs.length, withSheet: Boolean(sheet) && kind !== 'sheet', kind })
    : buildHeroPrompt({ styleLabel, eyes, brief, look, withSheet: true, kind }).replace(/reference photo/g, 'character reference sheet');
  return { images, prompt };
}
