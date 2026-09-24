import test from 'node:test';
import assert from 'node:assert/strict';
import { brandMentions, parseStory, buildPrompt } from '../lib/story.js';
import { buildPlanPrompt } from '../lib/bigstory.js';

test('чужие бренды находятся в любом падеже, обычные слова и имена — нет', () => {
  assert.deepEqual(brandMentions('Он строил дом в Майнкрафте, а потом собирал ЛЕГО.'), ['майнкрафт', 'лего']);
  assert.deepEqual(brandMentions('Человек-паук и Супермена он любил больше всех'), ['человек-паук', 'супермен']);
  assert.deepEqual(brandMentions('Милена легонько коснулась камня, а Эльза засмеялась.'), []);
});

test('короткая книга с брендом в тексте отклоняется — её перепишет другой провайдер', () => {
  const page = (t) => ({ text: `${t} ${'Милена шла по лесу и слушала, как шумят высокие сосны над головой. '.repeat(3)}`, scene: 'forest_path', heroBrief: 'x' });
  const raw = JSON.stringify({ title: 'Милена', pages: [page('Милена открыла Майнкрафт.'), page('Дальше.'), page('Ещё.'), page('Конец.')] });
  assert.throws(() => parseStory(raw, 'Милена'), /brand names/);
});

test('в промптах есть правило оригинальности, задача книги и продолжение', () => {
  const input = { name: 'Милена', theme: 'Приключения', lesson: 'Боится темноты', sequel: 'Первая книга — «Тайна камня».' };
  const short = buildPrompt(input);
  assert.ok(/Никаких брендов/.test(short.system));
  assert.ok(/Задача книги: Боится темноты/.test(short.user));
  assert.ok(/Продолжение: Первая книга/.test(short.user));
  const plan = buildPlanPrompt(input);
  assert.ok(/Оригинальность: Никаких брендов/.test(plan.system));
  assert.ok(/Боится темноты/.test(plan.user) && /Тайна камня/.test(plan.user));
});
