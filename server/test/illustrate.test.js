import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHeroPrompt, pickStyleKey, imageRequest } from '../lib/illustrate.js';

// Промпты иллюстраций. Само рисование (OpenAI, R2, шаги Workflow) проверяется в worker/test/worker.test.js.

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

test('промпт: без brief всё равно собирается (запасное описание сцены)', () => {
  const prompt = buildHeroPrompt({ styleLabel: 'Акварель' });
  assert.ok(prompt.length > 100);
});

test('imageRequest: фото + лист персонажа; без фото — по листу; раскраска — по готовой картинке', () => {
  const photo = { mime: 'image/jpeg', bytes: new Uint8Array([1]) };
  const sheet = { mime: 'image/webp', bytes: new Uint8Array([2]) };
  assert.equal(imageRequest({ kind: 'scene' }), null, 'рисовать не по чему');
  assert.deepEqual(imageRequest({ refs: [photo], kind: 'sheet' }).images, [photo], 'лист рисуется только по фото');
  const scene = imageRequest({ refs: [photo], sheet, kind: 'scene', brief: 'x' });
  assert.deepEqual(scene.images, [photo, sheet], 'лист персонажа — последним');
  const redraw = imageRequest({ sheet, kind: 'scene', brief: 'x' });
  assert.ok(!/reference photo/.test(redraw.prompt), 'без фото лицо держит лист персонажа');
  assert.ok(/coloring page/.test(imageRequest({ kind: 'coloring', source: sheet }).prompt));
});
