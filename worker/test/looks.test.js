import test from 'node:test';
import assert from 'node:assert/strict';
import { splitLooks } from '../face.js';
import { genderMismatch, jobView } from '../view.js';

test('кто на фото: строка «Looks like» отделяется от примет, в рисунки не попадает', () => {
  assert.deepEqual(splitLooks('Oval face, long brown hair. Avoid: curls. Looks like: girl'), { face: 'Oval face, long brown hair. Avoid: curls.', looks: 'girl' });
  assert.deepEqual(splitLooks('Round face. Looks like: Boy.'), { face: 'Round face.', looks: 'boy' });
  assert.deepEqual(splitLooks('Round face. Looks like: unclear'), { face: 'Round face.', looks: '' });
  assert.deepEqual(splitLooks('Round face, no last line'), { face: 'Round face, no last line', looks: '' });
  assert.deepEqual(splitLooks(''), { face: '', looks: '' });
});

test('пол в анкете против фото: переспрашиваем только при явном расхождении и только на превью', () => {
  assert.equal(genderMismatch({ input: { gender: 'Мальчик' }, looks: 'girl' }), true);
  assert.equal(genderMismatch({ input: { gender: 'Девочка' }, looks: 'boy' }), true);
  assert.equal(genderMismatch({ input: { gender: 'Девочка' }, looks: 'girl' }), false);
  assert.equal(genderMismatch({ input: { gender: '' }, looks: 'girl' }), false);
  assert.equal(genderMismatch({ input: { gender: 'Мальчик' } }), false);
  const job = { id: 'x', status: 'completed', createdAt: 0, finishedAt: 1, input: { name: 'Миша', gender: 'Мальчик' }, looks: 'girl', result: { title: 'T', pages: [] } };
  assert.equal(jobView(job).photoLooks, 'girl');
  assert.equal(jobView({ ...job, paid: true }).photoLooks, undefined);
});
