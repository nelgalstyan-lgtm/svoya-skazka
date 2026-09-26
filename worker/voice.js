// Озвучка книги голосом рассказчика: Yandex SpeechKit, API v3, голос «Ермиль» (им озвучен образец Алекса).
// Озвучиваем только оплаченную книгу, после дорисовки. Нет ключа или сервис не ответил — у книги нет audio,
// и кнопка «Слушать» читает голосом устройства, как раньше.
//
// Каждая глава режется на куски до CHUNK символов, каждый кусок — свой шаг Workflow (10 мс процессора на шаг
// хватает: mp3 приходит base64-строками, вырезаем их без JSON.parse). Потом куски склеиваются в один mp3 на главу:
// mp3 — это поток кадров, простая склейка файлов проигрывается как один файл.
//
// Цена (27.09): 0,1626 ₽ за каждые 250 символов запроса → «Сказка» ≈ 5 ₽, «Большая история» ≈ 10–25 ₽.
// После правки текста переозвучиваются только изменившиеся главы (сверка по хэшу текста).

import { fromBase64 } from './bytes.js';

const CHUNK = 1500;
const CONCURRENCY = 3;
const QUICK_STEP = { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' }, timeout: '1 minute' };
const VOICE_STEP = { retries: { limit: 2, delay: '15 seconds', backoff: 'exponential' }, timeout: '5 minutes' };
const TTS_URL = 'https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis';

// ---------------------------------------------------------------- текст

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const withStop = (s) => (/[.!?…»")]$/.test(s) ? s : `${s}.`);

function dedicationText(d) {
  if (!d) return '';
  return [d.title || 'Посвящается', d.lead, ...(d.paragraphs || []), String(d.signature || '').replace(/\n/g, ' ')]
    .map(clean).filter(Boolean).map(withStop).join('\n');
}

/** Дорожки аудиокниги по порядку: [{ title, text }] — посвящение и главы («Большая история») или вся сказка. */
export function voiceTracks(result) {
  const tracks = [];
  if (result.book) {
    const book = result.book;
    const ded = dedicationText(book.dedication);
    if (ded) tracks.push({ title: 'Посвящение', text: ded });
    book.chapters.forEach((c, i) => {
      const lines = c.blocks.filter((b) => ['p', 'card', 'scrap', 'note'].includes(b.t)).map((b) => clean(b.text)).filter(Boolean);
      const head = withStop(`Глава ${c.n || i + 1}. ${clean(c.title)}`);
      tracks.push({ title: `Глава ${c.n || i + 1}. ${clean(c.title)}`, text: [i === 0 ? withStop(clean(book.title)) : '', head, ...lines].filter(Boolean).join('\n') });
    });
  } else {
    const ded = dedicationText(result.dedication);
    if (ded) tracks.push({ title: 'Посвящение', text: ded });
    const pages = (result.pages || []).map((p) => clean(p.text)).filter(Boolean);
    if (pages.length) tracks.push({ title: clean(result.title) || 'Сказка', text: [withStop(clean(result.title)), ...pages, 'Конец.'].filter(Boolean).join('\n') });
  }
  return tracks;
}

/** Режет текст на куски не длиннее max — по абзацам, длинный абзац — по предложениям. */
export function splitText(text, max = CHUNK) {
  const pieces = [];
  for (const para of String(text).split('\n')) {
    if (para.length <= max) { pieces.push(para); continue; }
    let cur = '';
    for (const s of para.match(/[^.!?…]+[.!?…]+["»)]*\s*|[^.!?…]+$/g) || [para]) {
      if (cur && cur.length + s.length > max) { pieces.push(cur.trim()); cur = ''; }
      cur += s.length > max ? s.slice(0, max) : s;
    }
    if (cur.trim()) pieces.push(cur.trim());
  }
  const chunks = [];
  let cur = '';
  for (const p of pieces) {
    if (cur && cur.length + 1 + p.length > max) { chunks.push(cur); cur = ''; }
    cur = cur ? `${cur}\n${p}` : p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** Короткий хэш текста (FNV-1a) — чтобы после правки переозвучить только изменившиеся главы. */
export function textHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------- SpeechKit

/** Все base64-куски аудио из построчного JSON ответа ({"result":{"audioChunk":{"data":"…"}}} на строку) — без JSON.parse. */
function audioChunks(bytes) {
  const marker = new TextEncoder().encode('"data":"');
  const out = [];
  let from = 0;
  while (true) {
    let i = bytes.indexOf(marker[0], from);
    while (i >= 0 && !marker.every((b, k) => bytes[i + k] === b)) i = bytes.indexOf(marker[0], i + 1);
    if (i < 0) break;
    const start = i + marker.length;
    const end = bytes.indexOf(0x22, start);
    if (end < 0) break;
    out.push(fromBase64(new TextDecoder().decode(bytes.subarray(start, end))));
    from = end + 1;
  }
  return out;
}

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** Текст → mp3 (Uint8Array). Бросает ошибку, если сервис ответил ошибкой или без звука. */
export async function synthesize(env, text) {
  const hints = [{ voice: env.YANDEX_TTS_VOICE || 'ermil' }];
  if (env.YANDEX_TTS_ROLE) hints.push({ role: env.YANDEX_TTS_ROLE });
  if (env.YANDEX_TTS_SPEED) hints.push({ speed: String(env.YANDEX_TTS_SPEED) });
  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: { Authorization: `Api-Key ${env.YANDEX_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text, hints, outputAudioSpec: { containerAudio: { containerAudioType: 'MP3' } }, unsafeMode: true }),
    signal: AbortSignal.timeout(120_000)
  });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!res.ok) throw new Error(`SpeechKit ${res.status}: ${new TextDecoder().decode(bytes.subarray(0, 300))}`);
  const audio = concat(audioChunks(bytes));
  if (!audio.length) throw new Error(`SpeechKit: no audio (${new TextDecoder().decode(bytes.subarray(0, 300))})`);
  return audio;
}

// ---------------------------------------------------------------- шаги Workflow

export async function voiceFlow(ctx) {
  const { env, store, id, step, log } = ctx;
  if (!env.YANDEX_API_KEY) return;

  const plan = await step.do('voice-start', QUICK_STEP, async () => {
    const job = await store.getJob(id);
    if (!job?.paid || job.status !== 'completed') return null;
    const target = job.result.book || job.result;
    const prev = new Map((target.audio || []).map((a) => [a.hash, a.src]));
    return voiceTracks(job.result).map((t) => {
      const hash = textHash(t.text);
      return prev.has(hash) ? { title: t.title, hash, src: prev.get(hash) } : { title: t.title, hash, chunks: splitText(t.text) };
    });
  });
  if (!plan || !plan.length) return;

  const tmp = (t, k) => `voice-tmp/${id}/${t}-${k}.mp3`;
  const jobs = plan.flatMap((t, ti) => (t.chunks || []).map((text, k) => ({ ti, k, text })));
  const done = new Set();
  for (let n = 0; n < jobs.length; n += CONCURRENCY) {
    const batch = jobs.slice(n, n + CONCURRENCY);
    const ok = await Promise.all(batch.map((j) => step.do(`voice-${j.ti}-${j.k}`, VOICE_STEP, async () => {
      try {
        await store.putMedia(tmp(j.ti, j.k), await synthesize(env, j.text));
        return true;
      } catch (error) {
        log(`[voice] ${id}: track ${j.ti} part ${j.k}: ${error?.message || error}`);
        return false;
      }
    })));
    batch.forEach((j, i) => { if (ok[i]) done.add(`${j.ti}-${j.k}`); });
  }

  const srcs = [];
  for (let ti = 0; ti < plan.length; ti++) {
    const t = plan[ti];
    if (t.src) { srcs.push(t.src); continue; }
    const complete = t.chunks.every((_, k) => done.has(`${ti}-${k}`));
    srcs.push(await step.do(`voice-join-${ti}`, QUICK_STEP, async () => {
      const keys = t.chunks.map((_, k) => tmp(ti, k));
      const src = complete ? await store.joinMedia(id, `track-${ti + 1}`, keys) : null;
      await store.removeMedia(keys);
      return src;
    }));
  }

  await step.do('voice-finish', QUICK_STEP, async () => {
    if (srcs.some((s) => !s)) { log(`[voice] ${id}: not all tracks voiced, keeping the device voice`); return; }
    let stale = [];
    await store.updateJob(id, (job) => {
      const target = job.result.book || job.result;
      stale = (target.audio || []).map((a) => a.src).filter((s) => !srcs.includes(s));
      target.audio = plan.map((t, i) => ({ title: t.title, src: srcs[i], hash: t.hash }));
    });
    await store.removeMedia(stale.map((s) => store.mediaKey(s)).filter(Boolean));
    log(`[voice] ${id}: ${plan.length} track(s), ${jobs.reduce((n, j) => n + j.text.length, 0)} chars voiced`);
  });
}
