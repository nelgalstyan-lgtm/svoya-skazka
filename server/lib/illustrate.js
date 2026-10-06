// Промпты «геройских» иллюстраций (с настоящим лицом ребёнка). Само рисование — в worker/art.js (Cloudflare Worker).
//
// Инструкции по сохранению сходства и правила промпт-инжиниринга — из docs/story-prompt-template.md, проверены
// на практике вручную; здесь они зашиты как константы, а не генерируются моделью, чтобы формулировки не «поплыли»
// от заказа к заказу. Описания сцен (brief) пишет текстовая модель вместе с книгой (story.js, bigstory.js).

const IDENTITY_BLOCK = (eyes, count = 1) => `Preserve the child's exact identity from the reference photo${count > 1 ? 's (all of them show the same child from different angles)' : ''}: keep the facial structure and proportions, the eye shape and eye color${eyes ? ` (${eyes})` : ''}, the nose shape, the lips and mouth shape, the hairstyle and hair color, the age, and any distinctive features exactly as in the reference photo such as freckles, a gap between the teeth, dimples, moles or birthmarks if present. The child must remain instantly recognizable as the exact same person from the reference photo — do not beautify, idealize, or stylize the face into a generic look, and do not age the character up or down.`;

// Лист персонажа идёт последним изображением в запросе: по нему держим одинаковыми одежду, причёску и спутников во всей книге
const SHEET_BLOCK = 'The last attached image is the character reference sheet for this book: draw the child with exactly the same outfit, colors, hairstyle and proportions as on that sheet, and draw any pet or toy shown there exactly the same way. The face must still match the reference photo first of all.';

// Уроки ручной книги «Амилия» (01.10): модель сама добавляла панамки, а младших детей рисовала одного роста с малышами
// и с «младенческими» лицами. Одежда меняется только по сюжету (пижама, зимняя куртка) — так было и у Макса.
const OUTFIT_BLOCK = 'Outfit: keep exactly the same clothes, shoes and hairstyle as described for the whole book in every illustration; do not add hats, caps, sun hats, glasses, bags, jewelry or any other accessories that are not part of that outfit — change clothes only if the scene description explicitly requires it (pajamas at bedtime, a warm coat in the snow, a swimsuit at the sea).';
// Решение владелицы 05.10 («Аэлита»: кузина Аделина по описанию вышла совсем не похожей — «сразу разочарование»):
// пока нет «Родных по фото», из людей рисуем только ребёнка; близкие и друзья — только в тексте
const ONLY_CHILD = 'People: the child is the only human in the picture — do not draw parents, siblings, cousins, friends, other children or any other people, even if the scene description mentions them; pets, animals, toys and magical creatures are fine.';

// Эмоция следует за сценой: на восьми-десяти страницах одно и то же «сосредоточенное» лицо выглядит мёртво
const EMOTION_BLOCK = 'Facial expression: take it from this exact moment of the story, not from the reference photo — the photo only defines who the child is. Depending on the scene it can be quiet curiosity, calm focus, surprise, wonder, a small smile or open joy; bright engaged eyes.';

const COMPOSITION_BLOCK = 'Composition: a single vertical book page illustration, portrait aspect ratio approximately 2:3 like a standard book page, not a wide landscape spread. Frame the child from the waist up or in full figure, whichever suits the action, at a natural eye-level or slightly low heroic angle. The illustration must be completely free of any text, letters, words, or empty space reserved for text overlay — text always lives on a separate neighboring page.';

// Обложка: название книги накладывается поверх картинки вёрсткой (кириллицу модель рисует с ошибками), поэтому верх — спокойный
// «Амилия» (01.10): голова героини оказалась под названием, а в сертификате (портрет вырезается из обложки) лицо вышло крошечным.
// Поэтому: верхняя треть — пустая (ни головы, ни крыльев), лицо крупное и по центру, на уровне ~45% высоты.
const COVER_COMPOSITION = 'Composition: the front cover illustration of a children’s book, portrait aspect ratio approximately 3:4. The child is the only character on the cover — no other people and no animals, even if the scene description mentions them — standing in the horizontal center, in a confident, inviting pose that hints at the adventure, shown from about the knees up so that the face is large and clearly visible; the child’s head is at about 40–50% of the image height — never in the upper third. The upper third is a calm, softly detailed area of sky or background with no heads, faces, wings or important objects, because the book title will be typeset over it later. The illustration itself must contain no text, letters or words.';

