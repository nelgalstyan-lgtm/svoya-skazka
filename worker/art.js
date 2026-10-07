// Иллюстрации в Worker'е: OpenAI gpt-image (основной) → Gemini (запасной). Промпты — те же, что на старом сервере
// (server/lib/illustrate.js). Картинки — байтами { mime, bytes }, без data:URL.
//
// Дорогое для процессора место — сама картинка в ответе. Поэтому OpenAI отдаёт WebP (~0,4 МБ вместо PNG ~4 МБ),
// а base64 вырезается из ответа без разбора всего JSON. Проба 26.09: 4–5 мс CPU на картинку против 18 мс у PNG.

import { imageRequest } from '../server/lib/illustrate.js';
import { fromBase64, toBase64, jsonStringField } from './bytes.js';

const OPENAI_SIZE = { scene: '1024x1536', cover: '1024x1536', coloring: '1024x1536', sheet: '1536x1024', family: '1536x1024' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function errorMessage(bytes, status) {
  try { return JSON.parse(new TextDecoder().decode(bytes)).error?.message || `HTTP ${status}`; } catch { return `HTTP ${status}`; }
}

async function withRetries(retries, delayMs, call) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      const temporary = error.temporary || /timed? ?out|aborted|fetch failed|network/i.test(error?.message || '');
      if (!temporary || attempt >= retries) throw error;
      await sleep(delayMs * (attempt + 1));
    }
  }
}

async function callOpenAI(env, { images, prompt, kind, timeoutMs, retries }) {
  // input_fidelity=high лучше держит лицо; если модель параметр не знает — повторяем без него
  let fidelity = (env.OPENAI_INPUT_FIDELITY || 'high') === 'high';
  return withRetries(retries, 2000, async () => {
    while (true) {
      const form = new FormData();
      form.append('model', env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5'); // сравнили с gpt-image-2: чистая акварель без «мозаики», вдвое быстрее
      form.append('prompt', prompt);
      images.forEach((im, i) => form.append('image[]', new Blob([im.bytes], { type: im.mime }), `ref-${i + 1}.${im.mime.split('/')[1]}`));
      form.append('size', OPENAI_SIZE[kind] || OPENAI_SIZE.scene);
      form.append('quality', env.OPENAI_IMAGE_QUALITY || 'medium');
      form.append('output_format', 'webp');
      form.append('output_compression', String(env.OPENAI_IMAGE_COMPRESSION || 85));
      if (fidelity) form.append('input_fidelity', 'high');

      const res = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(timeoutMs)
      });
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!res.ok) {
        const msg = errorMessage(bytes, res.status);
        if (res.status === 400 && fidelity && /input_fidelity/i.test(msg)) { fidelity = false; continue; }
        const error = new Error(`OpenAI ${res.status}: ${msg}`);
        // «no credits» и жёсткий лимит расходов — не временная ошибка, повторять бессмысленно
        error.noMoney = res.status === 429 && /credit|quota|billing|spend.?limit/i.test(msg);
        error.temporary = res.status >= 500 || (res.status === 429 && !error.noMoney);
        throw error;
      }
      const b64 = jsonStringField(bytes, 'b64_json');
      if (!b64) throw new Error('no image in OpenAI response');
      return { mime: 'image/webp', bytes: fromBase64(b64) };
    }
  });
}

async function callGemini(env, { images, prompt, timeoutMs, retries }) {
  const model = env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  return withRetries(retries, 1500, async () => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, ...images.map((im) => ({ inlineData: { mimeType: im.mime, data: toBase64(im.bytes) } }))] }] }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!res.ok) {
      const error = new Error(`Gemini ${res.status}: ${errorMessage(bytes, res.status)}`);
      error.temporary = res.status >= 500 || res.status === 429;
      throw error;
    }
    const data = jsonStringField(bytes, 'data');
    if (!data) throw new Error('no image in Gemini response');
    return { mime: jsonStringField(bytes, 'mimeType') || 'image/png', bytes: fromBase64(data) };
  });
}

/** Сервисы по порядку: IMAGE_PROVIDER=gemini ставит Gemini первым. */
function providers(env) {
  const list = [];
  if (env.OPENAI_API_KEY) list.push({ name: 'openai', call: (o) => callOpenAI(env, o) });
  if (env.GEMINI_API_KEY) list.push({ name: 'gemini', call: (o) => callGemini(env, o) });
  if (env.IMAGE_PROVIDER === 'gemini') list.reverse();
  return list;
}

