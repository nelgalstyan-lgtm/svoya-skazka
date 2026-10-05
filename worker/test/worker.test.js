// Worker без Cloudflare: R2, Workflow и OpenAI заменены простыми подделками.
// Запуск: cd server && npm test (тесты Worker'а идут вместе с остальными).

import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi, PREVIEW_LIMITS, UPLOAD_CHUNK_BYTES } from '../api.js';
import { runBook, spreadPick } from '../book.js';
import { jsonStringField } from '../bytes.js';
import { queueHandler } from '../queue.js';
import { splitText, voiceTracks } from '../voice.js';
import { removeExpiredBooks, KEEP_MS } from '../cleanup.js';
import { createStore } from '../store.js';
import { recheckArt, ART_OFF_KEY } from '../art.js';

const worker = { queue: queueHandler };

// ---------------------------------------------------------------- подделки

function fakeBucket() {
  const items = new Map();
  const wrap = (key, v) => ({
    key,
    body: new Blob([v.bytes]).stream(),
    httpMetadata: v.httpMetadata,
    httpEtag: '"e"',
    json: async () => JSON.parse(new TextDecoder().decode(v.bytes)),
    arrayBuffer: async () => v.bytes.slice().buffer
  });
  return {
    items,
    async get(key) { const v = items.get(key); return v ? wrap(key, v) : null; },
    async put(key, value, opts = {}) {
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
      items.set(key, { bytes, httpMetadata: opts.httpMetadata || {}, customMetadata: opts.customMetadata, uploaded: new Date() });
    },
    async list({ prefix, include = [] }) {
      const objects = [...items].filter(([k]) => k.startsWith(prefix)).map(([key, v]) => ({ key, uploaded: v.uploaded, ...(include.includes('customMetadata') ? { customMetadata: v.customMetadata || {} } : {}) }));
      return { objects, truncated: false };
    },
    async delete(keys) { for (const k of [].concat(keys)) items.delete(k); },
    keys(prefix) { return [...items.keys()].filter((k) => k.startsWith(prefix)); }
  };
}

/** Шаги Workflow выполняются сразу; имена шагов должны быть уникальны (как требует Cloudflare). */
function fakeStep() {
  const names = new Set();
  return {
    names,
    async do(name, config, fn) {
      assert.ok(!names.has(name), `повтор имени шага: ${name}`);
      names.add(name);
      return JSON.parse(JSON.stringify((await fn()) ?? null)); // результат шага сериализуется, как в Cloudflare
    }
  };
}

function fakeEnv(extra = {}) {
  const env = {
    BUCKET: fakeBucket(),
    OPENAI_API_KEY: 'test-key',
    ADMIN_KEY: 'admin',
    runs: [],
    ...extra
  };
  env.BOOK_WORKFLOW = {
    async create({ id, params }) {
      const step = fakeStep();
      env.runs.push({ id, params, step });
      await runBook(env, params, step, { log: () => {} });
    }
  };
  // очередь сразу передаёт сообщение обработчику из index.js — как Cloudflare, только без задержки
  env.START_QUEUE = {
    async send(body) {
      const msg = { body, ack() { this.acked = true; }, retry() { this.retried = true; } };
      await worker.queue({ messages: [msg] }, env);
      assert.ok(msg.acked, 'сообщение очереди должно быть подтверждено');
    }
  };
  return env;
}

// OpenAI images/edits: отвечает маленькой «картинкой» и запоминает запросы
function stubOpenAI({ failKinds = [], failOnce = [] } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/images/edits');
    const form = init.body;
    const prompt = form.get('prompt');
    const kind = /coloring page/.test(prompt) ? 'coloring' : /character reference sheet on a plain/.test(prompt) ? 'sheet' : /front cover/.test(prompt) ? 'cover' : 'scene';
    calls.push({ kind, format: form.get('output_format'), images: form.getAll('image[]').length, prompt });
    if (failKinds.includes(kind)) return new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 });
    const once = failOnce.indexOf(kind);
    if (once >= 0) { failOnce.splice(once, 1); return new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 }); }
    const b64 = Buffer.from(`img-${calls.length}`).toString('base64');
    return new Response(`{"created":1,"data":[{"b64_json":"${b64}"}],"usage":{}}`, { status: 200 });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

// Yandex SpeechKit v3: построчный JSON с кусками mp3 в base64 (ставится поверх stubOpenAI)
function stubYandex({ fail = false, dropOnce = 0 } = {}) {
  const calls = [];
  const sent = []; // что реально вернули (без оборванных запросов)
  const inner = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('https://tts.api.cloud.yandex.net/')) return inner(url, init);
    const body = JSON.parse(init.body);
    calls.push({ auth: init.headers.Authorization, text: body.text, voice: body.hints[0].voice, role: body.hints.find((h) => h.role)?.role });
    if (dropOnce > 0) { dropOnce -= 1; throw new TypeError('fetch failed'); } // обрыв связи
    if (fail) return new Response('{"error":"quota"}', { status: 429 });
    const line = (s) => `{"result":{"audioChunk":{"data":"${Buffer.from(s).toString('base64')}"},"textChunk":{"text":"\\"data\\""}}}`;
    sent.push(`A${calls.length}B${calls.length}`);
    return new Response(`${line(`A${calls.length}`)}
${line(`B${calls.length}`)}
`, { status: 200 });
  };
  return { calls, sent, restore: () => { globalThis.fetch = inner; } };
}

const PHOTO = `data:image/jpeg;base64,${Buffer.from('photo-bytes').toString('base64')}`;
const FORM = { name: 'Милена', age: '7', gender: 'Девочка', eyes: 'Карие', theme: 'Приключения', habits: 'Обожает собирать камни', friends: 'Тигран', cast: 'мама Лена, кот Барсик', style: 'Акварель' };

