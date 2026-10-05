// Приметы ребёнка по фото (правило владелицы 05.10: «главный герой должен быть похож — иначе остальное не важно»).
// Перед рисованием GPT-5.4-mini смотрит на фото и записывает точные приметы словами: форма лица, глаза, брови, нос,
// тип и цвет волос, причёска, особенности. Эти приметы идут в КАЖДЫЙ рисунок — лист героя, обложку, страницы,
// перерисовку — во всех стилях и темах. Рисующей модели фото тоже передаётся; слова не дают ей «додумать» типовое лицо
// (у Аделины без них выходили кудри и круглое кукольное лицо). Любой сбой — без примет, книга рисуется как раньше.

import { toBase64 } from './bytes.js';

const PROMPT = 'You are helping an illustrator draw this child so that parents instantly recognize them. Look ONLY at the child in the photos (ignore other people). '
  + 'Describe the child\'s appearance precisely in English, in one compact paragraph of 60–90 words: face shape (oval / round / heart-shaped, chin), cheeks, '
  + 'skin tone, eye shape, eye size and color, eyebrows, nose, mouth and smile, hair color, hair texture (straight / slightly wavy / wavy / curly — be exact), '
  + 'hair length, parting and how it is usually worn, and any distinctive features (freckles, dimples, moles, gap in teeth, glasses). '
  + 'Then add one short sentence starting with "Avoid:" naming the most likely mistakes an illustrator could make with this face (for example: "making the hair curly", "a round doll face", "eyes too big"). '
  + 'Do not describe clothes or background. Do not guess age, ethnicity or name. Plain text only.';

export async function describeFace(env, photos = [], { log = console.warn, timeoutMs = 45_000 } = {}) {
  if (!env.OPENAI_API_KEY || !photos.length) return '';
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.OPENAI_VISION_MODEL || 'gpt-5.4-mini',
        reasoning_effort: 'low',
        max_completion_tokens: 1200,
        messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, ...photos.slice(0, 3).map((p) => ({ type: 'image_url', image_url: { url: `data:${p.mime || 'image/jpeg'};base64,${toBase64(p.bytes)}`, detail: 'high' } }))] }]
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) { log(`[face] OpenAI ${res.status} — без примет`); return ''; }
    const text = String((await res.json())?.choices?.[0]?.message?.content || '').replace(/\s+/g, ' ').trim();
    // защита: только описание внешности, без инструкций и без мусора
    return /[a-z]/i.test(text) && text.length > 40 ? text.slice(0, 900) : '';
  } catch (error) {
    log(`[face] ${error?.message || error} — без примет`);
    return '';
  }
}
