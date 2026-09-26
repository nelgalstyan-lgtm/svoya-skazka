// Worker без Cloudflare: R2, Workflow и OpenAI заменены простыми подделками.
// Запуск: cd server && npm test (тесты Worker'а идут вместе с остальными).

import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../api.js';
import { runBook } from '../book.js';
import { jsonStringField } from '../bytes.js';

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
      items.set(key, { bytes, httpMetadata: opts.httpMetadata || {}, uploaded: new Date() });
    },
    async list({ prefix }) { return { objects: [...items].filter(([k]) => k.startsWith(prefix)).map(([key, v]) => ({ key, uploaded: v.uploaded })) }; },
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
  return env;
}

// OpenAI images/edits: отвечает маленькой «картинкой» и запоминает запросы
function stubOpenAI({ failKinds = [] } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/images/edits');
    const form = init.body;
    const prompt = form.get('prompt');
    const kind = /coloring page/.test(prompt) ? 'coloring' : /character reference sheet on a plain/.test(prompt) ? 'sheet' : /front cover/.test(prompt) ? 'cover' : 'scene';
    calls.push({ kind, format: form.get('output_format'), images: form.getAll('image[]').length, prompt });
    if (failKinds.includes(kind)) return new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 });
    const b64 = Buffer.from(`img-${calls.length}`).toString('base64');
    return new Response(`{"created":1,"data":[{"b64_json":"${b64}"}],"usage":{}}`, { status: 200 });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
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
    assert.equal(s.result.coloring.length, Math.min(6, pages.length));
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
  env.BOOK_WORKFLOW = { async create() {} }; // Workflow так и не отработал
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

test('неизвестная книга и мусорный адрес — 404', async () => {
  const env = fakeEnv();
  assert.equal((await api(env, '/api/book/00000000-0000-0000-0000-000000000000/status')).status, 404);
  assert.equal((await api(env, '/api/book/../../jobs/status')).status, 404);
  assert.equal((await api(env, '/api/nothing')).status, 404);
});
