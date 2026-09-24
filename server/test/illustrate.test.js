import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHeroPrompt, normalizePhoto, generateHeroImage, photosFrom, illustrateBook, pickStyleKey } from '../lib/illustrate.js';
import { parsePhotos } from '../index.js';
import { generateStory } from '../lib/story.js';
import { generateBigBook, validatePlan } from '../lib/bigstory.js';
import { buildProviders, createHealth } from '../lib/providers.js';
import http from 'node:http';

const quiet = () => {};
const PHOTO = { mime: 'image/jpeg', data: 'Zm9v' }; // "foo" в base64 — реального фото не нужно, промпт-логика этого не проверяет

test('промпт: сохраняет личность, без отрицаний в эмоции, портретный формат, без слов про фон-заглушку для текста', () => {
  const prompt = buildHeroPrompt({ styleLabel: 'Акварель', eyes: 'карие', brief: 'The child climbs a rope bridge.' });
  assert.ok(/exact same person from the reference photo/.test(prompt));
  assert.ok(/do not beautify, idealize/.test(prompt));
  assert.ok(/do not age the character up or down/.test(prompt));
  assert.ok(/\(карие\)/.test(prompt), 'цвет глаз подставлен как есть');
  assert.ok(!/\bnot (angry|scared|sad)\b/i.test(prompt), 'эмоция не должна описываться через отрицание');
  assert.ok(/portrait aspect ratio approximately 2:3|approximately 2:3/.test(prompt));
  assert.ok(/free of any text|free of.*space reserved for text/i.test(prompt), 'явно запрещает зарезервированное место под текст');
  assert.ok(!/leave space for text|reserve space for text/i.test(prompt), 'не должно ПРОСИТЬ оставить место под текст');
  assert.ok(/watercolor/.test(prompt));
});

test('промпт: два стиля — акварель и 3D-мультфильм; технику рендера, а не форму черт лица', () => {
  assert.equal(pickStyleKey('Акварель'), 'watercolor');
  assert.equal(pickStyleKey('3D-мультфильм'), 'animated3d');
  assert.equal(pickStyleKey('Пластилиновый / 3D'), 'animated3d', 'старые заказы с прежним названием стиля');
  assert.equal(pickStyleKey('Аниме'), 'watercolor', 'убранные стили падают на акварель');
  const anim = buildHeroPrompt({ styleLabel: '3D-мультфильм', brief: 'x' });
  assert.ok(/3D computer animation/i.test(anim) && /never a photograph/.test(anim), '3D — явно мультфильм, не фото');
  assert.ok(!/large expressive eyes/i.test(anim));
  assert.ok(/characters from existing cartoons/i.test(anim), 'запрет чужих персонажей и брендов');
});

test('промпт: лист персонажа, обложка и одежда из look', () => {
  const scene = buildHeroPrompt({ styleLabel: 'Акварель', brief: 'x', look: 'a yellow raincoat', withSheet: true, photoCount: 2 });
  assert.ok(/character reference sheet/.test(scene));
  assert.ok(/yellow raincoat/.test(scene));
  assert.ok(/reference photos/.test(scene), 'несколько фото — так и сказано модели');
  const cover = buildHeroPrompt({ styleLabel: 'Акварель', brief: 'x', kind: 'cover' });
  assert.ok(/front cover/.test(cover) && /title will be typeset/.test(cover));
  const sheet = buildHeroPrompt({ styleLabel: 'Акварель', kind: 'sheet' });
  assert.ok(/character reference sheet on a plain/.test(sheet));
});

test('фото: не больше трёх, старое одиночное photo тоже принимается', () => {
  const p = { mime: 'image/png', data: 'abc' };
  assert.equal(photosFrom({ photos: [p, p, p, p] }).length, 3);
  assert.equal(photosFrom({ photo: p }).length, 1);
  assert.equal(photosFrom({}).length, 0);
  const url = 'data:image/png;base64,YWJj';
  assert.equal(parsePhotos({ photos: [url, url, url, url] }).length, 3);
  assert.equal(parsePhotos({ photo: url }).length, 1);
  assert.equal(parsePhotos({ photos: ['data:text/html;base64,YWJj'] }).length, 0);
});

