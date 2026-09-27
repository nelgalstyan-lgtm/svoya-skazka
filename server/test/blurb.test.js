import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanBlurb, buildPrompt } from '../lib/story.js';
import { buildPlanPrompt } from '../lib/bigstory.js';

const good = 'Ани находит в старой книге карту, на которой отмечено место, где никто не бывал сто лет. Вместе с братом она отправляется по следу, но загадка оказывается хитрее, чем казалось, и отвечать на неё придётся самой.';

test('cleanBlurb: хорошая аннотация проходит, имя может быть в другом падеже', () => {
  assert.equal(cleanBlurb(good, 'Аня'), good);
  assert.equal(cleanBlurb(`  <b>${good}</b>  `, 'Аня'), good);
});

test('cleanBlurb: негодная аннотация отбрасывается, а не ломает книгу', () => {
  assert.equal(cleanBlurb('', 'Аня'), '');
  assert.equal(cleanBlurb('Коротко про Аню.', 'Аня'), '');
  assert.equal(cleanBlurb(good.replace(/Ани/g, 'Девочка'), 'Аня'), '', 'без имени героя');
  assert.equal(cleanBlurb(good + ' Как в игре Minecraft.', 'Аня'), '', 'латиница');
  assert.equal(cleanBlurb(good + ' Совсем как в Майнкрафте.', 'Аня'), '', 'чужой бренд');
  assert.equal(cleanBlurb(good.repeat(3), 'Аня'), '', 'слишком длинная');
});

test('аннотацию просят и в «Сказке», и в плане «Большой истории»', () => {
  const input = { name: 'Аня', gender: 'девочка', age: 7, theme: 'adventure' };
  assert.match(buildPrompt(input).system, /"blurb"/);
  assert.match(buildPlanPrompt(input).user, /"blurb"/);
});