const api = (env, path, { method = 'GET', body, headers = {} } = {}) =>
  handleApi(new Request(`https://geroenok.online${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }), env);

async function order(env, extra = {}) {
  const res = await api(env, '/api/book/generate', { method: 'POST', body: { ...FORM, photos: [PHOTO], ...extra } });
  const data = await res.json();
  assert.equal(res.status, 200, JSON.stringify(data));
  return data.jobId;
}

const status = async (env, id) => (await api(env, `/api/book/${id}/status`)).json();

test('новая анкета: фото файлами (multipart)', async () => {
  const env = fakeEnv();
  const ai = stubOpenAI();
  try {
    const form = new FormData();
    form.append('answers', JSON.stringify({ ...FORM, tariff: '' }));
    form.append('photo', new Blob([Buffer.from('photo-bytes')], { type: 'image/jpeg' }), 'photo-1');
    form.append('photo', new Blob(['not an image'], { type: 'text/plain' }), 'x.txt');
    const res = await handleApi(new Request('https://geroenok.online/api/book/generate', { method: 'POST', body: form }), env);
    const data = await res.json();
    assert.equal(res.status, 200, JSON.stringify(data));
    assert.deepEqual(env.BUCKET.keys('photos/'), [`photos/${data.jobId}/0`]);
    assert.equal(new TextDecoder().decode(env.BUCKET.items.get(`photos/${data.jobId}/0`).bytes), 'photo-bytes');
    assert.equal((await status(env, data.jobId)).status, 'completed');

    const empty = new FormData();
    empty.append('answers', JSON.stringify(FORM));
    assert.equal((await handleApi(new Request('https://geroenok.online/api/book/generate', { method: 'POST', body: empty }), env)).status, 400);
  } finally { ai.restore(); }
});

test('анкета: фото кусками (шлюз Яндекса не пропускает тяжёлые запросы)', async () => {
  const env = fakeEnv();
  const ai = stubOpenAI();
  try {
    const upload = '0f8b7c1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b';
    const photo = Buffer.alloc(UPLOAD_CHUNK_BYTES * 2 + 100, 7);
    const put = (p, c, bytes) => handleApi(new Request(`https://geroenok.online/api/upload/${upload}/${p}/${c}`, { method: 'POST', body: bytes }), env);
    for (let c = 0; c < 3; c++) assert.equal((await put(0, c, photo.subarray(c * UPLOAD_CHUNK_BYTES, (c + 1) * UPLOAD_CHUNK_BYTES))).status, 200);
    assert.equal((await put(0, 4, Buffer.alloc(UPLOAD_CHUNK_BYTES + 1))).status, 400, 'кусок больше лимита');
    assert.equal((await put(9, 0, Buffer.from('x'))).status, 404, 'номер фото вне лимита');
    assert.equal((await handleApi(new Request(`https://geroenok.online/api/upload/../0/0`, { method: 'POST', body: 'x' }), env)).status, 404);

    const orderWith = (parts) => {
      const form = new FormData();
      form.append('answers', JSON.stringify(FORM));
      form.append('upload', upload);
      form.append('photoParts', JSON.stringify(parts));
      return handleApi(new Request('https://geroenok.online/api/book/generate', { method: 'POST', body: form }), env);
    };
    const missing = await orderWith([{ type: 'image/jpeg', n: 4 }]);
    assert.equal(missing.status, 400, 'не хватает куска');
    assert.match((await missing.json()).error, /не догрузились/);

    const res = await orderWith([{ type: 'image/jpeg', n: 3 }]);
    const data = await res.json();
    assert.equal(res.status, 200, JSON.stringify(data));
    assert.deepEqual(Buffer.from(env.BUCKET.items.get(`photos/${data.jobId}/0`).bytes), photo);
    assert.deepEqual(env.BUCKET.keys(`photos/up-${upload}/`), [], 'куски удалены после заказа');
  } finally { ai.restore(); }
});

// без ключей ИИ текст берётся из шаблона — так тесты не ходят в сеть за текстом
for (const key of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'CEREBRAS_API_KEY', 'OPENAI_API_KEY']) delete process.env[key];

// ---------------------------------------------------------------- тесты

test('bytes: base64 картинки вырезается из ответа без разбора всего JSON', () => {
  const bytes = new TextEncoder().encode('{"data":[{"b64_json" : "QUJD\\/RA=="}]}');
  assert.equal(jsonStringField(bytes, 'b64_json'), 'QUJD/RA==');
  assert.equal(jsonStringField(bytes, 'nope'), null);
});

test('без фото заказ не принимается', async () => {
  const env = fakeEnv();
  const res = await api(env, '/api/book/generate', { method: 'POST', body: FORM });
  assert.equal(res.status, 400);
  assert.equal(env.runs.length, 0);
});