test('illustrateBook: сначала лист персонажа, он уходит образцом в обложку и каждую страницу', async () => {
  const calls = [];
  const illustrate = async (o) => { calls.push(o); return { data: o.kind === 'sheet' ? 'c2hlZXQ=' : 'aW1n', mime: 'image/png' }; };
  const art = await illustrateBook({ photos: [PHOTO], style: 'Акварель' }, { scenes: [{ brief: 'a' }, { brief: 'b' }], coverBrief: 'c', look: 'red scarf', illustrate });
  assert.equal(calls[0].kind, 'sheet');
  assert.ok(calls.slice(1).every((c) => c.sheet && c.sheet.data === 'c2hlZXQ=' && c.look === 'red scarf'));
  assert.equal(art.cover, 'data:image/png;base64,aW1n');
  assert.deepEqual(art.scenes, ['data:image/png;base64,aW1n', 'data:image/png;base64,aW1n']);
  assert.equal(art.sheet, 'data:image/png;base64,c2hlZXQ=');
});

test('illustrateBook: лист не получился — страницы всё равно рисуются; время вышло — остальные пропускаются', async () => {
  const illustrate = async (o) => (o.kind === 'sheet' ? null : { data: 'aW1n', mime: 'image/png' });
  const art = await illustrateBook({ photos: [PHOTO] }, { scenes: [{ brief: 'a' }], illustrate });
  assert.equal(art.sheet, null);
  assert.equal(art.scenes[0], 'data:image/png;base64,aW1n');

  const late = await illustrateBook({ photos: [PHOTO] }, { scenes: [{ brief: 'a' }, { brief: 'b' }], illustrate, deadlineAt: Date.now() - 1 });
  assert.deepEqual(late.scenes, [null, null]);
});

test('illustrateBook: раскраска делается из готовых иллюстраций', async () => {
  const kinds = [];
  const illustrate = async (o) => { kinds.push(o.kind); return { data: 'aW1n', mime: 'image/png' }; };
  const art = await illustrateBook({ photos: [PHOTO] }, { scenes: [{ brief: 'a' }, { brief: 'b' }], illustrate, coloring: true });
  assert.equal(kinds.filter((k) => k === 'coloring').length, 2);
  assert.equal(art.coloring.length, 2);
});

test('промпт: без brief всё равно собирается (запасное описание сцены)', () => {
  const prompt = buildHeroPrompt({ styleLabel: 'Акварель' });
  assert.ok(prompt.length > 100);
});

test('normalizePhoto: принимает только jpeg/png/webp с данными', () => {
  assert.equal(normalizePhoto(null), null);
  assert.equal(normalizePhoto({ mime: 'image/gif', data: 'abc' }), null);
  assert.equal(normalizePhoto({ mime: 'image/png', data: '' }), null);
  assert.deepEqual(normalizePhoto({ mime: 'image/png', data: 'abc' }), { mime: 'image/png', data: 'abc' });
});

test('generateHeroImage: без ключа или без фото — не пытается звать сеть, просто null', async () => {
  assert.equal(await generateHeroImage({ apiKey: '', openaiKey: '', photo: PHOTO }), null);
  assert.equal(await generateHeroImage({ apiKey: 'k', openaiKey: 'k', photo: null }), null);
});

const INPUT = { name: 'Милена', age: '7', gender: 'Девочка', eyes: 'Карие', theme: 'Приключения', habits: 'Обожает собирать камни', friends: 'Тигран', cast: 'мама Лена, кот Барсик', style: 'Акварель' };

const goodStory = JSON.stringify({
  title: 'Милена и тайна камня',
  pages: Array.from({ length: 6 }, (_, i) => ({
    text: `Страница ${i + 1}. Милена шла по лесной тропинке, собирала гладкие камушки и слушала, как шумят высокие сосны над головой. ${'Тигран шагал рядом и рассказывал, как устроен мир вокруг них. '.repeat(9)}`,
    scene: 'forest_path', hero: i === 4, heroBrief: 'The girl kneels by a glowing stone, reaching out with one hand.'
  }))
});

