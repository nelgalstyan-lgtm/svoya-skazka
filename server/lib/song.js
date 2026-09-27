// Песня по книге: слова пишет бесплатный текстовый ИИ по готовой книге, музыку сочиняет ElevenLabs Music (worker/song.js).
//
// Решение владелицы 27.09: настроение, темп и инструменты — под настроение книги. Радостная история — весёлая песня,
// задумчивая (как «Алекс и тайна Ани») — светлая и спокойная; бодрая мелодия с хлопками к ней неуместна.
// Настроение выбирает ИИ по тексту книги: по жанру нельзя (у Алекса жанр «поиски сокровищ», а книга задумчивая).
//
// Строение песни проверено пробой 27.09 (≈2 минуты): куплет, припев, куплет, куплет, припев, финал.
// Ударения в именах сервис ставит верно, если размер стиха ровный и ударный слог имени попадает на сильную долю.

import { buildProviders, generateWithFailover, sharedHealth } from './providers.js';
import { brandMentions, ORIGINALITY_RULE } from './story.js';

export const SONG_MOODS = ['joyful', 'adventure', 'thoughtful', 'lullaby'];
export const SONG_LENGTH_MS = 120_000;

const MOOD_STYLE = {
  joyful: 'Cheerful, bright and playful children\'s pop song. Acoustic guitar, ukulele, glockenspiel, hand claps, light bouncy drums. 112 BPM, major key, catchy sing-along chorus.',
  adventure: 'Uplifting acoustic adventure pop song with a feeling of journey and courage. Acoustic guitar, driving light drums, strings, soft brass swell in the chorus. 106 BPM, major key, anthemic sing-along chorus.',
  thoughtful: 'Warm, reflective acoustic pop song, tender and hopeful, never sad. Acoustic guitar, soft strings, gentle piano, light drums. 100 BPM, major key.',
  lullaby: 'Gentle, cozy lullaby. Music box, soft fingerpicked acoustic guitar, warm pads, no drums. 72 BPM, major key, calm and tender.'
};

const MOOD_RULES = `Настроение песни — такое же, как у книги. Выбери одно:
- "joyful" — весёлая: радостная, смешная, праздничная история;
- "adventure" — приключенческая: бодрая, смелая, история-путешествие или поиск;
- "thoughtful" — задумчивая, светлая: спокойная, вдумчивая история, где герой что-то понимает; не грустная;
- "lullaby" — колыбельная: тихая история на ночь, сон, уют.
Не делай весёлую песню к задумчивой книге и грустную — ни к какой.`;

const clean = (s) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** Текст книги для ИИ: название и сама история (у «Большой истории» — начало каждой главы), не длиннее ~9 тыс. символов. */
export function songSource(result) {
  if (result?.book) {
    const b = result.book;
    const per = Math.max(600, Math.floor(8000 / Math.max(1, b.chapters.length)));
    const chapters = b.chapters.map((c, i) => {
      const text = c.blocks.filter((x) => ['p', 'card', 'scrap', 'note'].includes(x.t)).map((x) => clean(x.text)).join(' ');
      return `Глава ${c.n || i + 1}. ${clean(c.title)}\n${text.slice(0, per)}`;
    });
    return { title: clean(b.title), text: chapters.join('\n\n') };
  }
  const pages = (result?.pages || []).map((p) => clean(p.text)).filter(Boolean);
  return { title: clean(result?.title), text: pages.join('\n').slice(0, 9000) };
}

/** Малышам (0–4) — только весёлая или колыбельная: «задумчивая» становится колыбельной, приключение — весёлой. */
export function moodForAge(mood, age) {
  const a = Number(age);
  if (!Number.isFinite(a) || a <= 0 || a > 4) return mood;
  return mood === 'thoughtful' ? 'lullaby' : mood === 'adventure' ? 'joyful' : mood;
}

export function buildSongPrompt(input, source) {
  const name = clean(input.name) || 'герой';
  const age = Number(input.age);
  const system = [
    'Ты — детский поэт-песенник. Пишешь по-русски слова песни по готовой детской книге.',
    'Отвечаешь только JSON-объектом, без пояснений и без markdown.'
  ].join(' ');
  const user = `Напиши слова песни по книге «${source.title}». Главный герой — ${name}${Number.isFinite(age) && age > 0 ? `, ${age} лет` : ''}.
${clean(input.cast) ? `Близкие и питомцы из анкеты: ${clean(input.cast)}.\n` : ''}
Текст книги:
"""
${source.text}
"""

${MOOD_RULES}

Как писать:
- Три куплета по 4 строки, припев 4 строки, финал 2–4 строки. Строки короткие, 7–9 слогов.
- Ровный размер — хорей (ТА-та ТА-та ТА-та ТА), одинаковый во всех строках, рифма в каждой паре строк или через строку.
- Имя «${name}» — в припеве, и так, чтобы его ударный слог приходился на сильную долю (лучше всего — в начале строки). Если имя длинное или ударение в нём неочевидно, поставь его туда, где размер не ломается.
- Куплеты рассказывают саму книгу: её места, главное событие, питомца или друга, одну-две конкретные детали. Не пересказывай всё — песня должна петься.
- Припев — простой и запоминающийся, с главной мыслью книги.
- Никаких штампов («волшебный мир», «сердце поёт»), никаких нравоучений, никаких слов на других языках и латиницы.
- ${ORIGINALITY_RULE}
- Если книга связана с конкретной страной или культурой, можно предложить один подходящий инструмент или оттенок звучания по-английски в поле "color" (например "Armenian duduk melody in the intro"). Иначе "color" — пустая строка.

Ответ — строго такой JSON:
{"mood": "joyful|adventure|thoughtful|lullaby", "title": "название песни", "color": "", "verses": [["строка", "строка", "строка", "строка"], [...], [...]], "chorus": ["строка", "строка", "строка", "строка"], "outro": ["строка", "строка"]}`;
  return { system, user };
}

