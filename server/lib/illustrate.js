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

const IDENTITY_BLOCK = (eyes) => `Preserve the child's exact identity from the reference photo: keep the facial structure and proportions, the eye shape and eye color${eyes ? ` (${eyes})` : ''}, the nose shape, the lips and mouth shape, the hairstyle and hair color, the age, and any distinctive features exactly as in the reference photo such as freckles, a gap between the teeth, dimples, moles or birthmarks if present. The child must remain instantly recognizable as the exact same person from the reference photo — do not beautify, idealize, or stylize the face into a generic look, and do not age the character up or down.`;

// Упрощённые стили хуже передают тонкие эмоции — там нужна однозначно дружелюбная формулировка
const EMOTION_SIMPLE = 'Facial expression: a small hint of a curious smile, bright engaged eyes, a friendly and warm expression despite the concentration.';
const EMOTION_DETAILED = 'Facial expression: calm, quietly brave concentration, steady focused eyes, a relaxed determined mouth.';

const COMPOSITION_BLOCK = 'Composition: a single vertical book page illustration, portrait aspect ratio approximately 2:3 like a standard book page, not a wide landscape spread. Frame the child from the waist up or in full figure, whichever suits the action, at a natural eye-level or slightly low heroic angle. The illustration must be completely free of any text, letters, words, or empty space reserved for text overlay — text always lives on a separate neighboring page.';

const AVOID_BLOCK = 'Avoid: photorealistic rendering, extra or malformed fingers, blurry or distorted anatomy, watermarks, signatures, logos, and any text or lettering.';

const STYLE_TECHNIQUE = {
  watercolor: 'traditional watercolor illustration technique, soft visible paper texture, gentle color bleeds and granulation, loose expressive brushstrokes with soft edges, translucent glazes of color, delicate ink linework accents',
  cartoon: 'flat-color cartoon illustration technique for children’s picture books, clean bold outlines, simplified smooth cel-style shading, bright saturated flat color fills, gently rounded rendering',
  classic: 'classic mid-20th-century children’s book illustration technique, gouache and colored-pencil texture, visible hand-drawn cross-hatching and fine linework, a muted warm palette, subtle traditional print paper grain',
  clay3d: 'modern 3D animated feature film style, smooth stylized character rendering with soft rounded proportions, subtle subsurface scattering on the skin, soft global illumination, gentle specular highlights on hair and fabric',
  anime: 'Japanese anime illustration technique, clean crisp linework, cel-shaded flat color blocks with soft gradient accents, painterly anime-style background rendering',
  childDrawing: 'playful naive illustration technique imitating a child’s own drawing, simple bold crayon and marker strokes, charmingly uneven linework, flat bright colors, endearingly imperfect hand-drawn proportions'
};

const SIMPLE_STYLES = new Set(['cartoon', 'anime', 'childDrawing']);

function pickStyleKey(styleLabel) {
  const s = String(styleLabel || '').toLowerCase();
  if (/мультяш|cartoon/.test(s)) return 'cartoon';
  if (/классич|1960|1970|1980/.test(s)) return 'classic';
  if (/3d|пластилин|clay/.test(s)) return 'clay3d';
  if (/аниме|anime/.test(s)) return 'anime';
  if (/ребён|ребен|нарисовал/.test(s)) return 'childDrawing';
  return 'watercolor';
}

/** Собирает полный английский image_prompt по правилам из docs/story-prompt-template.md. */
export function buildHeroPrompt({ styleLabel, eyes, brief } = {}) {
  const styleKey = pickStyleKey(styleLabel);
  const emotion = SIMPLE_STYLES.has(styleKey) ? EMOTION_SIMPLE : EMOTION_DETAILED;
  const scene = String(brief || '').trim()
    || 'The child stands confidently at the story’s key moment, caught in an active, dynamic pose that fits the scene, surrounded by details from the adventure around them.';

  return [
    IDENTITY_BLOCK(eyes),
    emotion,
    scene,
    `Art style and rendering technique: ${STYLE_TECHNIQUE[styleKey]}.`,
    COMPOSITION_BLOCK,
    AVOID_BLOCK
  ].join(' ');
}

/** Фото из анкеты: { mime, data } с data в base64 без префикса "data:...;base64,". */
export function normalizePhoto(photo) {
  if (!photo || typeof photo !== 'object') return null;
  const mime = String(photo.mime || '');
  const data = String(photo.data || '');
  if (!/^image\/(jpeg|png|webp)$/.test(mime) || !data) return null;
  return { mime, data };
}

async function callGemini({ apiKey, model, photo, prompt, timeoutMs, retries }) {
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
              { inlineData: { mimeType: photo.mime, data: photo.data } }
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
 * Генерирует одну геройскую иллюстрацию. НИКОГДА не бросает — при любой ошибке отдаёт null,
 * а книга остаётся с декоративным фоном на этой странице вместо лица ребёнка.
 */
export async function generateHeroImage({
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
  photo,
  styleLabel,
  eyes,
  brief,
  timeoutMs = 30_000,
  retries = 1,
  log = () => {}
} = {}) {
  const safePhoto = normalizePhoto(photo);
  if (!apiKey || !safePhoto) return null;

  const prompt = buildHeroPrompt({ styleLabel, eyes, brief });
  try {
    return await callGemini({ apiKey, model, photo: safePhoto, prompt, timeoutMs, retries });
  } catch (error) {
    log(`[illustrate] hero image failed: ${error?.message || error}`);
    return null;
  }
}