test('превью «Сказки»: лист персонажа, обложка и первая страница — в R2, в книге только ссылки', async () => {
  const env = fakeEnv();
  const ai = stubOpenAI();
  try {
    const id = await order(env);
    assert.deepEqual(ai.calls.map((c) => c.kind).sort(), ['cover', 'scene', 'sheet']);
    assert.ok(ai.calls.every((c) => c.format === 'webp'));
    // обложка и сцена рисуются по фото + листу персонажа
    assert.ok(ai.calls.filter((c) => c.kind !== 'sheet').every((c) => c.images === 2));

    const s = await status(env, id);
    assert.equal(s.status, 'completed');
    assert.equal(s.result.locked, true);
    assert.equal(s.result.pages.length, 2);
    assert.match(s.result.cover, /^\/api\/img\/[a-f0-9-]{36}\/cover-[a-z0-9]+\.webp$/);
    assert.match(s.result.pages[0].heroImage, /^\/api\/img\//);
    assert.equal(s.result.pages[1].heroImage, undefined);
    assert.equal(s.result.sheet, undefined); // лист персонажа клиенту не отдаём
    assert.equal(env.BUCKET.keys('photos/').length, 1); // фото ждут оплаты
    const job = JSON.parse(new TextDecoder().decode(env.BUCKET.items.get(`jobs/${id}.json`).bytes));
    assert.ok(!JSON.stringify(job).includes('base64'), 'в книге не должно быть картинок и фото внутри');
  } finally { ai.restore(); }
});

test('картинки отдаются из R2, фото — никогда', async () => {
  const env = fakeEnv();
  const ai = stubOpenAI();
  try {
    const id = await order(env);
    const cover = (await status(env, id)).result.cover;
    const res = await api(env, cover);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/webp');
    assert.match(res.headers.get('cache-control'), /immutable/);
    assert.equal((await api(env, `/api/img/${id}/0`)).status, 404);
    assert.equal((await api(env, `/api/img/${id}/..%2Fphotos%2F0.webp`)).status, 404);
  } finally { ai.restore(); }
});

test('оплата: дорисовываются остальные страницы и раскраска, фото удаляются', async () => {
  const env = fakeEnv();
  const ai = stubOpenAI();
  try {
    const id = await order(env, { coloring: true });
    assert.equal(ai.calls.length, 3);
    assert.equal((await api(env, `/api/book/${id}/unlock`, { method: 'POST', headers: { 'x-admin-key': 'wrong' } })).status, 403);
    const res = await api(env, `/api/book/${id}/unlock`, { method: 'POST', headers: { 'x-admin-key': 'admin' } });
    assert.equal(res.status, 200);

    const s = await status(env, id);
    assert.equal(s.paid, true);
    assert.equal(s.finishing, false);
    const pages = s.result.pages;
    assert.ok(pages.length >= 4);
    assert.ok(pages.every((p) => /^\/api\/img\//.test(p.heroImage)), 'все страницы нарисованы');
    // новый лист персонажа не рисуем: дорисовка идёт по готовому
    assert.equal(ai.calls.filter((c) => c.kind === 'sheet').length, 1);
    assert.equal(s.result.coloring.length, Math.min(3, pages.length));
    assert.equal(env.BUCKET.keys('photos/').length, 0);
    // повторная оплата ничего не запускает
    await api(env, `/api/book/${id}/unlock`, { method: 'POST', headers: { 'x-admin-key': 'admin' } });
    assert.equal(env.runs.length, 2);
  } finally { ai.restore(); }
});

test('«Большая история»: превью с одной иллюстрацией, после оплаты неудавшаяся иллюстрация убирается', async () => {
  const env = fakeEnv();
  const ai = stubOpenAI();
  try {
    const id = await order(env, { tariff: 'big' });
    let s = await status(env, id);
    assert.equal(s.result.kind, 'book');
    assert.equal(s.result.book.chapters.length, 1);
    assert.ok(s.result.lockedChapters.length >= 1);
    assert.match(s.result.book.cover, /^\/api\/img\//);

    ai.restore();
    const ai2 = stubOpenAI({ failKinds: ['scene'] });
    try {
      await api(env, `/api/book/${id}/unlock`, { method: 'POST', headers: { 'x-admin-key': 'admin' } });
      s = await status(env, id);
      const images = s.result.book.chapters.flatMap((c) => c.blocks.filter((b) => b.t === 'image'));
      assert.equal(images.length, 1, 'осталась только нарисованная в превью');
      assert.ok(images.every((b) => /^\/api\/img\//.test(b.src)));
    } finally { ai2.restore(); }
  } finally { ai.restore(); }
});

test('перерисовка — только после оплаты, по листу персонажа, не больше трёх', async () => {
  const env = fakeEnv();
  const ai = stubOpenAI();
  try {
    const id = await order(env);
    assert.equal((await api(env, `/api/book/${id}/redraw`, { method: 'POST', body: { index: 0 } })).status, 402);
    await api(env, `/api/book/${id}/unlock`, { method: 'POST', headers: { 'x-admin-key': 'admin' } });
    const before = (await status(env, id)).result.pages[1].heroImage;
    const res = await api(env, `/api/book/${id}/redraw`, { method: 'POST', body: { index: 1, wish: 'пусть улыбается' } });
    const data = await res.json();
    assert.equal(res.status, 200, JSON.stringify(data));
    assert.equal(data.left, 2);
    assert.notEqual(data.src, before);
    assert.equal((await status(env, id)).result.pages[1].heroImage, data.src);
    const last = ai.calls[ai.calls.length - 1];
    assert.equal(last.images, 1); // фото уже удалены — рисуем по листу персонажа
    assert.match(last.prompt, /пусть улыбается/);
  } finally { ai.restore(); }
});

test('правка текста — только после оплаты', async () => {
  const env = fakeEnv();
  const ai = stubOpenAI();
  try {
    const id = await order(env);
    assert.equal((await api(env, `/api/book/${id}/edit`, { method: 'POST', body: { edits: [{ page: 0, text: 'Новый текст' }] } })).status, 402);
    await api(env, `/api/book/${id}/unlock`, { method: 'POST', headers: { 'x-admin-key': 'admin' } });
    const res = await api(env, `/api/book/${id}/edit`, { method: 'POST', body: { edits: [{ page: 0, text: '<b>Новый</b> текст' }] } });
    assert.equal((await res.json()).applied, 1);
    assert.equal((await status(env, id)).result.pages[0].text, 'Новый текст');
  } finally { ai.restore(); }
});

test('не нарисовалось с первого раза — вторая попытка отдельным шагом', async () => {
  const env = fakeEnv();
  const ai = stubOpenAI({ failOnce: ['cover'] });
  try {
    const id = await order(env);
    assert.equal(ai.calls.filter((c) => c.kind === 'cover').length, 2);
    assert.ok(env.runs[0].step.names.has('cover-retry'));
    assert.match((await status(env, id)).result.cover, /^\/api\/img\//);
  } finally { ai.restore(); }
});

test('картинки не рисуются вовсе — книга всё равно готова', async () => {
  const env = fakeEnv();
  const ai = stubOpenAI({ failKinds: ['sheet', 'cover', 'scene'] });
  try {
    const id = await order(env);
    const s = await status(env, id);
    assert.equal(s.status, 'completed');
    assert.equal(s.result.cover, null);
    assert.ok(s.result.pages[0].text.length > 50);
  } finally { ai.restore(); }
});

test('зависшая книга: через 15 минут клиент получает книгу из шаблона', async () => {
  const env = fakeEnv();
  env.START_QUEUE = { async send() {} }; // книга так и не запустилась
  const id = await order(env);
  assert.equal((await status(env, id)).status, 'queued');
  const key = `jobs/${id}.json`;
  const job = JSON.parse(new TextDecoder().decode(env.BUCKET.items.get(key).bytes));
  job.createdAt -= 16 * 60_000;
  await env.BUCKET.put(key, JSON.stringify(job));
  const s = await status(env, id);
  assert.equal(s.status, 'completed');
  assert.equal(s.result.pages.length, 2); // превью: остальное — после оплаты
  assert.ok(s.result.lockedPages >= 2);
});

test('лимит бесплатных превью: 3 в день с браузера, 10 с адреса; хозяйке — без лимита', async () => {
  const env = fakeEnv();
  const ai = stubOpenAI();
  try {
    const send = (device, ip = '1.1.1.1', headers = {}) => api(env, '/api/book/generate', { method: 'POST', body: { ...FORM, photos: [PHOTO], device }, headers: { 'cf-connecting-ip': ip, ...headers } });
    const devA = 'aaaaaaaa-0000-4000-8000-000000000001';
    for (let i = 0; i < PREVIEW_LIMITS.device; i++) assert.equal((await send(devA)).status, 200);
    const denied = await send(devA);
    assert.equal(denied.status, 429);
    assert.match((await denied.json()).error, /дневной лимит/);
    assert.equal((await send(devA, '1.1.1.1', { 'x-admin-key': 'admin' })).status, 200, 'хозяйка проверяет без лимита');

    // другой браузер в той же сети — можно, пока не кончится лимит адреса
    let n = PREVIEW_LIMITS.device;
    for (let d = 2; n < PREVIEW_LIMITS.ip; d++) {
      const dev = `aaaaaaaa-0000-4000-8000-00000000000${d}`;
      for (let i = 0; i < PREVIEW_LIMITS.device && n < PREVIEW_LIMITS.ip; i++, n++) assert.equal((await send(dev)).status, 200);
    }
    assert.equal((await send('bbbbbbbb-0000-4000-8000-000000000001')).status, 429, 'адрес исчерпал лимит');
    assert.equal((await send('bbbbbbbb-0000-4000-8000-000000000001', '2.2.2.2')).status, 200, 'другой адрес — можно');
    // адрес и браузер хранятся только хэшем
    assert.ok(env.BUCKET.keys('limits/').every((k) => !k.includes('1.1.1.1') && !k.includes('aaaaaaaa')));
  } finally { ai.restore(); }
});

test('медиа из R2: целиком и кусками (Range → 206), чужие пути — 404', async () => {
  const env = fakeEnv();
  const data = new Uint8Array(100).map((_, i) => i);
  env.BUCKET.get = async (key, opts = {}) => {
    if (key !== 'media/alex-audio/ch1.mp3') return null;
    const range = opts.range?.get?.('range');
    const m = range && /bytes=(\d+)-(\d+)/.exec(range);
    const offset = m ? Number(m[1]) : 0; const length = m ? Number(m[2]) - offset + 1 : 100;
    return { size: 100, httpEtag: '"e"', httpMetadata: { contentType: 'audio/mpeg' }, range: m ? { offset, length } : undefined, body: new Blob([data.slice(offset, offset + length)]).stream() };
  };
  const full = await api(env, '/api/media/alex-audio/ch1.mp3');
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  const part = await api(env, '/api/media/alex-audio/ch1.mp3', { headers: { range: 'bytes=10-19' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 10-19/100');
  assert.equal((await part.arrayBuffer()).byteLength, 10);
  assert.equal((await api(env, '/api/media/..%2Fjobs/x.mp3')).status, 404);
  assert.equal((await api(env, '/api/media/alex-audio/ch1.json')).status, 404);
});

test('посвящение: подпись «С любовью, …» и дата от родителей; своё посвящение — после строки «кому»; без полей у «Сказки» — наши тёплые слова', async () => {
  const env = fakeEnv();
  const ai = stubOpenAI();
  try {
    const plain = await order(env);
    const pd = (await status(env, plain)).result.dedication;
    assert.ok(pd && pd.lead.length > 5 && pd.paragraphs.length === 2, 'анкета обещает: пустое поле — тёплые слова пишем мы');
    assert.equal(pd.signature, undefined, 'без «От кого» — без подписи');

    const short = await order(env, { from: 'мама и папа', dedication: 'С днём рождения!\n\nМы тебя любим.' });
    const d = (await status(env, short)).result.dedication;
    assert.equal(d.signature, 'С любовью,\nмама и папа');
    assert.match(d.date, /^\d{2}\.\d{2}\.\d{4}$/);
    assert.match(d.lead, /^Милене — /, 'первая строка «Посвящается» — кому; слова родителей без имени — после неё');
    assert.deepEqual(d.paragraphs, ['С днём рождения!', 'Мы тебя любим.']);

    const big = await order(env, { tariff: 'big', from: 'твоя Неля' });
    const bd = (await status(env, big)).result.book.dedication;
    assert.equal(bd.signature, 'С любовью,\nтвоя Неля');
    assert.ok(bd.lead.length > 5, 'текст посвящения — от ИИ или шаблона');
  } finally { ai.restore(); }
});

test('неизвестная книга и мусорный адрес — 404', async () => {
  const env = fakeEnv();
  assert.equal((await api(env, '/api/book/00000000-0000-0000-0000-000000000000/status')).status, 404);
  assert.equal((await api(env, '/api/book/../../jobs/status')).status, 404);
  assert.equal((await api(env, '/api/nothing')).status, 404);
});

test('озвучка: текст режется на куски по абзацам и предложениям, не длиннее предела', () => {
  const long = 'Первое предложение тут. '.repeat(40) + '\nКороткий абзац.';
  const chunks = splitText(long, 300);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every((c) => c.length <= 300), 'каждый кусок в пределе');
  assert.equal(chunks.join(' ').replace(/\s+/g, ' ').length, long.replace(/\s+/g, ' ').trim().length);
  const tracks = voiceTracks({ book: { title: 'Т', dedication: { lead: 'Тебе', paragraphs: ['Абзац'], signature: 'С любовью,\nмама' }, chapters: [{ n: 1, title: 'Начало', blocks: [{ t: 'p', text: 'Раз' }, { t: 'image', caption: 'картинка' }, { t: 'note', text: 'Вывод' }] }] } });
  assert.deepEqual(tracks.map((t) => t.title), ['Посвящение', 'Глава 1. Начало']);
  assert.ok(!tracks[1].text.includes('картинка'), 'подписи к картинкам не читаем');
});

test('озвучка после оплаты: главы голосом Ермиля в R2, книга отдаёт их; без ключа — голос устройства', async () => {
  const env = fakeEnv({ YANDEX_API_KEY: 'ya-key', VOICE_RETRY_MS: 0 });
  const ai = stubOpenAI();
  const ya = stubYandex({ dropOnce: 1 }); // первый запрос обрывается — кусок повторяется
  try {
    const id = await order(env, { coloring: true });
    assert.equal(ya.calls.length, 0, 'превью не озвучиваем');
    await api(env, `/api/book/${id}/unlock`, { method: 'POST', headers: { 'x-admin-key': 'admin' } });
    assert.ok(ya.calls.length >= 1);
    assert.ok(ya.calls.every((c) => c.auth === 'Api-Key ya-key' && c.voice === 'ermil' && c.text.length <= 1500));
    assert.ok(ya.calls.every((c) => c.role === 'good'), '«Сказка» — радостная интонация');
    const s = await status(env, id);
    assert.equal(s.result.audio.length, 2, 'сказка — посвящение и вся сказка одной дорожкой');
    assert.equal(s.result.audio[0].title, 'Посвящение');
    const src = s.result.audio[1].src;
    assert.match(src, /^\/api\/media\/[a-f0-9-]{36}\/track-2-[a-f0-9]{8}\.mp3$/);
    // дорожки озвучиваются параллельно: каждый кусок попал ровно в одну дорожку целиком (A и B одного ответа подряд)
    const mp3 = (await (await api(env, s.result.audio[0].src)).text()) + (await (await api(env, src)).text());
    assert.deepEqual(mp3.split(/(?=A\d)/).sort(), [...ya.sent].sort(), 'куски склеены, оборванный кусок повторён');
    assert.equal(ya.calls.length, ya.sent.length + 1);
    assert.equal(env.BUCKET.keys('voice-tmp/').length, 0, 'временные куски удалены');

    // правка текста — переозвучивается только изменившееся, старый файл удаляется
    const before = ya.calls.length;
    await api(env, `/api/book/${id}/edit`, { method: 'POST', body: { edits: [{ page: 0, text: 'Совсем новый текст первой страницы' }] } });
    assert.ok(ya.calls.length > before);
    const s2 = await status(env, id);
    assert.notEqual(s2.result.audio[1].src, src);
    assert.equal(s2.result.audio[0].src, s.result.audio[0].src, 'посвящение не менялось — не переозвучиваем');
    assert.equal(env.BUCKET.keys('media/').length, 2);

    // без ключа — никакой озвучки
    const env2 = fakeEnv();
    const id2 = await order(env2);
    const n = ya.calls.length;
    await api(env2, `/api/book/${id2}/unlock`, { method: 'POST', headers: { 'x-admin-key': 'admin' } });
    assert.equal(ya.calls.length, n);
    assert.deepEqual((await status(env2, id2)).result.audio, []);
  } finally { ya.restore(); ai.restore(); }
});

test('озвучка не удалась — книга готова, «Слушать» остаётся голосом устройства', async () => {
  const env = fakeEnv({ YANDEX_API_KEY: 'ya-key', VOICE_RETRY_MS: 0 });
  const ai = stubOpenAI();
  const ya = stubYandex({ fail: true });
  env.VOICE_RETRY_MS = 0;
  try {
    const id = await order(env, { tariff: 'big' });
    await api(env, `/api/book/${id}/unlock`, { method: 'POST', headers: { 'x-admin-key': 'admin' } });
    const s = await status(env, id);
    assert.equal(s.paid, true);
    assert.ok(!s.result.book.audio || s.result.book.audio.length === 0);
    assert.ok(ya.calls.length && ya.calls.every((c) => c.role === 'neutral'), '«Большая история» — обычная интонация');
    assert.equal(env.BUCKET.keys('voice-tmp/').length + env.BUCKET.keys('media/').length, 0);
  } finally { ya.restore(); ai.restore(); }
});

// ---------------------------------------------------------------- песня по книге

import { GOOD_SONG } from '../../server/test/song-fixture.js';

// Текстовый ИИ (Groq) пишет слова песни, ElevenLabs отдаёт mp3 (ставится поверх stubOpenAI)
function stubSong({ status = 200, lyrics = { ...GOOD_SONG, chorus: ['Милена, ты не сдавайся,', 'Если снова всё не так —', 'Начинай опять сначала,', 'Так советует нам Макс!'] } } = {}) {
  const calls = { text: 0, music: [] };
  const inner = globalThis.fetch;
  const key = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'groq-key';
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://api.groq.com/')) {
      const body = JSON.parse(init.body);
      if (!/слова песни/.test(body.messages[1].content)) return new Response('{"error":"not a song"}', { status: 400 });
      calls.text += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(lyrics) } }] }), { status: 200 });
    }
    if (u.startsWith('https://api.elevenlabs.io/')) {
      calls.music.push({ url: u, key: init.headers['xi-api-key'], body: JSON.parse(init.body) });
      if (status !== 200) return new Response('{"detail":{"status":"bad_prompt"}}', { status });
      return new Response(new Uint8Array(4000).fill(7), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    }
    return inner(url, init);
  };
  return { calls, restore: () => { globalThis.fetch = inner; if (key === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = key; } };
}

test('песня: заказана к «Сказке» — после оплаты слова от ИИ, музыка ElevenLabs в R2; цена превью +290', async () => {
  const env = fakeEnv({ ELEVENLABS_API_KEY: 'el-key', SONG_RETRY_MS: 0 });
  const ai = stubOpenAI();
  const sg = stubSong();
  try {
    const id = await order(env, { song: true });
    assert.equal(sg.calls.music.length, 0, 'до оплаты песню не делаем');
    assert.equal((await status(env, id)).result.price, 690 + 290);
    await api(env, `/api/book/${id}/unlock`, { method: 'POST', headers: { 'x-admin-key': 'admin' } });
    assert.equal(sg.calls.music.length, 1);
    const call = sg.calls.music[0];
    assert.equal(call.key, 'el-key');
    assert.match(call.url, /\/v1\/music\?output_format=mp3/);
    assert.equal(call.body.music_length_ms, 120000);
    assert.match(call.body.prompt, /\[Chorus\]\nМилена, ты не сдавайся/);
    const s = await status(env, id);
    const song = s.result.song;
    assert.match(song.src, /^\/api\/media\/[a-f0-9-]{36}\/song-[a-f0-9]{8}\.mp3$/);
    assert.equal(song.mood, 'thoughtful');
    assert.equal(song.chorus[0], 'Милена, ты не сдавайся,');
    assert.ok(!('prompt' in song));
    assert.equal((await (await api(env, song.src)).arrayBuffer()).byteLength, 4000);
  } finally { sg.restore(); ai.restore(); }
});

test('песня: «Большая история» — входит; «Сказка» без песни и без ключа — ни одного запроса; отказ сервиса — книга готова', async () => {
  const ai = stubOpenAI();
  const sg = stubSong({ status: 422 });
  try {
    const env = fakeEnv({ ELEVENLABS_API_KEY: 'el-key', SONG_RETRY_MS: 0 });
    const big = await order(env, { tariff: 'big' });
    await api(env, `/api/book/${big}/unlock`, { method: 'POST', headers: { 'x-admin-key': 'admin' } });
    assert.equal(sg.calls.music.length, 1, 'в «Большую историю» песня входит; 422 не повторяем');
    const s = await status(env, big);
    assert.equal(s.paid, true);
    assert.ok(!s.result.book.song, 'песни нет, книга готова');
    assert.equal(env.BUCKET.keys(`media/${big}/`).length, 0);

    const short = await order(env);
    await api(env, `/api/book/${short}/unlock`, { method: 'POST', headers: { 'x-admin-key': 'admin' } });
    assert.equal(sg.calls.music.length, 1, 'песню к «Сказке» не заказывали');

    const env2 = fakeEnv();
    const id2 = await order(env2, { song: true });
    await api(env2, `/api/book/${id2}/unlock`, { method: 'POST', headers: { 'x-admin-key': 'admin' } });
    assert.equal(sg.calls.music.length, 1, 'без ключа ElevenLabs — ни одного запроса');
    assert.equal((await status(env2, id2)).result.song, null);
  } finally { sg.restore(); ai.restore(); }
});

// ---------------------------------------------------------------- удаление через год

async function bookWithFiles(env, id, createdAt) {
  const store = createStore(env.BUCKET);
  await store.saveJob({ id, status: 'completed', createdAt, input: { name: 'Аня' }, result: { title: 'Книга' } });
  for (const key of [`img/${id}/cover-1.webp`, `img/${id}/scene-0-2.webp`, `media/${id}/track-0-3.mp3`, `media/${id}/song-4.mp3`, `photos/${id}/0`]) await env.BUCKET.put(key, 'x');
}

test('через год книга удаляется целиком, свежие книги и аудиокнига-образец остаются', async () => {
  const env = fakeEnv();
  const now = Date.now();
  const oldId = '11111111-1111-4111-8111-111111111111';
  const newId = '22222222-2222-4222-8222-222222222222';
  await bookWithFiles(env, oldId, now - KEEP_MS - 60_000);
  await bookWithFiles(env, newId, now - KEEP_MS + 24 * 60 * 60_000);
  await env.BUCKET.put('media/alex-audio/ch1.mp3', 'x');

  const removed = await removeExpiredBooks(env, { now, log: () => {} });
  assert.deepEqual(removed, [oldId]);
  for (const prefix of [`jobs/${oldId}`, `img/${oldId}/`, `media/${oldId}/`, `photos/${oldId}/`]) assert.deepEqual(env.BUCKET.keys(prefix), [], prefix);
  assert.equal(env.BUCKET.keys(`img/${newId}/`).length, 2);
  assert.ok(env.BUCKET.items.has(`jobs/${newId}.json`));
  assert.ok(env.BUCKET.items.has('media/alex-audio/ch1.mp3'));
});

test('книга без даты в метаданных (сохранена до этой правки) — срок по дате последнего сохранения', async () => {
  const env = fakeEnv();
  const id = '33333333-3333-4333-8333-333333333333';
  await env.BUCKET.put(`jobs/${id}.json`, JSON.stringify({ id, createdAt: 1 }));
  assert.deepEqual(await removeExpiredBooks(env, { now: Date.now(), log: () => {} }), [], 'только что сохранена — не трогаем');
  assert.deepEqual(await removeExpiredBooks(env, { now: Date.now() + KEEP_MS + 60_000, log: () => {} }), [id]);
});

test('удалить книгу раньше срока по просьбе заказчика — только с ключом хозяйки', async () => {
  const env = fakeEnv();
  const id = '44444444-4444-4444-8444-444444444444';
  await bookWithFiles(env, id, Date.now());
  const call = (key) => handleApi(new Request(`https://x/api/book/${id}/delete`, { method: 'POST', headers: key ? { 'x-admin-key': key } : {} }), env);
  assert.equal((await call()).status, 403);
  assert.equal((await call('wrong')).status, 403);
  const r = await call('admin');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).files, 6);
  assert.deepEqual([...env.BUCKET.items.keys()].filter((k) => k.includes(id)), []);
  assert.equal((await call('admin')).status, 404);
});

test('книга в 3D получает 3D-оформление рамок, акварельная — нет', async () => {
  const { jobView } = await import('../view.js');
  const job = (style) => ({ id: 'x', status: 'completed', paid: true, createdAt: 0, input: { style, tariff: 'big' }, result: { book: { title: 'К', frame: 'elves', footer: 'elves', genre: 'newyear_elves', chapters: [{ n: 1, title: 'Г', blocks: [{ t: 'p', text: 'Текст.' }] }] } } });
  assert.equal(jobView(job('3D-мультфильм')).result.book.art, '3d');
  assert.equal(jobView(job('animated3d')).result.book.art, '3d');
  assert.equal(jobView(job('Акварель')).result.book.art, undefined);
});

test('адрес посетителя через шлюз Яндекса: x-real-remote-address — только вместе с секретом шлюза', async () => {
  const { clientIp } = await import('../api.js');
  const req = (h) => new Request('https://geroenok.online/api/health', { headers: { 'cf-connecting-ip': '178.154.1.1', ...h } });
  const env = { PROXY_SECRET: 's3cret' };
  assert.equal(clientIp(req({ 'x-real-remote-address': '93.1.2.3', 'x-geroenok-proxy': 's3cret' }), env), '93.1.2.3');
  assert.equal(clientIp(req({ 'x-real-remote-address': '93.1.2.3', 'x-geroenok-proxy': 'wrong' }), env), '178.154.1.1');
  assert.equal(clientIp(req({ 'x-real-remote-address': '93.1.2.3' }), {}), '178.154.1.1');
  assert.equal(clientIp(req({}), env), '178.154.1.1');
});

test('раскраска — 3 страницы из начала, середины и конца книги', () => {
  assert.deepEqual(spreadPick([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3), [1, 6, 10]);
  assert.deepEqual(spreadPick([1, 2, 3, 4, 5, 6, 7, 8], 3), [1, 5, 8]);
  assert.deepEqual(spreadPick([1, 2], 3), [1, 2]);
});

test('название на обложке: вниз, только если вверху лицо, а внизу нет (ответ Gemini)', async () => {
  const { coverTitlePlace } = await import('../art.js');
  const real = globalThis.fetch;
  const answer = (text) => { globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 }); };
  const image = { mime: 'image/webp', bytes: new Uint8Array([1, 2, 3]) };
  try {
    answer('{"A": true, "B": false}'); assert.equal(await coverTitlePlace({ GEMINI_API_KEY: 'k' }, image), 'bottom');
    answer('{"A": true, "B": true}'); assert.equal(await coverTitlePlace({ GEMINI_API_KEY: 'k' }, image), 'top');
    answer('{"A": false, "B": false}'); assert.equal(await coverTitlePlace({ GEMINI_API_KEY: 'k' }, image), 'top');
    assert.equal(await coverTitlePlace({}, image), 'top', 'без ключа — как раньше');
    // вторая проверка: Gemini лица вверху не увидел, OpenAI увидел — название вниз
    globalThis.fetch = async (url) => String(url).includes('openai.com')
      ? new Response(JSON.stringify({ choices: [{ message: { content: '{"A": true, "B": false}' } }] }), { status: 200 })
      : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"A": false, "B": false}' }] } }] }), { status: 200 });
    assert.equal(await coverTitlePlace({ GEMINI_API_KEY: 'k', OPENAI_API_KEY: 'o' }, image), 'bottom');
    globalThis.fetch = async (url) => String(url).includes('openai.com') ? new Response('busy', { status: 503 })
      : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"A": true, "B": false}' }] } }] }), { status: 200 });
    assert.equal(await coverTitlePlace({ GEMINI_API_KEY: 'k', OPENAI_API_KEY: 'o' }, image), 'bottom', 'один проверяющий не ответил — решает другой');
  } finally { globalThis.fetch = real; }
});

