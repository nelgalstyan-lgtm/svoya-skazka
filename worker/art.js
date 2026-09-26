// Иллюстрации в Worker'е: OpenAI gpt-image (основной) → Gemini (запасной). Промпты — те же, что на старом сервере
// (server/lib/illustrate.js). Картинки — байтами { mime, bytes }, без data:URL.
//
// Дорогое для процессора место — сама картинка в ответе. Поэтому OpenAI отдаёт WebP (~0,4 МБ вместо PNG ~4 МБ),
// а base64 вырезается из ответа без разбора всего JSON. Проба 26.09: 4–5 мс CPU на картинку против 18 мс у PNG.

import { imageRequest } from '../server/lib/illustrate.js';
import { fromBase64, toBase64, jsonStringField } from './bytes.js';

const OPENAI_SIZE = { scene: '1024x1536', cover: '1024x1536', coloring: '1024x1536', sheet: '1536x1024' };
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
        // «no credits» — не временная ошибка, повторять бессмысленно
        error.temporary = res.status >= 500 || (res.status === 429 && !/credit|quota|billing/i.test(msg));
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
export async function drawImage(env, { kind = 'scene', refs = [], sheet = null, source = null, styleLabel, eyes, brief, look, log = console.warn } = {}) {
  const request = imageRequest({ refs, sheet, source, kind, styleLabel, eyes, brief, look });
  if (!request) return null;
  const timeoutMs = Number(env.IMAGE_TIMEOUT_MS || 180_000);
  for (const provider of providers(env)) {
    try {
      return await provider.call({ ...request, kind, timeoutMs, retries: 1 });
    } catch (error) {
      log(`[art] ${kind} image failed via ${provider.name}: ${error?.message || error}`);
    }
  }
  return null;
}
