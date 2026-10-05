// «Большая история»: до оплаты пишутся план и первая глава, главы 2–6 — после оплаты (решение владелицы 05.10).
// Отдельный файл: здесь текст пишет поддельный ИИ (локальный сервер), а в worker.test.js — шаблон без ключей.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const prompts = [];
// какие главы просили написать (глава может переписываться, если ответ не прошёл проверку)
const written = () => [...new Set(prompts.map((p) => Number((p.match(/ПИШИ ГЛАВУ (\d+)/) || [])[1])).filter(Boolean))].sort();
const planJson = {
  title: 'Милена и тайна серого камня', logline: 'Милена находит камень, который ведёт к старой карте.', motifs: ['серый камень'],
  dedication: { lead: 'Милене — самой любознательной девочке.', paragraphs: ['Пусть камни приводят тебя к историям.', 'Мы в тебя верим.'] },
  chapters: Array.from({ length: 6 }, (_, i) => ({
    n: i + 1, title: `Глава про камни ${i + 1}`, goal: 'Милена делает шаг вперёд и узнаёт что-то новое.',
    beats: ['Милена находит след', 'Тигран предлагает план', 'Они идут по тропинке', 'Появляется препятствие', 'Милена находит решение'],
    hook: 'Впереди ещё одна загадка.', note: 'Даже маленький камень может вести далеко',
    images: [{ after_beat: 2, scene: 'forest_path', hero: true, brief: 'A girl finds a stone', caption: 'Находка' }]
  }))
};
function chapterJson(n) {
  const blocks = [];
  for (let i = 0; i < 30; i++) {
    blocks.push({ t: 'p', text: i % 3 === 0 ? `— Милена, посмотри, что там, — сказал Тигран, и они пошли дальше по тропинке ${n}.` : `Милена шагала по тропинке и внимательно смотрела под ноги: камни лежали ровным рядом, будто кто-то выложил их нарочно, и каждый следующий был чуть светлее предыдущего, глава ${n}.` });
    if (i === 10) blocks.push({ t: 'image', scene: 'forest_path', hero: true, brief: 'x', caption: 'Тропинка' });
  }
  blocks.push({ t: 'note', label: 'Из записей Милены', text: 'Маленький шаг тоже шаг' });
  return JSON.stringify({ summary: `В главе ${n} Милена идёт дальше.`, blocks });
}

const server = await new Promise((resolve) => {
  const s = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const user = JSON.parse(body).messages.at(-1).content;
      prompts.push(user);
      const n = Number((user.match(/ПИШИ ГЛАВУ (\d+)/) || [])[1]);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: /Это ПЛАН/.test(user) ? JSON.stringify(planJson) : chapterJson(n) } }] }));
    });
  });
  s.listen(0, '127.0.0.1', () => resolve(s));
});
for (const key of ['GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'CEREBRAS_API_KEY', 'OPENAI_API_KEY']) delete process.env[key];
Object.assign(process.env, { PROVIDER_ORDER: 'groq', GROQ_API_KEY: 'k', GROQ_BASE_URL: `http://127.0.0.1:${server.address().port}`, GROQ_MODELS: 'm' });

const { handleApi } = await import('../api.js');
const { runBook } = await import('../book.js');
const { queueHandler } = await import('../queue.js');

function fakeBucket() {
  const items = new Map();
  const wrap = (key, v) => ({ key, body: new Blob([v.bytes]).stream(), httpMetadata: v.httpMetadata, json: async () => JSON.parse(new TextDecoder().decode(v.bytes)), arrayBuffer: async () => v.bytes.slice().buffer });
  return {
    items,
    async get(key) { const v = items.get(key); return v ? wrap(key, v) : null; },
    async put(key, value, opts = {}) { items.set(key, { bytes: typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value), httpMetadata: opts.httpMetadata || {}, customMetadata: opts.customMetadata, uploaded: new Date() }); },
    async list({ prefix }) { return { objects: [...items].filter(([k]) => k.startsWith(prefix)).map(([key, v]) => ({ key, uploaded: v.uploaded })), truncated: false }; },
    async delete(keys) { for (const k of [].concat(keys)) items.delete(k); }
  };
}
function fakeEnv() {
  const env = { BUCKET: fakeBucket(), OPENAI_API_KEY: 'test-key', ADMIN_KEY: 'admin' };
  env.BOOK_WORKFLOW = { async create({ params }) {
    const names = new Set();
    const step = { async do(name, config, fn) { assert.ok(!names.has(name), `повтор имени шага: ${name}`); names.add(name); return JSON.parse(JSON.stringify((await fn()) ?? null)); } };
    await runBook(env, params, step, { log: () => {} });
  } };
  env.START_QUEUE = { async send(body) { await queueHandler({ messages: [{ body, ack() {}, retry() {} }] }, env); } };
  return env;
}

test('«Большая история»: в превью план и первая глава, главы 2–6 — после оплаты', async () => {
  const env = fakeEnv();
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('http://127.0.0.1')) return real(url, init);
    if (String(url).endsWith('/images/edits')) return new Response(`{"data":[{"b64_json":"${Buffer.from('img').toString('base64')}"}]}`, { status: 200 });
    return new Response('{}', { status: 500 }); // корректор и проверка обложки — как будто недоступны
  };
  try {
    const api = (path, opts = {}) => handleApi(new Request(`https://geroenok.online${path}`, { method: opts.method || 'GET', headers: { 'content-type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined }), env);
    const photo = `data:image/jpeg;base64,${Buffer.from('photo').toString('base64')}`;
    const { jobId } = await (await api('/api/book/generate', { method: 'POST', body: { name: 'Милена', age: '9', gender: 'Девочка', theme: 'Приключения', friends: 'Тигран', tariff: 'big', photos: [photo] } })).json();

    let st = await (await api(`/api/book/${jobId}/status`)).json();
    assert.equal(st.status, 'completed');
    assert.deepEqual(written(), [1], 'до оплаты написана только первая глава');
    assert.equal(st.result.book.chapters.length, 1);
    assert.deepEqual(st.result.lockedChapters, planJson.chapters.slice(1).map((c) => c.title), 'названия закрытых глав — из плана');
    assert.ok(st.result.lockedImages >= 5);
    const textOf = (ch) => ch.blocks.filter((b) => b.t !== 'image').map((b) => b.text).join(' ');
    const firstText = textOf(st.result.book.chapters[0]);
    const firstImage = st.result.book.chapters[0].blocks.find((b) => b.t === 'image').src;

    assert.equal((await api(`/api/book/${jobId}/unlock`, { method: 'POST', headers: { 'x-admin-key': 'admin' } })).status, 200);
    st = await (await api(`/api/book/${jobId}/status`)).json();
    const book = st.result.book;
    assert.deepEqual(written(), [1, 2, 3, 4, 5, 6], 'после оплаты дописаны главы 2–6');
    assert.equal(book.chapters.length, 6);
    assert.equal(textOf(book.chapters[0]), firstText, 'первая глава — та же, что в превью');
    assert.equal(book.chapters[0].blocks.find((b) => b.t === 'image').src, firstImage, 'и её нарисованная иллюстрация');
    assert.ok(book.chapters.every((ch) => ch.blocks.filter((b) => b.t === 'image').every((b) => /^\/api\/img\//.test(b.src))), 'все иллюстрации нарисованы');
    const job = JSON.parse(new TextDecoder().decode(env.BUCKET.items.get(`jobs/${jobId}.json`).bytes));
    assert.equal(job.result.bigDraft, undefined);
  } finally { globalThis.fetch = real; server.close(); }
});