function parseJson(raw) {
  const text = String(raw || '').replace(/```(?:json)?/gi, '');
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a === -1 || b <= a) throw new Error('no JSON object in response');
  return JSON.parse(text.slice(a, b + 1));
}

const LATIN = /[a-z]/i;
const FOREIGN = /[　-鿿가-힯]/;

function lines(list, min, max, what) {
  if (!Array.isArray(list) || list.length < min || list.length > max) throw new Error(`${what}: expected ${min}–${max} lines`);
  return list.map((l) => {
    const s = clean(l);
    if (s.length < 3 || s.length > 70) throw new Error(`${what}: bad line length`);
    if (LATIN.test(s) || FOREIGN.test(s)) throw new Error(`${what}: not Russian`);
    return s;
  });
}

/** Имя в припеве — с учётом падежа («Алекс», «Алекса», «Милена», «Милене»). */
function mentionsName(text, name) {
  const n = clean(name).toLowerCase();
  if (!n) return true;
  const stem = n.length > 3 ? n.slice(0, -1) : n;
  return text.toLowerCase().includes(stem);
}

/** Проверяет ответ ИИ и приводит его к виду песни; бросает ошибку, если ответ негодный (тогда пробуем другую модель). */
export function parseSong(raw, input = {}) {
  const data = parseJson(raw);
  if (!SONG_MOODS.includes(data.mood)) throw new Error(`unknown mood: ${data.mood}`);
  if (!Array.isArray(data.verses) || data.verses.length !== 3) throw new Error('expected 3 verses');
  const song = {
    mood: moodForAge(data.mood, input.age),
    title: clean(data.title).slice(0, 60) || 'Песня',
    color: /^[A-Za-z ,.'-]{0,90}$/.test(clean(data.color)) ? clean(data.color) : '',
    verses: data.verses.map((v, i) => lines(v, 4, 4, `verse ${i + 1}`)),
    chorus: lines(data.chorus, 4, 4, 'chorus'),
    outro: lines(data.outro, 2, 4, 'outro')
  };
  if (LATIN.test(song.title)) throw new Error('title: not Russian');
  if (!mentionsName(song.chorus.join(' '), input.name)) throw new Error('chorus without the hero name');
  const brands = brandMentions([song.title, ...song.verses.flat(), ...song.chorus, ...song.outro].join(' '));
  if (brands.length) throw new Error(`brands: ${brands.join(', ')}`);
  return song;
}

/** Порядок исполнения (проверен пробой): куплет, припев, куплет, куплет, припев, финал. */
export function songSections(song) {
  return [
    { label: 'Verse 1', kind: 'verse', lines: song.verses[0] },
    { label: 'Chorus', kind: 'chorus', lines: song.chorus },
    { label: 'Verse 2', kind: 'verse', lines: song.verses[1] },
    { label: 'Verse 3', kind: 'verse', lines: song.verses[2] },
    { label: 'Chorus', kind: 'chorus', lines: song.chorus },
    { label: 'Outro', kind: 'outro', lines: song.outro }
  ];
}

/**
 * Запрос к ElevenLabs Music: описание стиля по-английски (так сервис понимает точнее) и слова с разметкой частей.
 * Голос — по полу героя; колыбельную поёт мягкий женский голос.
 */
export function musicPrompt(song, input = {}) {
  const girl = !/^(мал|boy|male)/i.test(clean(input.gender));
  const vocal = song.mood === 'lullaby' ? 'Soft, tender female vocal' : girl ? 'Warm young female vocal' : 'Warm young male vocal';
  const style = [
    `${MOOD_STYLE[song.mood] || MOOD_STYLE.joyful}`,
    song.color ? `${song.color}.` : '',
    `Song in Russian language. ${vocal}, very clear diction. About 2 minutes. Sing these lyrics exactly as written:`
  ].filter(Boolean).join(' ');
  const lyrics = songSections(song).map((s) => `[${s.label}]\n${s.lines.join('\n')}`).join('\n\n');
  return `${style}\n\n${lyrics}`;
}

/**
 * Слова песни по готовой книге. Возвращает песню или null (ИИ недоступен — песни не будет, книга от этого не страдает).
 * Провайдеры собираются заново при каждом вызове: в Worker'е ключи приходят в process.env из секретов.
 */
export async function writeSong(input, result, {
  providers = buildProviders(process.env),
  deadlineMs = 90_000,
  attemptTimeoutMs = 40_000,
  health = sharedHealth,
  log = console.warn
} = {}) {
  if (!providers.length) { log('[song] no AI providers configured'); return null; }
  try {
    const { value, provider, model } = await generateWithFailover(providers, buildSongPrompt(input, songSource(result)), {
      validate: (raw) => parseSong(raw, input),
      deadlineAt: Date.now() + deadlineMs,
      attemptTimeoutMs,
      health,
      log
    });
    return { ...value, provider, model };
  } catch (error) {
    log(`[song] lyrics failed: ${error?.message || error}`);
    return null;
  }
}
