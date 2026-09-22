import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { buildProviders, createHealth } from '../lib/providers.js';
import { generateBigBook, buildPlanPrompt, templateBook } from '../lib/bigstory.js';

const quiet = () => {};
const FAIRYTALE_INPUT = { name: 'Милена', age: '7', gender: 'Девочка', eyes: 'Карие', theme: 'Сказка', habits: 'Обожает загадки', friends: 'Тигран', cast: 'мама Лена' };

test('buildPlanPrompt: сказка — свой голос и вопрос про сказочный мир (не про путешествие)', () => {
  const { system, user } = buildPlanPrompt(FAIRYTALE_INPUT);
  assert.ok(/волшебную сказку/i.test(system), 'голос — сказочный, не приключенческий');
  assert.ok(/сказочный мир.*kingdom.*forest.*underwater/s.test(user));
  assert.ok(!/жанр путешествия/.test(user));
  assert.ok(/throne_hall|fairy_clearing|coral_palace/.test(user), 'в списке сцен — сказочные теги');
  assert.ok(!/map_table|party_room|tree_lights/.test(user), 'чужие темы не должны попадать в промпт сказки');
});

test('templateBook: сказка без ИИ — всегда «королевство» (так написан сам шаблонный текст)', () => {
  const book = templateBook(FAIRYTALE_INPUT);
  assert.equal(book.genre, 'kingdom');
  assert.equal(book.frame, 'vine');
  assert.equal(book.footer, 'kingdom');
  const scenes = book.chapters.flatMap((c) => c.blocks.filter((b) => b.t === 'image').map((b) => b.scene));
  assert.ok(scenes.every((s) => ['castle_ballroom', 'throne_hall', 'garden_maze', 'dragon_tower'].includes(s)));
  assert.ok(/главной героине|главному герою/.test(book.dedication.lead));
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

function forestPlanJson() {
  return {
    title: 'Милена и говорящий лес',
    logline: 'Лесной дух заколдовал тропинку домой.',
    motifs: ['серебряный жёлудь'],
    dedication: { lead: 'Милене — самой любопытной сказочнице.', paragraphs: ['Пусть волшебство всегда будет рядом.', 'Мы тебя очень любим.'] },
    chapters: Array.from({ length: 6 }, (_, i) => ({
      n: i + 1, title: `Глава ${i + 1}`, goal: 'Милена ищет дорогу домой.',
      beats: ['Милена находит след', 'Дерево заговаривает с ней', 'Она идёт через чащу', 'Появляется препятствие', 'Милена находит решение'],
      hook: 'Тропинка всё ещё заколдована.', note: 'Даже лес слушает того, кто добр',
      images: [{ after_beat: 2, scene: 'talking_grove', hero: i === 1 || i === 4, brief: `Forest scene ${i + 1}`, caption: 'Лес' }]
    })),
    genre: 'forest'
  };
}

function forestChapterJson(n) {
  const blocks = [];
  for (let i = 0; i < 30; i++) {
    blocks.push({ t: 'p', text: `Милена шла через лес в главе ${n} и внимательно слушала шёпот деревьев, потому что дорога домой была заколдована.` });
    if (i === 10) blocks.push({ t: 'image', scene: 'fairy_clearing', hero: n === 2 || n === 5, brief: `Forest scene ${n}`, caption: 'Поляна' });
  }
  blocks.push({ t: 'note', label: 'Из записей Милены', text: 'Дорога нашлась' });
  return JSON.stringify({ summary: `В главе ${n} Милена ищет дорогу.`, blocks });
}

test('большая книга целиком: сказка (лес) — ИИ сам выбрал жанр, сцены и оформление соответствуют', async () => {
  const a = await mockServer((user) => (/Это ПЛАН/.test(user) ? JSON.stringify(forestPlanJson()) : forestChapterJson(chapterNo(user))));
  const providers = buildProviders({ PROVIDER_ORDER: 'groq', GROQ_API_KEY: 'k', GROQ_BASE_URL: a.url, GROQ_MODELS: 'm1' });
  const r = await generateBigBook(FAIRYTALE_INPUT, { providers, health: createHealth(), log: quiet });
  a.server.close();

  assert.equal(r.source, 'ai');
  assert.equal(r.book.genre, 'forest');
  assert.equal(r.book.frame, 'leaf');
  assert.equal(r.book.footer, 'forest');
  const scenes = r.book.chapters.flatMap((c) => c.blocks.filter((b) => b.t === 'image').map((b) => b.scene));
  assert.ok(scenes.length > 0);
  // ИИ волен выбирать любой тег из общей сказочной библиотеки (12 тегов), не только «лесные»
  const allFairytaleTags = ['throne_hall', 'castle_ballroom', 'garden_maze', 'dragon_tower', 'fairy_clearing', 'talking_grove', 'witch_hut', 'moonlit_thicket', 'coral_palace', 'pearl_cave', 'sunken_ship', 'kelp_forest'];
  assert.ok(scenes.every((s) => allFairytaleTags.includes(s)), `неожиданная сцена: ${scenes}`);
});
