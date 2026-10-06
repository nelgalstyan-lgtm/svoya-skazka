// Проверка похожести (правило владелицы 07.10: «все персонажи должны быть максимально похожи на себя — проверять
// на всех заказах, прежде чем книга попадёт к клиенту»). Сайт обещает книгу через несколько минут после оплаты,
// поэтому проверяет не человек, а GPT-5.4-mini с картинкой (запасной — Gemini): сравнивает нарисованное с фото
// (фото уже нет — с листом персонажа) и ставит оценку 1–10 ребёнку и каждому родному на картинке.
// Ниже LIKENESS_MIN — картинка перерисовывается с замечаниями проверяющего (book.js), из двух вариантов берётся
// более похожий; итог — job.likeness, а письмо владелице после дорисовки (notify.js) называет слабые картинки.
// Любой сбой проверки — null: книга рисуется как раньше, в письме картинка помечается «не проверена».

import { toBase64 } from './bytes.js';

export const LIKENESS_MIN = 7;

const PROMPT = (who) => 'You are a strict quality checker for a personalised children\'s book. IMAGE 1 is an illustration. '
  + 'The other images are REFERENCES of the real people (photos, or an approved character sheet). '
  + `People to check: ${who}. `
  + 'For each person who appears in IMAGE 1, compare their FACE with the references and score likeness from 1 to 10: '
  + '10 — parents would instantly recognise them; 8 — clearly the same person, small differences; 7 — recognisable; '
  + '5 — similar type but could be someone else; 1–3 — a different person. Judge face shape, eyes, eyebrows, nose, mouth, hair '
  + '(colour, texture, length, hairstyle), skin tone and distinctive features; ignore the art style, clothes, pose and background. '
  + 'Style matters too: if a face looks photorealistic, like a photo pasted into the illustration instead of matching its art style, give that person at most 6 and say in "fix" that the face must be re-rendered in the art style of the illustration while keeping its features. '
  + 'A person who is not in IMAGE 1 gets null. '
  + 'Then write "fix": one or two short sentences in English telling the illustrator exactly what to change in the faces to make them '
  + 'look like the references (empty string if every score is 8 or more). '
  + 'Answer strictly as JSON: {"scores": {"<person>": number or null}, "fix": "..."}';

/** Кого проверять: ребёнок + родные по фото (как они названы в анкете). */
function people(childName, family) {
  return [{ key: 'child', label: `the child${childName ? ` (${childName})` : ''}` }, ...family.map((p, i) => ({ key: `family-${i}`, label: [p.who, p.name].filter(Boolean).join(' ') || `relative ${i + 1}` }))];
}

function parse(text, list) {
  try {
    const data = JSON.parse(String(text || '').replace(/^```(?:json)?|```$/g, '').trim());
    const raw = data?.scores || {};
    const values = Object.values(raw);
    const scores = {};
    // модель может назвать людей по-своему — берём по ключу, а если ключей столько же, сколько людей, — по порядку
    list.forEach((p, i) => {
      const v = p.key in raw ? raw[p.key] : p.label in raw ? raw[p.label] : values.length === list.length ? values[i] : undefined;
      scores[p.key] = typeof v === 'number' && v >= 1 && v <= 10 ? Math.round(v) : null;
    });
    if (Object.values(scores).every((v) => v === null)) return null;
    const present = Object.values(scores).filter((v) => v !== null);
    return { score: Math.min(...present), scores, fix: typeof data.fix === 'string' ? data.fix.slice(0, 400).trim() : '' };
  } catch { return null; }
}

const dataUrl = (im) => `data:${im.mime || 'image/webp'};base64,${toBase64(im.bytes)}`;

async function askOpenAI(env, prompt, images, timeoutMs) {
  if (!env.OPENAI_API_KEY) return null;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.OPENAI_VISION_MODEL || 'gpt-5.4-mini',
      reasoning_effort: 'low',
      max_completion_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...images.map((im) => ({ type: 'image_url', image_url: { url: dataUrl(im), detail: 'high' } }))] }]
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  return (await res.json())?.choices?.[0]?.message?.content;
}

async function askGemini(env, prompt, images, timeoutMs) {
  if (!env.GEMINI_API_KEY) return null;
  const model = String(env.GEMINI_VISION_MODELS || 'gemini-3.6-flash').split(',').map((m) => m.trim()).filter(Boolean).pop();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, ...images.map((im) => ({ inlineData: { mimeType: im.mime || 'image/webp', data: toBase64(im.bytes) } }))] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  return ((await res.json())?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(' ');
}

/**
 * Насколько похожи люди на картинке → { score, scores: { child, 'family-0', … }, fix } или null (не проверено).
 * image — нарисованная картинка; refs — фото ребёнка (или [лист персонажа]); familyRefs — фото родных (или [лист родных]).
 * childName, family — из анкеты; family пустой — родных не проверяем.
 */
export async function checkLikeness(env, { image, refs = [], familyRefs = [], childName = '', family = [], childless = false }, { log = console.warn, timeoutMs = 60_000 } = {}) {
  if (!image?.bytes || (!refs.length && !familyRefs.length)) return null;
  const list = people(childName, familyRefs.length ? family : []).filter((p) => !(childless && p.key === 'child'));
  if (!list.length) return null;
  const who = list.map((p) => `"${p.key}" = ${p.label}`).join('; ');
  const prompt = PROMPT(who) + (refs.length && familyRefs.length ? ' The references go in this order: the child first, then the relatives.' : '');
  const images = [image, ...refs.slice(0, 2), ...familyRefs.slice(0, 3)];
  for (const ask of [askOpenAI, askGemini]) {
    try {
      const result = parse(await ask(env, prompt, images, timeoutMs), list);
      if (result) return result;
    } catch (error) {
      log(`[likeness] ${error?.message || error}`);
    }
  }
  return null;
}