/**
 * Одна иллюстрация → { mime, bytes } или null. НИКОГДА не бросает: не нарисовалась — книга обойдётся без неё.
 * kind: 'sheet' | 'cover' | 'scene' | 'coloring'; refs — фото ребёнка, sheet — лист персонажа, source — картинка для раскраски.
 */
export async function drawImage(env, { kind = 'scene', refs = [], sheet = null, source = null, styleLabel, eyes, brief, look, face, age, family = [], familySheet = null, fix = '', log = console.warn } = {}) {
  const request = imageRequest({ refs, sheet, source, kind, styleLabel, eyes, brief, look, face, age, family, familySheet, fix });
  if (!request) return null;
  const timeoutMs = Number(env.IMAGE_TIMEOUT_MS || 180_000);
  for (const provider of providers(env)) {
    try {
      return await provider.call({ ...request, kind, timeoutMs, retries: 1 });
    } catch (error) {
      log(`[art] ${kind} image failed via ${provider.name}: ${error?.message || error}`);
      if (error?.noMoney) await markArtOff(env, error.message, log);
    }
  }
  return null;
}

// ---------------------------------------------------------------- защита «в OpenAI кончились деньги»
// Отметка в R2: пока она стоит, новые превью не принимаются (api.js), а превью, не получившее ни одной картинки,
// заканчивается сообщением, а не книгой без ребёнка (book.js). Раз в час cron проверяет OpenAI и снимает отметку.
export const ART_OFF_KEY = 'system/art-off.json';
export const ART_OFF_MESSAGE = 'Бесплатное превью сейчас недоступно: Героёнок временно не может рисовать иллюстрации. Попробуйте через пару часов — или напишите нам на support@geroenok.online, и мы сделаем превью вручную.';

async function markArtOff(env, reason, log = console.warn) {
  if (!env.BUCKET) return;
  if (await env.BUCKET.get(ART_OFF_KEY)) return;
  await env.BUCKET.put(ART_OFF_KEY, JSON.stringify({ at: Date.now(), reason: String(reason).slice(0, 300) }), { httpMetadata: { contentType: 'application/json' } });
  log(`[art] рисование выключено: ${reason}`);
}

/** Отметка { at, reason } или null. */
export async function artOff(env) {
  const obj = env.BUCKET ? await env.BUCKET.get(ART_OFF_KEY) : null;
  return obj ? obj.json() : null;
}

/** Снова ли есть деньги: самый маленький текстовый запрос (≈ $0,000002). Отказ по деньгам — отметка остаётся. */
export async function recheckArt(env, log = console.log) {
  if (!env.OPENAI_API_KEY || !(await artOff(env))) return null;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
    signal: AbortSignal.timeout(20_000)
  }).catch(() => null);
  if (res?.ok) {
    await env.BUCKET.delete(ART_OFF_KEY);
    log('[art] деньги в OpenAI снова есть — рисование включено');
    return true;
  }
  log(`[art] рисование по-прежнему выключено: OpenAI ${res ? res.status : 'network error'}`);
  return false;
}

/**
 * Где ставить название на обложке — решает Gemini, посмотрев на картинку (бесплатная модель, один короткий запрос).
 * Счёт деталей в браузере не отличал голову героя и аиста (закрывать нельзя) от каменной арки (можно) и в Safari
 * давал другой ответ, чем в Chrome («Амилия», 01.10). Ответ сохраняется в книге: book.coverTitle = { place }.
 * Любая ошибка — 'top' (как раньше).
 */
export async function coverTitlePlace(env, image, { timeoutMs = 20000 } = {}) {
  if (!image?.bytes) return 'top';
  // строки названия сверху лежат примерно на 7–30% высоты (в две строки — ниже), снизу — на 60–78%; полосы берём с запасом:
  // у «Люсечки» (05.10) лицо начиналось сразу под полосой 7–24%, а название в две строки задевало голову
  const prompt = 'Look at this children’s book cover illustration. Answer two questions about two horizontal bands of the image. '
    + 'Band A: from 5% to 34% of the image height, measured from the top edge. Band B: from 58% to 80% of the image height. '
    + 'For each band: does it contain any face or head (of a person or an animal, including birds), even partly? '
    + 'Answer strictly as JSON: {"A": true or false, "B": true or false}.';
  // два проверяющих (решение владелицы 05.10: на обложке «Люсечки» название легло на голову героини):
  // вниз — если лицо вверху видит больше проверяющих, чем внизу (Gemini там «видел» лицо и внизу, OpenAI — нет)
  const answers = (await Promise.all([askGemini(env, image, prompt, timeoutMs), askOpenAI(env, image, prompt, timeoutMs)])).filter(Boolean);
  const top = answers.filter((x) => x.a).length, bottom = answers.filter((x) => x.b).length;
  return top > bottom ? 'bottom' : 'top';
}