// Правило владелицы 05.10 («от этого зависит всё впечатление от книги»): на листах персонажей лица — КРУПНО.
// В полный рост лицо выходит крошечным, и по такому листу модель рисует всю книгу «примерно» (лист семьи Аделины:
// у мамы вышли кудри и чужие очки). Поэтому лист — в два ряда: сверху крупный портрет, снизу полный рост.
const FACE_FIRST = 'Likeness is the most important thing on this sheet: the whole book will be drawn from it, so the face must match the reference photo as closely as possible — the exact face shape, eyes and eye color, eyebrows, nose, mouth, hair texture (straight or curly), hair color and hairline, glasses and any distinctive features; never a generic or prettified face.';
const SHEET_COMPOSITION = 'Composition: a character reference sheet on a plain warm off-white background, in two rows. TOP: a large head-and-shoulders portrait of the child, facing the viewer, so the face is big and detailed. BOTTOM: the same child in full figure from the front and a smaller three-quarter view beside, standing in a relaxed natural pose, evenly lit. The face is identical in all views. Only the child — no other people; a pet or toy appears next to the child only if it is listed below under pets and toys. No scenery, no text, no labels. ' + FACE_FIRST;

// Правило владелицы 07.10 для всех книг на заказ: похожесть И стиль вместе. Обложка Алекса: сначала шаблонное мультяшное
// лицо (огромные круглые глаза) — непохож; после правки «под фото» — похож, но фотореалистичен, 3D-мультфильм пропал.
// Поэтому явно: что стиль может менять, а что — никогда.
export const STYLIZATION_LIMITS = 'Likeness and art style together — both are required: every person is clearly a character of this art style (never a photo-like face) and at the same time instantly recognizable as the real person. The style MAY change only the rendering: smooth skin without pores, hair simplified into sculpted or painted clumps, slightly simplified and softened forms, lighting and colors; the eyes may be at most slightly larger than in life. The style must NEVER change: the shape of the face and chin, the eye shape (almond or round, heavy or open lids) and spacing, the eyebrows, the length and shape of the nose, the mouth and the typical smile, ears that stick out, the hairstyle, hair texture and color, moles, freckles, glasses, and the real age.';

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
// face — приметы ребёнка словами (worker/face.js): идут в каждый рисунок, чтобы модель не «додумывала» типовое лицо
const faceLine = (face) => (String(face || '').trim() ? `The child's exact appearance, observed from the photos — follow it precisely: ${String(face).trim()}` : '');

