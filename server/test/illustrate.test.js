import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHeroPrompt, normalizePhoto, generateHeroImage } from '../lib/illustrate.js';
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

test('промпт: подставляет технику рендера по стилю, а не форму черт лица', () => {
  const cartoon = buildHeroPrompt({ styleLabel: 'Мультяшный', brief: 'x' });
  assert.ok(/cel-style|cel-shaded|cartoon/i.test(cartoon));
  const clay = buildHeroPrompt({ styleLabel: 'Пластилиновый / 3D', brief: 'x' });
  assert.ok(/3D animated/i.test(clay));
  for (const p of [cartoon, clay]) {
    assert.ok(!/large expressive eyes/i.test(p));
  }
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
  assert.equal(await generateHeroImage({ apiKey: '', photo: PHOTO }), null);
  assert.equal(await generateHeroImage({ apiKey: 'k', photo: null }), null);
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

test('короткая книга: есть фото — геройская страница получает картинку через инжектированный illustrate', async () => {
  const { providers, close } = await providersFor(okReply(goodStory));
  const seen = [];
  const illustrate = async (opts) => { seen.push(opts); return { data: 'aW1n', mime: 'image/png' }; };
  const story = await generateStory({ ...INPUT, photo: PHOTO }, { providers, health: createHealth(), log: quiet, illustrate });
  close();

  assert.equal(seen.length, 1);
  assert.equal(seen[0].brief, 'The girl kneels by a glowing stone, reaching out with one hand.');
  const heroPage = story.pages.find((p) => p.hero);
  assert.equal(heroPage.heroImage, 'data:image/png;base64,aW1n');
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

test('большая книга: несколько hero-картинок по плану — каждая получает своё фото по очереди', async () => {
  const a = await mockServer((user) => (/Это ПЛАН/.test(user) ? JSON.stringify(planJson) : chapterJson(chapterNo(user))));
  const providers = buildProviders({ PROVIDER_ORDER: 'groq', GROQ_API_KEY: 'k', GROQ_BASE_URL: a.url, GROQ_MODELS: 'm1' });

  const seen = [];
  const illustrate = async (opts) => { seen.push(opts.brief); return { data: 'aW1n', mime: 'image/png' }; };
  const r = await generateBigBook({ ...INPUT, photo: PHOTO }, { providers, health: createHealth(), log: quiet, illustrate });
  a.server.close();

  const heroImgs = r.book.chapters.flatMap((c) => c.blocks.filter((b) => b.t === 'image' && b.hero));
  const plainImgs = r.book.chapters.flatMap((c) => c.blocks.filter((b) => b.t === 'image' && !b.hero));

  assert.ok(heroImgs.length >= 1);
  assert.ok(heroImgs.every((im) => im.src === 'data:image/png;base64,aW1n'));
  assert.ok(plainImgs.every((im) => /^assets\/scenes\//.test(im.src)), 'нехеройские картинки остаются фоновыми сценами');
  assert.equal(seen.length, heroImgs.length);
});
