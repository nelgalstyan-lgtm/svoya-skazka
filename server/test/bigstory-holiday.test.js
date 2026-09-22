import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { buildProviders, createHealth } from '../lib/providers.js';
import { generateBigBook, buildPlanPrompt, templateBook } from '../lib/bigstory.js';

const quiet = () => {};
const BIRTHDAY_INPUT = { name: 'Милена', age: '7', gender: 'Девочка', eyes: 'Карие', theme: 'Праздник / повод', occasion: 'День рождения', habits: 'Обожает сюрпризы', friends: 'Тигран', cast: 'мама Лена' };
const NEWYEAR_INPUT = { name: 'Милена', age: '7', gender: 'Девочка', eyes: 'Карие', theme: 'Праздник / повод', occasion: 'Новый год', habits: 'Обожает снег', friends: 'Тигран', cast: 'мама Лена' };

test('buildPlanPrompt: день рождения — праздничные сцены, без вопроса про жанр путешествия', () => {
  const { system, user } = buildPlanPrompt(BIRTHDAY_INPUT);
  assert.ok(/день рождения/i.test(system), 'голос — про день рождения');
  assert.ok(/party_room|gift_pile|birthday_table|confetti_moment/.test(user));
  assert.ok(!/map_table|forest_path|ship_deck/.test(user), 'сцены путешествия не должны попадать в промпт праздника');
  assert.ok(!/жанр путешествия/.test(user), 'для праздника жанр не спрашиваем — он уже известен из повода');
});

test('buildPlanPrompt: Новый год — свой голос и свои сцены', () => {
  const { system, user } = buildPlanPrompt(NEWYEAR_INPUT);
  assert.ok(/новогодн/i.test(system));
  assert.ok(/tree_lights|snow_yard|fireplace_stockings|midnight_fireworks/.test(user));
});

test('templateBook: день рождения — оформление и сцены не от «Путешествия»', () => {
  const book = templateBook(BIRTHDAY_INPUT);
  assert.equal(book.genre, 'birthday');
  assert.equal(book.frame, 'ribbon');
  assert.equal(book.footer, 'birthday');
  const scenes = book.chapters.flatMap((c) => c.blocks.filter((b) => b.t === 'image').map((b) => b.scene));
  assert.ok(scenes.every((s) => ['party_room', 'gift_pile', 'birthday_table', 'confetti_moment'].includes(s)));
  assert.ok(/имениннице|имениннику/.test(book.dedication.lead));
});

test('templateBook: Новый год — своё оформление', () => {
  const book = templateBook(NEWYEAR_INPUT);
  assert.equal(book.genre, 'newyear');
  assert.equal(book.frame, 'frost');
  assert.equal(book.footer, 'newyear');
});

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

function birthdayPlanJson() {
  return {
    title: 'День рождения Милены',
    logline: 'Пропал главный подарок за час до праздника.',
    motifs: ['воздушный шарик'],
    dedication: { lead: 'Милене — самой яркой имениннице.', paragraphs: ['С днём рождения!', 'Мы тебя очень любим.'] },
    chapters: Array.from({ length: 6 }, (_, i) => ({
      n: i + 1, title: `Глава ${i + 1}`, goal: 'Милена ищет пропавший подарок.',
      beats: ['Милена находит записку', 'Тигран предлагает план', 'Они обыскивают комнату', 'Появляется препятствие', 'Милена находит решение'],
      hook: 'Праздник почти испорчен.', note: 'Даже пропавший подарок можно найти',
      images: [{ after_beat: 2, scene: 'party_room', hero: i === 1 || i === 4, brief: `Birthday scene ${i + 1}`, caption: 'Праздник' }]
    }))
  };
}

function birthdayChapterJson(n) {
  const blocks = [];
  for (let i = 0; i < 30; i++) {
    blocks.push({ t: 'p', text: `Милена искала подарок в главе ${n} и внимательно осматривала комнату, потому что праздник был почти испорчен.` });
    if (i === 10) blocks.push({ t: 'image', scene: 'gift_pile', hero: n === 2 || n === 5, brief: `Birthday scene ${n}`, caption: 'Подарки' });
  }
  blocks.push({ t: 'note', label: 'Из записей Милены', text: 'Праздник спасён' });
  return JSON.stringify({ summary: `В главе ${n} Милена ищет подарок.`, blocks });
}

test('большая книга целиком: день рождения — сцены и оформление праздничные, не от «Путешествия»', async () => {
  const a = await mockServer((user) => (/Это ПЛАН/.test(user) ? JSON.stringify(birthdayPlanJson()) : birthdayChapterJson(chapterNo(user))));
  const providers = buildProviders({ PROVIDER_ORDER: 'groq', GROQ_API_KEY: 'k', GROQ_BASE_URL: a.url, GROQ_MODELS: 'm1' });
  const r = await generateBigBook(BIRTHDAY_INPUT, { providers, health: createHealth(), log: quiet });
  a.server.close();

  assert.equal(r.source, 'ai');
  assert.equal(r.book.genre, 'birthday');
  assert.equal(r.book.frame, 'ribbon');
  assert.equal(r.book.footer, 'birthday');
  const scenes = r.book.chapters.flatMap((c) => c.blocks.filter((b) => b.t === 'image').map((b) => b.scene));
  assert.ok(scenes.length > 0);
  assert.ok(scenes.every((s) => ['party_room', 'gift_pile', 'birthday_table', 'confetti_moment'].includes(s)), `неожиданная сцена: ${scenes}`);
});
