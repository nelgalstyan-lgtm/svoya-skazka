import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { buildProviders, createHealth } from '../lib/providers.js';
import { generateStory } from '../lib/story.js';
import { createJobQueue } from '../lib/jobs.js';
import { buildTemplateStory } from '../lib/story.js';

const INPUT = { name: 'Милена', age: '7', gender: 'Девочка', eyes: 'Карие', theme: 'Приключения', habits: 'Обожает собирать камни', friends: 'Тигран', cast: 'мама Лена, кот Барсик' };
const quiet = () => {};

const goodStory = JSON.stringify({
  title: 'Милена и тайна камня',
  pages: Array.from({ length: 6 }, (_, i) => ({ text: `Страница ${i + 1}. Милена шла по лесной тропинке, собирала гладкие камушки и слушала, как шумят высокие сосны над головой. ${'Тигран шагал рядом и рассказывал, как устроен мир вокруг них. '.repeat(9)}`, scene: i === 2 ? 'плохой_тег' : 'forest_path', hero: i === 4 }))
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
const status = (code) => (req, res) => { res.statusCode = code; res.end('nope'); };

async function providersFor(first, second) {
  const a = await mock(first);
  const b = await mock(second);
  const providers = buildProviders({
    PROVIDER_ORDER: 'groq,openrouter',
    GROQ_API_KEY: 'k1', GROQ_BASE_URL: a.url, GROQ_MODELS: 'm1',
    OPENROUTER_API_KEY: 'k2', OPENROUTER_BASE_URL: b.url, OPENROUTER_MODELS: 'm2'
  });
  return { providers, close: () => { a.server.close(); b.server.close(); } };
}

test('падает первый провайдер (503) — книгу пишет второй', async () => {
  const { providers, close } = await providersFor(status(503), okReply(goodStory));
  const story = await generateStory(INPUT, { providers, health: createHealth(), log: quiet });
  close();
  assert.equal(story.source, 'ai');
  assert.equal(story.provider, 'openrouter');
  assert.equal(story.pages.length, 6);
  assert.equal(story.pages[2].scene, 'mountain_bridge'); // неверный тег заменён на рабочий
  assert.ok(story.pages.every((p) => p.hero && p.heroBrief), 'ребёнок на каждой странице, у каждой есть описание сцены');
});

test('первый провайдер вернул мусор — идём ко второму', async () => {
  const { providers, close } = await providersFor(okReply('Извините, я не могу'), okReply('```json\n' + goodStory + '\n```'));
  const story = await generateStory(INPUT, { providers, health: createHealth(), log: quiet });
  close();
  assert.equal(story.source, 'ai');
  assert.equal(story.provider, 'openrouter');
});

test('упали все провайдеры — клиент всё равно получает книгу из шаблона', async () => {
  const { providers, close } = await providersFor(status(429), status(500));
  const story = await generateStory(INPUT, { providers, health: createHealth(), log: quiet, deadlineMs: 8000 });
  close();
  assert.equal(story.source, 'template');
  assert.ok(story.pages.length >= 6);
  assert.ok(story.pages.map((p) => p.text).join(' ').includes('Милена'));
});

test('провайдер завис — укладываемся в дедлайн и отдаём шаблон', async () => {
  const hang = () => {};
  const { providers, close } = await providersFor(hang, hang);
  const t0 = Date.now();
  const story = await generateStory(INPUT, { providers, health: createHealth(), log: quiet, deadlineMs: 5000, attemptTimeoutMs: 600 });
  close();
  assert.equal(story.source, 'template');
  assert.ok(Date.now() - t0 < 6000, `слишком долго: ${Date.now() - t0}ms`);
});

test('ключей нет вообще — шаблон, без ошибок', async () => {
  const story = await generateStory(INPUT, { providers: [], log: quiet });
  assert.equal(story.source, 'template');
});

test('упавший провайдер «остывает» и не тормозит следующие заказы', async () => {
  let hits = 0;
  const counting = (req, res) => { hits += 1; res.statusCode = 503; res.end('busy'); };
  const { providers, close } = await providersFor(counting, okReply(goodStory));
  const health = createHealth();
  await generateStory(INPUT, { providers, health, log: quiet });
  await generateStory(INPUT, { providers, health, log: quiet });
  close();
  assert.equal(hits, 1);
});

test('очередь: сбой раннера и переполнение — результат всё равно есть', async () => {
  const q = createJobQueue({
    runner: async () => { throw new Error('boom'); },
    fallback: buildTemplateStory,
    concurrency: 1,
    maxQueue: 0,
    log: quiet
  });
  const overflow = q.submit(INPUT);
  assert.equal(overflow.status, 'completed');

  const q2 = createJobQueue({ runner: async () => { throw new Error('boom'); }, fallback: buildTemplateStory, log: quiet });
  const job = q2.submit(INPUT);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(q2.get(job.id).status, 'completed');
  assert.equal(q2.get(job.id).result.source, 'template');
});

test('шаблон: мальчик и девочка, все темы, без «undefined»', () => {
  for (const gender of ['Девочка', 'Мальчик']) {
    for (const theme of ['Приключения', 'Сказка', 'Праздник / повод']) {
      const s = buildTemplateStory({ ...INPUT, gender, theme, occasion: 'День рождения' });
      const text = s.pages.map((p) => p.text).join('\n');
      assert.equal(s.pages.filter((p) => p.hero).length, 1);
      assert.ok(s.pages.every((p) => typeof p.scene === 'string' && p.scene));
      assert.equal(s.pages.length, 6);
      assert.ok(!/undefined|null|NaN/.test(text));
      assert.ok(text.includes('Милена'));
    }
  }
});