function mock(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => handler(req, res));
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

const okReply = (content) => (req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ choices: [{ message: { content } }] }));
};

async function providersFor(handler) {
  const a = await mock(handler);
  const providers = buildProviders({ PROVIDER_ORDER: 'groq', GROQ_API_KEY: 'k', GROQ_BASE_URL: a.url, GROQ_MODELS: 'm1' });
  return { providers, close: () => a.server.close() };
}

test('короткая книга: есть фото — ребёнок на обложке и на каждой странице', async () => {
  const { providers, close } = await providersFor(okReply(goodStory));
  const seen = [];
  const illustrate = async (opts) => { seen.push(opts); return { data: 'aW1n', mime: 'image/png' }; };
  const story = await generateStory({ ...INPUT, photos: [PHOTO, PHOTO] }, { providers, health: createHealth(), log: quiet, illustrate });
  close();

  // лист персонажа + обложка + 6 страниц
  assert.equal(seen.length, 8);
  assert.ok(seen.every((o) => o.photos.length === 2), 'все фото уходят в каждую картинку');
  assert.ok(seen.some((o) => o.brief === 'The girl kneels by a glowing stone, reaching out with one hand.'));
  assert.ok(story.pages.every((p) => p.hero && p.heroImage === 'data:image/png;base64,aW1n'));
  assert.equal(story.cover, 'data:image/png;base64,aW1n');
});

test('короткая книга: ИИ недоступен, но фото есть — книга из шаблона тоже получает иллюстрации', async () => {
  const seen = [];
  const illustrate = async (opts) => { seen.push(opts); return { data: 'aW1n', mime: 'image/png' }; };
  const story = await generateStory({ ...INPUT, photo: PHOTO }, { providers: [], log: quiet, illustrate });
  assert.equal(story.source, 'template');
  assert.ok(story.pages.every((p) => p.heroImage));
  assert.ok(seen.filter((o) => o.kind === 'scene').every((o) => /The child explores the scene/.test(o.brief)));
});

test('короткая книга: без фото illustrate не вызывается вообще', async () => {
  const { providers, close } = await providersFor(okReply(goodStory));
  let called = false;
  const illustrate = async () => { called = true; return null; };
  const story = await generateStory(INPUT, { providers, health: createHealth(), log: quiet, illustrate });
  close();
  assert.equal(called, false);
  assert.ok(!story.pages.some((p) => p.heroImage));
});

test('короткая книга: иллюстрация не удалась — книга всё равно готова, просто без фото ребёнка', async () => {
  const { providers, close } = await providersFor(okReply(goodStory));
  const illustrate = async () => null;
  const story = await generateStory({ ...INPUT, photo: PHOTO }, { providers, health: createHealth(), log: quiet, illustrate });
  close();
  assert.equal(story.source, 'ai');
  assert.ok(!story.pages.some((p) => p.heroImage));
});

const planJson = {
  title: 'Милена и тайна серого камня',
  logline: 'Милена находит камень, который ведёт к старой карте.',
  motifs: ['серый камень'],
  dedication: { lead: 'Милене.', paragraphs: ['Текст.'] },
  chapters: Array.from({ length: 6 }, (_, i) => ({
    n: i + 1, title: `Глава ${i + 1}`, goal: 'Милена делает шаг вперёд.',
    beats: ['Милена находит след', 'Тигран предлагает план', 'Они идут по тропинке', 'Появляется препятствие', 'Милена находит решение'],
    hook: 'Впереди загадка.', note: 'Даже маленький камень может вести далеко',
    images: [{ after_beat: 2, scene: 'forest_path', hero: i === 1 || i === 4, brief: `Scene brief ${i + 1}`, caption: 'Находка' }]
  }))
};

