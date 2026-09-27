// Песня по книге после оплаты: слова — бесплатный ИИ (server/lib/song.js), музыка — ElevenLabs Music, ≈2 минуты.
// Заказана, если в анкете input.song (в «Большой истории» — всегда, к «Сказке» — опция +290 ₽).
// Нет ключа ELEVENLABS_API_KEY или что-то не вышло — песни просто нет, книга готова и так.
//
// Цена (27.09): $0,15 за минуту на подписке Starter ($6/мес, права на коммерческое использование) → ≈25–30 ₽ за песню.
// Запрос идёт из Workflow, созданного очередью, — как OpenAI (страну покупателя сервису не передаём).
// Ответ — сразу mp3 целиком (≈2–3 МБ): кладём в R2 как есть, без разбора — в 10 мс процессора укладывается.

import { writeSong, musicPrompt, SONG_LENGTH_MS } from '../server/lib/song.js';

const MUSIC_URL = 'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128';
const TEXT_STEP = { retries: { limit: 1, delay: '10 seconds', backoff: 'constant' }, timeout: '5 minutes' };
const MUSIC_STEP = { retries: { limit: 1, delay: '30 seconds', backoff: 'constant' }, timeout: '10 minutes' };
const QUICK_STEP = { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' }, timeout: '1 minute' };
const ATTEMPTS = 3;
const RETRY_MS = 10_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Слова и стиль → mp3 (Uint8Array). Бросает ошибку; temporary — сбой связи или перегрузка, стоит повторить. */
export async function composeMusic(env, prompt) {
  let res;
  try {
    res = await fetch(MUSIC_URL, {
      method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, music_length_ms: Number(env.SONG_LENGTH_MS || SONG_LENGTH_MS), model_id: env.ELEVENLABS_MUSIC_MODEL || 'music_v2' }),
      signal: AbortSignal.timeout(300_000)
    });
  } catch (error) {
    throw Object.assign(new Error(`ElevenLabs: ${error?.cause?.code || error?.message || error}`), { temporary: true });
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 400);
    const error = new Error(`ElevenLabs ${res.status}: ${detail}`);
    error.temporary = res.status >= 500 || res.status === 429;
    throw error;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 1000) throw new Error(`ElevenLabs: no audio (${bytes.length} bytes)`);
  return bytes;
}

export async function songFlow(ctx) {
  const { env, store, id, step, log } = ctx;
  if (!env.ELEVENLABS_API_KEY) return;

  const song = await step.do('song-lyrics', TEXT_STEP, async () => {
    const job = await store.getJob(id);
    if (!job?.paid || job.status !== 'completed' || !job.input?.song) return null;
    const target = job.result.book || job.result;
    if (target.song?.src) return null; // песня уже есть (повторный запуск)
    const s = await writeSong(job.input, job.result, { log });
    return s && { ...s, prompt: musicPrompt(s, job.input) };
  });
  if (!song) return;

  const src = await step.do('song-music', MUSIC_STEP, async () => {
    // сбой связи или перегрузка — повторяем внутри шага; отказ по содержанию (4xx) не повторяем
    for (let attempt = 1; ; attempt += 1) {
      try {
        const mp3 = await composeMusic(env, song.prompt);
        const file = `song-${crypto.randomUUID().slice(0, 8)}.mp3`;
        await store.putMedia(`media/${id}/${file}`, mp3);
        return `/api/media/${id}/${file}`;
      } catch (error) {
        log(`[song] ${id}: attempt ${attempt}: ${error?.message || error}`);
        if (attempt >= ATTEMPTS || !error.temporary) return null;
        await sleep(Number(env.SONG_RETRY_MS ?? RETRY_MS) * attempt); // в тестах SONG_RETRY_MS=0
      }
    }
  });
  if (!src) { log(`[song] ${id}: no music, the book stays without a song`); return; }

  await step.do('song-finish', QUICK_STEP, async () => {
    await store.updateJob(id, (job) => {
      const target = job.result.book || job.result;
      const { prompt, ...keep } = song;
      target.song = { ...keep, src };
    });
    log(`[song] ${id}: «${song.title}» (${song.mood}) ready`);
  });
}
