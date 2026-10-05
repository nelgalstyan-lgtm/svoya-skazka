// Промпты «геройских» иллюстраций (с настоящим лицом ребёнка). Само рисование — в worker/art.js (Cloudflare Worker).
//
// Инструкции по сохранению сходства и правила промпт-инжиниринга — из docs/story-prompt-template.md, проверены
// на практике вручную; здесь они зашиты как константы, а не генерируются моделью, чтобы формулировки не «поплыли»
// от заказа к заказу. Описания сцен (brief) пишет текстовая модель вместе с книгой (story.js, bigstory.js).

const IDENTITY_BLOCK = (eyes, count = 1) => `Preserve the child's exact identity from the reference photo${count > 1 ? 's (all of them show the same child from different angles)' : ''}: keep the facial structure and proportions, the eye shape and eye color${eyes ? ` (${eyes})` : ''}, the nose shape, the lips and mouth shape, the hairstyle and hair color, the age, and any distinctive features exactly as in the reference photo such as freckles, a gap between the teeth, dimples, moles or birthmarks if present. The child must remain instantly recognizable as the exact same person from the reference photo — do not beautify, idealize, or stylize the face into a generic look, and do not age the character up or down.`;

// Лист персонажа идёт последним изображением в запросе: по нему держим одинаковыми одежду, причёску и спутников во всей книге
const SHEET_BLOCK = 'The last attached image is the character reference sheet for this book: draw the child with exactly the same outfit, colors, hairstyle and proportions as on that sheet, and draw any companion (pet, toy, friend) shown there exactly the same way. The face must still match the reference photo first of all.';

// Уроки ручной книги «Амилия» (01.10): модель сама добавляла панамки, а младших детей рисовала одного роста с малышами
// и с «младенческими» лицами. Одежда меняется только по сюжету (пижама, зимняя куртка) — так было и у Макса.
const OUTFIT_BLOCK = 'Outfit: keep exactly the same clothes, shoes and hairstyle as described for the whole book in every illustration; do not add hats, caps, sun hats, glasses, bags, jewelry or any other accessories that are not part of that outfit — change clothes only if the scene description explicitly requires it (pajamas at bedtime, a warm coat in the snow, a swimsuit at the sea).';
const PEOPLE_AGE_BLOCK = 'Other people, if any appear: draw each one with the height, body proportions and face of their real age — a 4-year-old is a preschooler, clearly taller than a 2-year-old toddler and not a baby; younger children are always smaller than older ones; adults are adults. Everyone, adults too, is drawn in exactly the same stylized art style as the child, never photorealistic.';

// Эмоция следует за сценой: на восьми-десяти страницах одно и то же «сосредоточенное» лицо выглядит мёртво
const EMOTION_BLOCK = 'Facial expression: take it from this exact moment of the story, not from the reference photo — the photo only defines who the child is. Depending on the scene it can be quiet curiosity, calm focus, surprise, wonder, a small smile or open joy; bright engaged eyes.';

const COMPOSITION_BLOCK = 'Composition: a single vertical book page illustration, portrait aspect ratio approximately 2:3 like a standard book page, not a wide landscape spread. Frame the child from the waist up or in full figure, whichever suits the action, at a natural eye-level or slightly low heroic angle. The illustration must be completely free of any text, letters, words, or empty space reserved for text overlay — text always lives on a separate neighboring page.';

// Обложка: название книги накладывается поверх картинки вёрсткой (кириллицу модель рисует с ошибками), поэтому верх — спокойный
// «Амилия» (01.10): голова героини оказалась под названием, а в сертификате (портрет вырезается из обложки) лицо вышло крошечным.
// Поэтому: верхняя треть — пустая (ни головы, ни крыльев), лицо крупное и по центру, на уровне ~45% высоты.
const COVER_COMPOSITION = 'Composition: the front cover illustration of a children’s book, portrait aspect ratio approximately 3:4. The child is the only character on the cover — no other people and no animals, even if the scene description mentions them — standing in the horizontal center, in a confident, inviting pose that hints at the adventure, shown from about the knees up so that the face is large and clearly visible; the child’s head is at about 40–50% of the image height — never in the upper third. The upper third is a calm, softly detailed area of sky or background with no heads, faces, wings or important objects, because the book title will be typeset over it later. The illustration itself must contain no text, letters or words.';

