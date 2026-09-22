import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import template from '../../js/story-template.js';
import { buildPrompt, parseStory, generateStory } from '../lib/story.js';
import { buildProviders, createHealth } from '../lib/providers.js';

const { buildTemplateStory, sceneLibraryFor, occasionKind } = template;
const quiet = () => {};

test('occasionKind: узнаёт Новый год по ключевым словам, иначе — день рождения', () => {
  assert.equal(occasionKind('Новый год'), 'newyear');
  assert.equal(occasionKind('наряжаем ёлку 31 декабря'), 'newyear');
  assert.equal(occasionKind('Дед Мороз обещал приехать'), 'newyear');
  assert.equal(occasionKind('День рождения, 7 лет'), 'birthday');
  assert.equal(occasionKind(''), 'birthday');
  assert.equal(occasionKind('Первый день в садике'), 'birthday'); // повод вне первого набора — нейтральный праздничный вариант
});

test('sceneLibraryFor: у праздника свой набор сцен, у путешествия — старый', () => {
  const birthday = sceneLibraryFor('holiday', 'День рождения');
  assert.deepEqual(Object.keys(birthday.scenes), ['party_room', 'gift_pile', 'birthday_table', 'confetti_moment']);

  const newyear = sceneLibraryFor('holiday', 'Новый год');
  assert.deepEqual(Object.keys(newyear.scenes), ['tree_lights', 'snow_yard', 'fireplace_stockings', 'midnight_fireworks']);

  const adventure = sceneLibraryFor('adventure');
  assert.ok(Object.keys(adventure.scenes).includes('map_table'));
});

test('шаблон (локальный fallback): праздник — сцены зависят от повода, а не от темы «Путешествие»', () => {
  const birthday = buildTemplateStory({ name: 'Милена', gender: 'Девочка', theme: 'Праздник / повод', occasion: 'День рождения' });
  assert.ok(birthday.pages.every((p) => ['party_room', 'gift_pile', 'birthday_table', 'confetti_moment'].includes(p.scene)));

  const newyear = buildTemplateStory({ name: 'Милена', gender: 'Девочка', theme: 'Праздник / повод', occasion: 'Новый год' });
  assert.ok(newyear.pages.every((p) => ['tree_lights', 'snow_yard', 'fireplace_stockings', 'midnight_fireworks'].includes(p.scene)));
  assert.notDeepEqual(birthday.pages.map((p) => p.scene), newyear.pages.map((p) => p.scene));
});

test('промпт для ИИ: праздничные теги сцен, не приключенческие', () => {
  const { system } = buildPrompt({ name: 'Милена', gender: 'Девочка', theme: 'Праздник / повод', occasion: 'Новый год' });
  assert.ok(/tree_lights/.test(system));
  assert.ok(/midnight_fireworks/.test(system));
  assert.ok(!/map_table/.test(system), 'сцены темы «Путешествие» не должны попадать в промпт праздника');
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

test('parseStory: неверный тег в праздничной книге заменяется на праздничный, а не на приключенческий', () => {
  const library = sceneLibraryFor('holiday', 'Новый год');
  const raw = JSON.stringify({
    title: 'Милена встречает Новый год',
    pages: Array.from({ length: 6 }, (_, i) => ({
      text: `Страница ${i + 1}. Милена наряжала ёлку и радовалась снегу за окном, а вечером вся семья собралась вместе. ${'Это был самый тёплый и добрый праздник в году. '.repeat(9)}`,
      scene: i === 1 ? 'map_table' : 'tree_lights', // чужой тег из темы «Путешествие»
      hero: i === 4
    }))
  });
  const { pages } = parseStory(raw, 'Милена', library);
  assert.ok(Object.keys(library.scenes).includes(pages[1].scene));
  assert.notEqual(pages[1].scene, 'map_table');
});

test('короткая книга целиком: заказ праздника с Новым годом — провайдер получает праздничный промпт и книга проходит валидацию', async () => {
  const goodNewYearStory = JSON.stringify({
    title: 'Милена и новогоднее чудо',
    pages: Array.from({ length: 6 }, (_, i) => ({
      text: `Страница ${i + 1}. Милена смотрела на наряженную ёлку и слушала, как за окном тихо падает снег на весь двор. ${'Это был самый волшебный вечер в году, и все были рядом. '.repeat(9)}`,
      scene: 'tree_lights', hero: i === 4, heroBrief: 'The girl watches fireworks through a frosted window.'
    }))
  });
  const { server, url } = await mock(okReply(goodNewYearStory));
  const providers = buildProviders({ PROVIDER_ORDER: 'groq', GROQ_API_KEY: 'k', GROQ_BASE_URL: url, GROQ_MODELS: 'm1' });
  const story = await generateStory({ name: 'Милена', gender: 'Девочка', theme: 'Праздник / повод', occasion: 'Новый год' }, { providers, health: createHealth(), log: quiet });
  server.close();

  assert.equal(story.source, 'ai');
  assert.ok(story.pages.every((p) => ['tree_lights', 'snow_yard', 'fireplace_stockings', 'midnight_fireworks'].includes(p.scene)));
});