function chapterJson(n) {
  const blocks = [];
  for (let i = 0; i < 30; i++) {
    blocks.push({ t: 'p', text: `Милена шагала по тропинке номер ${n} и внимательно смотрела под ноги, потому что камни бывают самыми разными.` });
    if (i === 10) blocks.push({ t: 'image', scene: 'forest_path', hero: n === 2 || n === 5, brief: `Scene brief ${n}`, caption: 'Тропинка' });
  }
  blocks.push({ t: 'note', label: `Из записей Милены`, text: 'Маленький шаг тоже шаг' });
  return JSON.stringify({ summary: `В главе ${n} Милена идёт дальше.`, blocks });
}

function mockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const messages = JSON.parse(body).messages;
        const user = messages[messages.length - 1].content;
        const out = handler(user);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: out } }] }));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

const chapterNo = (user) => Number((user.match(/ПИШИ ГЛАВУ (\d+)/) || [])[1]);

test('большая книга: 8–10 иллюстраций, ребёнок на каждой, плюс обложка', async () => {
  const a = await mockServer((user) => (/Это ПЛАН/.test(user) ? JSON.stringify(planJson) : chapterJson(chapterNo(user))));
  const providers = buildProviders({ PROVIDER_ORDER: 'groq', GROQ_API_KEY: 'k', GROQ_BASE_URL: a.url, GROQ_MODELS: 'm1' });

  const seen = [];
  const illustrate = async (opts) => { seen.push(opts); return { data: 'aW1n', mime: 'image/png' }; };
  const r = await generateBigBook({ ...INPUT, photo: PHOTO }, { providers, health: createHealth(), log: quiet, illustrate });
  a.server.close();

  const imgs = r.book.chapters.flatMap((c) => c.blocks.filter((b) => b.t === 'image'));
  assert.ok(imgs.length >= 8 && imgs.length <= 10, `8–10 иллюстраций, получилось ${imgs.length}`);
  assert.ok(imgs.every((im) => im.hero && im.src === 'data:image/png;base64,aW1n'), 'ребёнок на каждой иллюстрации');
  assert.equal(r.book.cover, 'data:image/png;base64,aW1n');
  // лист персонажа + обложка + все иллюстрации (раскраска здесь не заказана)
  assert.equal(seen.filter((o) => o.kind !== 'coloring').length, imgs.length + 2);
});

test('illustrateBook: не нарисовалось — вторая попытка', async () => {
  const tries = new Map();
  const illustrate = async (o) => {
    if (o.kind === 'sheet') return { data: 'c2hlZXQ=', mime: 'image/png' };
    const n = (tries.get(o.brief) || 0) + 1;
    tries.set(o.brief, n);
    return o.brief === 'flaky' && n === 1 ? null : { data: 'aW1n', mime: 'image/png' };
  };
  const art = await illustrateBook({ photos: [PHOTO] }, { scenes: [{ brief: 'ok' }, { brief: 'flaky' }], illustrate });
  assert.deepEqual(art.scenes, ['data:image/png;base64,aW1n', 'data:image/png;base64,aW1n']);
  assert.equal(tries.get('flaky'), 2);
});

test('большая книга: иллюстрация не получилась и со второй попытки — её нет в книге, фоновой сцены вместо неё тоже', async () => {
  const a = await mockServer((user) => (/Это ПЛАН/.test(user) ? JSON.stringify(planJson) : chapterJson(chapterNo(user))));
  const providers = buildProviders({ PROVIDER_ORDER: 'groq', GROQ_API_KEY: 'k', GROQ_BASE_URL: a.url, GROQ_MODELS: 'm1' });
  let scenes = 0;
  // каждая третья страница не рисуется никогда
  const illustrate = async (o) => (o.kind === 'scene' && ++scenes % 3 === 0 ? null : { data: 'aW1n', mime: 'image/png' });
  const r = await generateBigBook({ ...INPUT, photo: PHOTO }, { providers, health: createHealth(), log: quiet, illustrate });
  a.server.close();
  const imgs = r.book.chapters.flatMap((c) => c.blocks.filter((b) => b.t === 'image'));
  assert.ok(imgs.length > 0);
  assert.ok(imgs.every((im) => im.src === 'data:image/png;base64,aW1n'), 'в книге только нарисованные иллюстрации');
});