const SHEET_COMPOSITION = 'Composition: a character reference sheet on a plain warm off-white background — the child shown in full figure from the front, and a second smaller three-quarter view beside, standing in a relaxed natural pose, evenly lit. Only the child — no other people; a pet or toy appears next to the child only if it is listed below under pets and toys. No scenery, no text, no labels.';

const AVOID_BLOCK = 'Avoid: photorealistic rendering, extra or malformed fingers, blurry or distorted anatomy, watermarks, signatures, logos, brand names, characters from existing cartoons, films or games, and any text or lettering.';

// Два стиля на запуск: фирменная акварель и объёмная 3D-анимация (самый востребованный на рынке)
export const STYLE_TECHNIQUE = {
  watercolor: 'traditional hand-painted watercolor children’s book illustration, smooth transparent washes that blend softly into each other, soft wet-on-wet edges, visible cold-press paper texture only in the lightest areas, delicate fine ink linework accents, warm natural light; clean painterly surfaces with no pixelation, mosaic, dotted or blocky texture',
  // 3D «мультяшнее» за счёт форм, а не глаз (глаза как на фото — иначе теряется сходство); детские пропорции только малышам —
  // подростка они молодят, а сайт обещает книгу «не стыдно читать и в двенадцать» (решения 26.09)
  animated3d: 'stylized 3D computer animation like a still frame from a modern animated feature film — clearly a CG cartoon render, never a photograph: noticeably cartoon stylization that respects the child’s real age: young children get rounder softer faces, full cheeks and a slightly larger head, while older children and teenagers keep a longer face, visible cheekbones and jaw and teenage body proportions and must not look younger, clothing simplified into bold clean shapes with few folds, hair sculpted into large chunky stylized clumps, soft matte skin without pores, rich saturated colors, soft global illumination and gentle rim light, a slightly miniature, toy-like world; the eyes stay natural in size and shape, true to the real child'
};

export const STYLE_LABELS = { watercolor: 'Акварель', animated3d: '3D-мультфильм' };

export function pickStyleKey(styleLabel) {
  const s = String(styleLabel || '').toLowerCase();
  if (/3d|3д|пластилин|clay|мульт|animated/.test(s)) return 'animated3d';
  return 'watercolor';
}

// Одежда — с фото ребёнка (как у Макса): придуманный ИИ-писателем наряд уводил от фото («Люсечка», 05.10 — бирюзовый свитер
// вместо одежды со снимка). look теперь описывает только питомцев и игрушки из анкеты.
const OUTFIT_FROM_PHOTO = 'The child wears exactly the same clothes and shoes as in the reference photo throughout the whole book (same garments, colors and prints), changed only when a scene explicitly requires it.';
const lookLine = (look) => [OUTFIT_FROM_PHOTO, String(look || '').trim() ? `Pets and toys from the story, the same on every page: ${String(look).trim()}` : ''].filter(Boolean).join(' ');

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
    kind === 'sheet' ? '' : OUTFIT_BLOCK,
    kind === 'sheet' ? '' : PEOPLE_AGE_BLOCK,
    `Art style and rendering technique: ${STYLE_TECHNIQUE[styleKey]}.`,
    composition,
    AVOID_BLOCK
  ].filter(Boolean).join(' ');
}

/** Раскраска из готовой иллюстрации: тот же рисунок, только чистый контур для печати. */
export function buildColoringPrompt() {
  // «Амилия» (01.10): с общим описанием семьи модель дорисовала в раскраску родителей и аиста с узелком;
  // «Макс» (29.09): без явной просьбы менялись принты на одежде. Поэтому — строго обвести то, что есть.
  return 'Turn the attached children’s book illustration into a clean black-and-white coloring page by tracing THIS exact picture: keep the same composition and only the characters, animals and objects that are already in it — do NOT add any new people, animals or objects, and do not put anything new into anyone’s hands or beak. Keep every person recognizable exactly as in the illustration: the same faces, hairstyles, heights and proportions, and the same clothes with the same prints and patterns; do not redraw them in a different cartoon style. Redraw everything as clear, closed, smooth black outlines of even medium thickness on a pure white background. No shading, no gray fills, no color, no hatching, no text. Simplify tiny background details so that a child of 5–10 can color it with pencils.';
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
