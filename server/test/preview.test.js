import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, photoStore, unlockBook } from '../index.js';
import { completeBook } from '../lib/complete.js';
import { generateStory } from '../lib/story.js';
import { generateBigBook } from '../lib/bigstory.js';
import { buildProviders, createHealth } from '../lib/providers.js';

const STORE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'generated');
const quiet = () => {};
const img = (x) => `data:image/png;base64,${x}`;
const PHOTO = { mime: 'image/jpeg', data: 'Zm9v' };
const INPUT = { name: 'Милена', age: '7', gender: 'Девочка', eyes: 'Карие', theme: 'Приключения', habits: 'Обожает собирать камни', friends: 'Тигран', cast: 'мама Лена, кот Барсик', style: 'Акварель' };

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

function writeJob(id, result, extra = {}) {
  const job = { id, status: 'completed', createdAt: Date.now(), finishedAt: Date.now(), input: { name: 'Милена', style: 'Акварель' }, result, ...extra };
  fs.mkdirSync(STORE, { recursive: true });
  fs.writeFileSync(path.join(STORE, `${id}.json`), JSON.stringify(job));
  return () => fs.rmSync(path.join(STORE, `${id}.json`), { force: true });
}

const post = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

// ---------------------------------------------------------------- что видит клиент до оплаты

test('превью: сервер отдаёт только первые страницы «Сказки» и первую главу «Большой истории»', async () => {
  const shortId = 'bbbbbbbb-0000-0000-0000-000000000001';
  const bigId = 'bbbbbbbb-0000-0000-0000-000000000002';
  const ch = (n) => ({ n, title: `Глава ${n}`, blocks: [{ t: 'p', text: `Текст главы ${n}` }, { t: 'image', brief: 'b', src: n === 1 ? img('aW1n') : 'assets/scenes/x.jpg' }] });
  const rm = [
    writeJob(shortId, { title: 'Т', cover: img('Y292'), pages: [1, 2, 3, 4, 5].map((n) => ({ text: `Секретная страница ${n}` })) }),
    writeJob(bigId, { book: { title: 'Т', chapters: [1, 2, 3].map(ch) } })
  ];
  const { server, url } = await listen();
  try {
    const s = await (await fetch(`${url}/api/book/${shortId}/result`)).json();
    assert.equal(s.paid, false);
    assert.equal(s.result.locked, true);
    assert.equal(s.result.pages.length, 2);
    assert.equal(s.result.lockedPages, 3);
    assert.ok(!JSON.stringify(s).includes('Секретная страница 3'), 'закрытый текст не уходит клиенту');

    const b = await (await fetch(`${url}/api/book/${bigId}/result`)).json();
    assert.equal(b.result.book.chapters.length, 1);
    assert.deepEqual(b.result.lockedChapters, ['Глава 2', 'Глава 3']);
    assert.ok(!JSON.stringify(b).includes('Текст главы 2'));

    assert.equal((await post(`${url}/api/book/${shortId}/edit`, { edits: [{ page: 0, text: 'x' }] })).status, 402, 'правка — после оплаты');
    assert.equal((await post(`${url}/api/book/${shortId}/redraw`, { index: 0 })).status, 402, 'перерисовка — после оплаты');
  } finally {
    server.close(); rm.forEach((f) => f());
  }
});

test('разблокировка: без ADMIN_KEY — 503, чужой ключ — 403', async () => {
  const id = 'bbbbbbbb-0000-0000-0000-000000000003';
  const rm = writeJob(id, { title: 'Т', pages: [{ text: 'a' }] });
  const saved = process.env.ADMIN_KEY;
  const { server, url } = await listen();
  try {
    delete process.env.ADMIN_KEY;
    assert.equal((await post(`${url}/api/book/${id}/unlock`, {})).status, 503);
    process.env.ADMIN_KEY = 'secret';
    assert.equal((await post(`${url}/api/book/${id}/unlock`, {}, { 'x-admin-key': 'wrong' })).status, 403);
  } finally {
    if (saved) process.env.ADMIN_KEY = saved; else delete process.env.ADMIN_KEY;
    server.close(); rm();
  }
});

// ---------------------------------------------------------------- дорисовка после оплаты

test('после оплаты книга дорисовывается по листу персонажа, фото удаляются', async () => {
  const id = 'bbbbbbbb-0000-0000-0000-000000000004';
  const job = { id, status: 'completed', input: { name: 'Милена', coloring: true }, result: {
    title: 'Т', sheet: img('c2hlZXQ='), cover: img('Y292'), preview: true,
    pages: [{ text: 'a', heroBrief: 'p1', heroImage: img('cDE=') }, { text: 'b', heroBrief: 'p2' }, { text: 'c', heroBrief: 'p3' }]
  } };
  photoStore.save(id, [{ mime: 'image/png', data: 'cGhvdG8=' }]);
  const calls = [];
  const illustrate = async (o) => { calls.push(o); return { data: o.kind === 'coloring' ? 'Y29s' : 'bmV3', mime: 'image/png' }; };
  await unlockBook(job, { illustrate });

  assert.equal(job.paid, true);
  assert.equal(job.finishing, false);
  assert.ok(!calls.some((c) => c.kind === 'sheet'), 'лист персонажа не рисуется заново');
  assert.ok(!calls.some((c) => c.kind === 'cover'), 'обложка уже была');
  assert.deepEqual(calls.filter((c) => c.kind === 'scene').map((c) => c.brief), ['p2', 'p3'], 'дорисовываются только недостающие');
  assert.ok(calls.filter((c) => c.kind === 'scene').every((c) => c.sheet && c.photos.length === 1));
  assert.equal(job.result.pages[0].heroImage, img('cDE='), 'готовая иллюстрация не перерисована');
  assert.equal(job.result.pages[2].heroImage, img('bmV3'));
  assert.equal(job.result.coloring.length, 3, 'раскраска из всех иллюстраций');
  assert.equal(job.result.preview, undefined);
  assert.deepEqual(photoStore.load(id), [], 'фото удалены');
  fs.rmSync(path.join(STORE, `${id}.json`), { force: true });
});