test('в OpenAI кончились деньги: превью без картинок не отдаём, новые не принимаем, cron включает рисование обратно', async () => {
  const env = fakeEnv();
  const original = globalThis.fetch;
  let money = false;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/chat/completions')) return new Response(money ? '{"choices":[]}' : '{"error":{"message":"You have no credits remaining."}}', { status: money ? 200 : 429 });
    return new Response(JSON.stringify({ error: { message: 'You have no credits remaining. Add credits to continue.' } }), { status: 429 });
  };
  try {
    const id = await order(env);
    const st = await status(env, id);
    assert.equal(st.status, 'failed');
    assert.ok(st.failed && /недоступно/.test(st.error), 'вместо книги без картинок — сообщение');
    assert.ok(env.BUCKET.items.has(ART_OFF_KEY), 'отметка «рисование выключено»');

    const again = await api(env, '/api/book/generate', { method: 'POST', body: { ...FORM, photos: [PHOTO], device: 'device-0000000000000001' } });
    assert.equal(again.status, 503);
    assert.match((await again.json()).error, /недоступно/);
    const owner = await api(env, '/api/book/generate', { method: 'POST', body: { ...FORM, photos: [PHOTO] }, headers: { 'x-admin-key': 'admin' } });
    assert.equal(owner.status, 200, 'хозяйке можно — для проверки');

    assert.equal(await recheckArt(env, () => {}), false);
    assert.ok(env.BUCKET.items.has(ART_OFF_KEY));
    money = true;
    assert.equal(await recheckArt(env, () => {}), true);
    assert.ok(!env.BUCKET.items.has(ART_OFF_KEY), 'деньги появились — отметка снята');
  } finally { globalThis.fetch = original; }
});