export function buildHeroPrompt({ styleLabel, eyes, brief, look, face, photoCount = 1, withSheet = false, kind = 'scene', people = ONLY_CHILD } = {}) {
  const styleKey = pickStyleKey(styleLabel);
  const scene = String(brief || '').trim()
    || 'The child stands confidently at the story’s key moment, caught in an active, dynamic pose that fits the scene, surrounded by details from the adventure around them.';
  const composition = kind === 'cover' ? COVER_COMPOSITION : kind === 'sheet' ? SHEET_COMPOSITION : COMPOSITION_BLOCK;

  return [
    IDENTITY_BLOCK(eyes, photoCount),
    faceLine(face),
    STYLIZATION_LIMITS,
    withSheet && kind !== 'sheet' ? SHEET_BLOCK : '',
    kind === 'sheet' ? 'Facial expression: a friendly open smile, bright engaged eyes.' : EMOTION_BLOCK,
    kind === 'sheet' ? '' : scene,
    lookLine(look),
    kind === 'sheet' ? '' : OUTFIT_BLOCK,
    kind === 'sheet' ? ONLY_CHILD : people,
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
// ---------------------------------------------------------------- родные по фото
// Решения владелицы 05.10: в «Большой истории» один родной по одному фото — бесплатно, второй и третий — доплата 290 ₽
// (за обоих); в «Сказке» — 290 ₽ за всех (до 3).
// Рисуются только после оплаты: сначала общий лист родных по их фото, потом по нему (и по листу ребёнка) — все сцены.
// В превью — только ребёнок.

export const MAX_FAMILY = 3;
// «Кто это» из анкеты → по-английски для модели. Своё («крёстная», «няня») — как есть, в кавычках, как данные.
const WHO_EN = { мама: 'the mother', папа: 'the father', брат: 'the brother', сестра: 'the sister', бабушка: 'the grandmother', дедушка: 'the grandfather' };
const clipText = (t, n) => String(t || '').replace(/["«»]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** «мама Лена» → «the mother (named "Лена")»; своё — «a person the child calls "няня"». */
export function familyLabel(person = {}) {
  const who = clipText(person.who, 40).toLowerCase();
  const name = clipText(person.name, 40);
  const role = WHO_EN[who] || (who ? `a person the child calls "${who}"` : 'a family member');
  return name ? `${role} (named "${name}")` : role;
}

/** Лист родных: все по их фото, по порядку слева направо — по нему потом рисуются все сцены. */
export function buildFamilySheetPrompt({ family = [], styleLabel } = {}) {
  const n = family.length;
  const list = family.map((p, i) => `photo ${i + 1} shows ${familyLabel(p)}`).join('; ');
  return [
    `The ${n} attached photo${n > 1 ? 's show ' + n + ' different real people' : ' shows a real person'} from the child's family: ${list}.`,
    // крупные портреты сверху (лица!), полный рост снизу — правило владелицы 05.10, см. FACE_FIRST
    `Draw a character reference sheet in two rows. TOP ROW: a large head-and-shoulders portrait of ${n > 1 ? 'each person, in exactly this order from left to right' : 'this person'}, facing the viewer, so every face is big and detailed. BOTTOM ROW: the same ${n > 1 ? 'people standing side by side in full figure, in the same order' : 'person in full figure'}, relaxed friendly pose, gentle smile. The faces in both rows are identical.`,
    FACE_FIRST.replace('the reference photo', 'their own photo'),
    "Preserve each person's exact identity from their own photo: face structure and proportions, eye shape and eye color, nose, lips, hairstyle and hair color, facial hair, glasses, age and body build. Every person must stay instantly recognizable; never merge, average or swap features between people, and do not make them look alike. Adults stay adults of their real age; do not beautify or idealize. Each person's height and body proportions match their real age.",
    // «Амилия» (01.10): по фото ChatGPT рисовал взрослых почти фотографиями — среди мультяшных детей это выглядит чужим
    'Everyone, the adults too, is a stylized cartoon character in exactly the same art style as the child in this book — never photorealistic, never like a photo: simplified smooth sculpted features and smooth stylized hair; only the likeness comes from the photos, not the realism.',
    STYLIZATION_LIMITS,
    'Clothing: the everyday outfit from their photo, simplified into clean shapes.',
    `Art style and rendering technique: ${STYLE_TECHNIQUE[pickStyleKey(styleLabel)]}.`,
    'Composition: plain warm off-white background, evenly lit, no scenery. No text, no names, no labels.',
    AVOID_BLOCK
  ].join(' ');
}

// К сцене: лист родного идёт перед листом ребёнка (тот — всегда последний, см. SHEET_BLOCK)
const FAMILY_PEOPLE = (family, last) => `People: the ${last ? 'last' : 'second-to-last'} attached image is the family reference sheet: it shows, from left to right, ${family.map(familyLabel).join(', ')}. Whenever any of these people appear in the scene, draw them exactly as on that sheet — the same face, hairstyle, build and look, the height and proportions of their real age — and keep them clearly different people from each other and from the child. Do not add them unless the scene description includes them. No other humans besides the child and these family members: no friends, other children or passers-by; pets, animals, toys and magical creatures are fine.`;

/**
 * Что передать модели: образцы и промпт. null — рисовать не по чему.
 * refs — фото ребёнка (у 'family' — фото родного), sheet — лист персонажа, source — картинка для раскраски;
 * family — родной из анкеты [{ who, name }], familySheet — его лист. Формат картинок любой ({ mime, data } или { mime, bytes }).
 */
/**
 * Запрос к рисующей модели. fix — замечание проверки похожести (worker/likeness.js) к прошлой попытке: дописывается
 * в конец промпта, чтобы перерисовка исправила именно лица, не уходя в реализм (07.10: обложка Алекса стала похожей,
 * но перестала быть 3D-мультфильмом).
 */
export function imageRequest({ fix = '', ...options } = {}) {
  const request = baseRequest(options);
  if (!request || !fix || options.kind === 'coloring') return request;
  return { ...request, prompt: `${request.prompt} LIKENESS CORRECTION — the previous attempt did not look enough like the real people in the references; fix exactly this: ${fix} Keep the same stylized art style as the rest of the book: likeness comes from face shape, eyes, nose, mouth and hair — never make the face realistic or photographic.` };
}

function baseRequest({ refs = [], sheet = null, source = null, kind = 'scene', styleLabel, eyes, brief, look, face, family = [], familySheet = null } = {}) {
  if (kind === 'coloring') return source ? { images: [source], prompt: buildColoringPrompt() } : null;
  if (kind === 'family') return refs.length && family.length ? { images: refs.slice(0, MAX_FAMILY), prompt: buildFamilySheetPrompt({ family: family.slice(0, refs.length), styleLabel }) } : null;
  // перерисовка после генерации: фото ребёнка уже удалено, лицо и одежду держит лист персонажа
  if (!refs.length && !sheet) return null;
  const withFamily = Boolean(familySheet && family.length) && kind !== 'sheet';
  const withSheet = Boolean(sheet) && kind !== 'sheet';
  const images = [...refs, ...(withFamily ? [familySheet] : []), ...(withSheet ? [sheet] : [])];
  const people = withFamily ? FAMILY_PEOPLE(family, !withSheet) : ONLY_CHILD;
  const prompt = refs.length
    ? buildHeroPrompt({ styleLabel, eyes, brief, look, face, photoCount: refs.length, withSheet, kind, people })
    : buildHeroPrompt({ styleLabel, eyes, brief, look, face, withSheet: true, kind, people }).replace(/reference photo/g, 'character reference sheet');
  return { images, prompt };
}