test('дорисовка «Большой истории»: не получилась иллюстрация — её нет в книге', async () => {
  const job = { id: 'x', input: {}, result: { book: { title: 'Т', sheet: img('c2hlZXQ='), cover: img('Y292'), chapters: [
    { n: 1, title: 'Г', blocks: [{ t: 'p', text: 'a' }, { t: 'image', brief: 'ok', src: img('cDE=') }, { t: 'image', brief: 'fail', src: 'assets/scenes/x.jpg' }] }
  ] } } };
  const illustrate = async (o) => (o.brief === 'fail' ? null : { data: 'bmV3', mime: 'image/png' });
  await completeBook(job, { photos: [], illustrate, log: quiet });
  const imgs = job.result.book.chapters[0].blocks.filter((b) => b.t === 'image');
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].src, img('cDE='));
});

// ---------------------------------------------------------------- превью при генерации

function mockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const messages = JSON.parse(body).messages;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: handler(messages[messages.length - 1].content) } }] }));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

const goodStory = JSON.stringify({
  title: 'Милена и тайна камня',
  pages: Array.from({ length: 6 }, (_, i) => ({
    text: `Страница ${i + 1}. Милена шла по лесной тропинке, собирала гладкие камушки и слушала, как шумят высокие сосны над головой. ${'Тигран шагал рядом и рассказывал, как устроен мир вокруг них. '.repeat(9)}`,
    scene: 'forest_path', heroBrief: 'The girl kneels by a glowing stone.'
  }))
});

const planJson = {
  title: 'Милена и тайна серого камня', logline: 'Милена находит камень.', motifs: ['серый камень'],
  dedication: { lead: 'Милене.', paragraphs: ['Текст.'] },
  chapters: Array.from({ length: 6 }, (_, i) => ({
    n: i + 1, title: `Глава ${i + 1}`, goal: 'Милена делает шаг вперёд.',
    beats: ['Милена находит след', 'Тигран предлагает план', 'Они идут по тропинке', 'Появляется препятствие', 'Милена находит решение'],
    hook: 'Впереди загадка.', note: 'Даже маленький камень может вести далеко',
    images: [{ after_beat: 2, scene: 'forest_path', brief: `Scene brief ${i + 1}`, caption: 'Находка' }]
  }))
};

function chapterJson(n) {
  const blocks = [];
  for (let i = 0; i < 30; i++) {
    blocks.push({ t: 'p', text: `Милена шагала по тропинке номер ${n} и внимательно смотрела под ноги, потому что камни бывают самыми разными.` });
    if (i === 10) blocks.push({ t: 'image', scene: 'forest_path', brief: `Scene brief ${n}`, caption: 'Тропинка' });
  }
  blocks.push({ t: 'note', label: 'Из записей Милены', text: 'Маленький шаг тоже шаг' });
  return JSON.stringify({ summary: `В главе ${n} Милена идёт дальше.`, blocks });
}

test('превью «Сказки»: рисуются только лист персонажа, обложка и первая страница', async () => {
  const a = await mockServer(() => goodStory);
  const providers = buildProviders({ PROVIDER_ORDER: 'groq', GROQ_API_KEY: 'k', GROQ_BASE_URL: a.url, GROQ_MODELS: 'm1' });
  const kinds = [];
  const illustrate = async (o) => { kinds.push(o.kind); return { data: 'aW1n', mime: 'image/png' }; };
  const story = await generateStory({ ...INPUT, photo: PHOTO, coloring: true }, { providers, health: createHealth(), log: quiet, illustrate, preview: true });
  a.server.close();
  assert.deepEqual(kinds.sort(), ['cover', 'scene', 'sheet'], 'три картинки, раскраски в превью нет');
  assert.equal(story.preview, true);
  assert.ok(story.pages[0].heroImage && !story.pages[1].heroImage);
});

test('превью «Большой истории»: одна иллюстрация, остальные ждут оплаты', async () => {
  const a = await mockServer((user) => (/Это ПЛАН/.test(user) ? JSON.stringify(planJson) : chapterJson(Number((user.match(/ПИШИ ГЛАВУ (\d+)/) || [])[1]))));
  const providers = buildProviders({ PROVIDER_ORDER: 'groq', GROQ_API_KEY: 'k', GROQ_BASE_URL: a.url, GROQ_MODELS: 'm1' });
  const kinds = [];
  const illustrate = async (o) => { kinds.push(o.kind); return { data: 'aW1n', mime: 'image/png' }; };
  const r = await generateBigBook({ ...INPUT, photo: PHOTO, coloring: true }, { providers, health: createHealth(), log: quiet, illustrate, preview: true });
  a.server.close();
  assert.deepEqual(kinds.sort(), ['cover', 'scene', 'sheet']);
  const imgs = r.book.chapters.flatMap((c) => c.blocks.filter((b) => b.t === 'image'));
  assert.ok(imgs.length >= 8, 'недорисованные иллюстрации не выброшены');
  assert.equal(imgs.filter((b) => /^data:/.test(b.src)).length, 1);
  assert.equal(r.book.preview, true);
});