/**
 * Где на обложке лицо героя → { x, y, h } (центр и высота лица, доли от ширины/высоты) или null.
 * Портрет в сертификате вырезается из обложки; раньше — по одному месту для всех («лицо на 43% высоты»), и в пробном
 * заказе 08.10 лицо Алекса было выше — в круг попали подбородок и футболка. Gemini умеет находить объекты (box_2d).
 */
export async function coverFaceBox(env, image, { timeoutMs = 20000 } = {}) {
  if (!image?.bytes || !env.GEMINI_API_KEY) return null;
  const prompt = 'Find the face of the main child in this children’s book cover illustration (the face only: from the top of the forehead or hairline to the chin, ear to ear). '
    + 'Answer strictly as JSON: {"box_2d": [ymin, xmin, ymax, xmax]} with coordinates normalized to 0-1000. If there is no child face, answer {"box_2d": null}.';
  const models = String(env.GEMINI_VISION_MODELS || 'gemini-3.5-flash-lite,gemini-3.6-flash').split(',').map((m) => m.trim()).filter(Boolean);
  for (const model of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: image.mime || 'image/webp', data: toBase64(image.bytes) } }] }], generationConfig: { maxOutputTokens: 200, temperature: 0, responseMimeType: 'application/json' } }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!res.ok) continue;
      const data = await res.json();
      const box = parseFaceBox((data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(' '));
      if (box !== undefined) return box;
    } catch { /* следующая модель */ }
  }
  return null;
}

/** '{"box_2d":[ymin,xmin,ymax,xmax]}' (0–1000) → { x, y, h } долями; null — лица нет; undefined — ответ не разобрать. */
export function parseFaceBox(text) {
  let box;
  try { box = JSON.parse(String(text || '').replace(/^```(?:json)?|```$/g, '').trim())?.box_2d; } catch { return undefined; }
  if (box === null) return null;
  if (!Array.isArray(box) || box.length !== 4 || !box.every((v) => Number.isFinite(v))) return undefined;
  const [y0, x0, y1, x1] = box.map((v) => Math.min(1000, Math.max(0, v)) / 1000);
  if (y1 - y0 < 0.03 || x1 - x0 < 0.02) return undefined;
  const r = (v) => Math.round(v * 1000) / 1000;
  return { x: r((x0 + x1) / 2), y: r((y0 + y1) / 2), h: r(y1 - y0) };
}

function parseBands(text) {
  const t = String(text || '').toLowerCase();
  const a = /"a"\s*:\s*(true|false)/.exec(t), b = /"b"\s*:\s*(true|false)/.exec(t);
  return a && b ? { a: a[1] === 'true', b: b[1] === 'true' } : null;
}

async function askGemini(env, image, prompt, timeoutMs) {
  if (!env.GEMINI_API_KEY) return null;
  const models = String(env.GEMINI_VISION_MODELS || 'gemini-3.5-flash-lite,gemini-3.6-flash').split(',').map((m) => m.trim()).filter(Boolean);
  for (const model of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: image.mime || 'image/webp', data: toBase64(image.bytes) } }] }], generationConfig: { maxOutputTokens: 40, temperature: 0, responseMimeType: 'application/json' } }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!res.ok) continue;
      const data = await res.json();
      const bands = parseBands((data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(' '));
      if (bands) return bands;
    } catch { /* следующая модель */ }
  }
  return null;
}

// вторая проверка — GPT-5.4-mini с картинкой (≈ $0,0015 за обложку)
async function askOpenAI(env, image, prompt, timeoutMs) {
  if (!env.OPENAI_API_KEY) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.OPENAI_VISION_MODEL || 'gpt-5.4-mini',
        reasoning_effort: 'low',
        max_completion_tokens: 600,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:${image.mime || 'image/webp'};base64,${toBase64(image.bytes)}`, detail: 'low' } }] }]
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return parseBands(data?.choices?.[0]?.message?.content);
  } catch { return null; }
}