test('возраст в анкете — от 2 до 16', async () => {
  const env = fakeEnv();
  for (const age of ['30', '0', '1', '17', '7.5', 'абв']) {
    const res = await api(env, '/api/book/generate', { method: 'POST', body: { ...FORM, age, photos: [PHOTO] } });
    assert.equal(res.status, 400, `возраст ${age}`);
    assert.match((await res.json()).error, /от 2 до 16/);
  }
});

test('родные по фото: в превью — только ребёнок, после оплаты лист родных и все сцены по нему; 2-й и 3-й — +290 ₽', async () => {
  const env = fakeEnv();
  const ai = stubOpenAI();
  try {
    const send = (answers, familyFiles = 1) => {
      const form = new FormData();
      form.append('answers', JSON.stringify(answers));
      form.append('photo', new Blob([Buffer.from('child')], { type: 'image/jpeg' }), 'p');
      for (let i = 0; i < familyFiles; i++) form.append('family', new Blob([Buffer.from(`relative-${i}`)], { type: 'image/jpeg' }), `f${i}`);
      return handleApi(new Request('https://geroenok.online/api/book/generate', { method: 'POST', body: form }), env);
    };
    const mom = [{ who: 'мама', name: 'Лена' }];
    // без согласия — не принимаем; в «Сказке» родные — +290 ₽ за всех
    assert.equal((await send({ ...FORM, tariff: 'big', familyPhotos: true, family: mom })).status, 400);
    const short = await (await send({ ...FORM, familyPhotos: true, family: mom, familyConsent: true })).json();
    assert.deepEqual(env.BUCKET.keys(`photos/${short.jobId}/f`), [`photos/${short.jobId}/f0`]);
    assert.equal((await status(env, short.jobId)).result.price, 980, '«Сказка» + родные = 690 + 290');
    const mark = ai.calls.length;
    assert.equal((await api(env, `/api/book/${short.jobId}/unlock`, { method: 'POST', headers: { 'x-admin-key': 'admin' } })).status, 200);
    const shortPages = (await status(env, short.jobId)).result.pages.filter((p) => p.hero).length;
    assert.equal(ai.calls.slice(mark).filter((c) => /family reference sheet/.test(c.prompt)).length, shortPages, '«Сказка»: после оплаты все страницы — по листу родных');

    const bigMark = ai.calls.length;
    const { jobId } = await (await send({ ...FORM, tariff: 'big', familyPhotos: true, family: mom, familyConsent: true })).json();
    assert.deepEqual(env.BUCKET.keys(`photos/${jobId}/f`), [`photos/${jobId}/f0`]);
    let st = await status(env, jobId);
    assert.equal(st.result.price, 1490, 'один родной — бесплатно');
    assert.ok(ai.calls.slice(bigMark).every((c) => !/family reference sheet/.test(c.prompt)), 'в превью родных не рисуем');
    assert.ok(ai.calls.slice(bigMark).filter((c) => c.kind === 'scene').every((c) => /only human in the picture/.test(c.prompt)));

    const before = ai.calls.length;
    assert.equal((await api(env, `/api/book/${jobId}/unlock`, { method: 'POST', headers: { 'x-admin-key': 'admin' } })).status, 200);
    const after = ai.calls.slice(before);
    assert.ok(after.some((c) => /from the child's family/.test(c.prompt)), 'после оплаты — лист родных');
    const scenes = after.filter((c) => /family reference sheet/.test(c.prompt));
    const total = (await status(env, jobId)).result.book.chapters.flatMap((ch) => ch.blocks.filter((b) => b.t === 'image')).length;
    assert.equal(scenes.length, total, 'все сцены — по листу родных, и та, что была в превью');
    assert.ok(scenes.every((c) => c.images === 3), 'фото ребёнка + лист родных + лист ребёнка');

    const two = await (await send({ ...FORM, tariff: 'big', familyPhotos: true, family: [...mom, { who: 'папа' }], familyConsent: true }, 2)).json();
    assert.equal((await status(env, two.jobId)).result.price, 1780, 'второй и третий — +290 ₽');
  } finally { ai.restore(); }
});

test('родные по фото приходят кусками (номер после фото ребёнка)', async () => {
  const env = fakeEnv();
  const ai = stubOpenAI();
  try {
    const upload = '1f8b7c1e-2a3d-4e5f-8a9b-0c1d2e3f4a5c';
    const put = (p, c, bytes) => handleApi(new Request(`https://geroenok.online/api/upload/${upload}/${p}/${c}`, { method: 'POST', body: bytes }), env);
    assert.equal((await put(0, 0, Buffer.from('child'))).status, 200);
    assert.equal((await put(3, 0, Buffer.from('mom'))).status, 200, 'номер 3 — первый родной');
    assert.equal((await put(6, 0, Buffer.from('x'))).status, 404, 'больше трёх родных нельзя');
    const form = new FormData();
    form.append('answers', JSON.stringify({ ...FORM, tariff: 'big', familyPhotos: true, family: [{ who: 'мама' }], familyConsent: true }));
    form.append('upload', upload);
    form.append('photoParts', JSON.stringify([{ type: 'image/jpeg', n: 1 }]));
    form.append('familyParts', JSON.stringify([{ type: 'image/jpeg', n: 1 }]));
    const data = await (await handleApi(new Request('https://geroenok.online/api/book/generate', { method: 'POST', body: form }), env)).json();
    assert.ok(data.jobId, JSON.stringify(data));
    assert.equal(new TextDecoder().decode(env.BUCKET.items.get(`photos/${data.jobId}/0`).bytes), 'child');
    assert.equal(new TextDecoder().decode(env.BUCKET.items.get(`photos/${data.jobId}/f0`).bytes), 'mom');
  } finally { ai.restore(); }
});
