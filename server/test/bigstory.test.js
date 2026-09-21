import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { buildProviders, createHealth } from '../lib/providers.js';
import { generateBigBook, validateChapter, fixImages } from '../lib/bigstory.js';

const INPUT = { name: 'Милена', age: '7', gender: 'Девочка', eyes: 'Серые', theme: 'Приключения', habits: 'Обожает собирать камни', friends: 'Тигран — лучший друг', cast: 'мама Лена, кот Барсик', interests: 'камни и карты' };
const quiet = () => {};

const planJson = {
  title: 'Милена и тайна серого камня',
  logline: 'Милена находит камень, который ведёт к старой карте.',
  motifs: ['серый камень', 'слово «на секундочку»'],
  dedication: { lead: 'Милене — самой любознательной девочке.', paragraphs: ['Пусть камни всегда приводят тебя к интересным историям.', 'Мы в тебя верим.'] },
  chapters: Array.from({ length: 6 }, (_, i) => ({
    n: i + 1, title: `Глава про камни ${i + 1}`, goal: 'Милена делает шаг вперёд и узнаёт что-то новое.',
    beats: ['Милена находит след', 'Тигран предлагает план', 'Они идут по тропинке', 'Появляется препятствие', 'Милена находит решение'],
    hook: 'Впереди ещё одна загадка.', note: 'Даже маленький камень может вести далеко',
    images: i === 5 ? [{ after_beat: 3, scene: 'forest_path', hero: true, brief: 'A girl on a path', caption: 'Дорога домой' }]
      : [{ after_beat: 2, scene: 'нет_такой_сцены', hero: i % 2 === 0, brief: 'A girl finds a stone', caption: 'Первая находка' }]
  }))
};

function chapterJson(n, { withImage = true } = {}) {
  const blocks = [];
  for (let i = 0; i < 30; i++) {
    blocks.push({ t: 'p', text: i % 3 === 0 ? `— Милена, посмотри, что там, — сказал Тигран, и они пошли дальше по тропинке ${n}.` : `Милена шагала по тропинке и внимательно смотрела под ноги, потому что камни бывают самыми разными.` });
    if (withImage && i === 10) blocks.push({ t: 'image', scene: 'forest_path', hero: true, brief: 'x', caption: 'Тропинка' });
  }
  blocks.push({ t: 'scrap', text: 'Камень серый.' });
  blocks.push({ t: 'note', label: 'Из записей Милены', text: 'Маленький шаг тоже шаг' });
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
        if (typeof out === 'number') { res.statusCode = out; res.end('busy'); return; }
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: out } }] }));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function providersFor(handler) {
  const a = await mockServer(handler);
  const providers = buildProviders({ PROVIDER_ORDER: 'groq', GROQ_API_KEY: 'k', GROQ_BASE_URL: a.url, GROQ_MODELS: 'm1' });
  return { providers, close: () => a.server.close() };
}

const chapterNo = (user) => Number((user.match(/ПИШИ ГЛАВУ (\d+)/) || [])[1]);

test('большая книга: план → 6 глав → картинки строго по плану, записка последней', async () => {
  const { providers, close } = await providersFor((user) => (/Это ПЛАН/.test(user) ? JSON.stringify(planJson) : chapterJson(chapterNo(user))));
  const steps = [];
  const r = await generateBigBook(INPUT, { providers, health: createHealth(), log: quiet, progress: (t) => steps.push(t) });
  close();

  assert.equal(r.source, 'ai');
  assert.equal(r.book.chapters.length, 6);
  assert.deepEqual(r.book.meta.fallbackChapters, []);
  assert.ok(steps.length >= 7, `ход работы: ${steps.length}`);

  for (const ch of r.book.chapters) {
    const last = ch.blocks[ch.blocks.length - 1];
    assert.equal(last.t, 'note', 'записка — последний блок главы');
    const imgs = ch.blocks.filter((b) => b.t === 'image');
    assert.equal(imgs.length, ch.n === 6 ? 1 : 1, `картинок в главе ${ch.n}`);
    assert.ok(imgs.every((im) => /^assets\/scenes\/[a-z_]+\.jpg$/.test(im.src) && im.caption));
    // картинка не первой и не последней в тексте — то есть «внутри» сцены
    const idx = ch.blocks.findIndex((b) => b.t === 'image');
    assert.ok(idx > 1 && idx < ch.blocks.length - 2);
  }
  assert.ok(r.book.dedication.lead && r.book.dedication.paragraphs.length);
});

test('если глава не получилась ни у одного провайдера — она собирается из плана, остальные от ИИ', async () => {
  const { providers, close } = await providersFor((user) => {
    if (/Это ПЛАН/.test(user)) return JSON.stringify(planJson);
    return chapterNo(user) === 3 ? 'не JSON вообще' : chapterJson(chapterNo(user));
  });
  const r = await generateBigBook(INPUT, { providers, health: createHealth(), log: quiet, stepDeadlineMs: 6000 });
  close();
  assert.deepEqual(r.book.meta.fallbackChapters, [3]);
  assert.equal(r.book.chapters.length, 6);
  assert.equal(r.book.chapters[2].blocks[r.book.chapters[2].blocks.length - 1].t, 'note');
  assert.ok(r.book.chapters[2].blocks.some((b) => b.t === 'p'));
});

test('план не получился — клиент всё равно получает книгу из шаблона', async () => {
  const { providers, close } = await providersFor(() => 503);
  const r = await generateBigBook(INPUT, { providers, health: createHealth(), log: quiet, stepDeadlineMs: 5000 });
  close();
  assert.equal(r.source, 'template');
  assert.ok(r.book.chapters.length >= 1);
  assert.ok(r.book.chapters.every((c) => c.blocks.some((b) => b.t === 'p')));
});

test('без ключей — книга из шаблона без ошибок', async () => {
  const r = await generateBigBook(INPUT, { providers: [], log: quiet });
  assert.equal(r.source, 'template');
});

test('проверка главы: чужие символы, латиница и короткий текст отклоняются', () => {
  const plan = planJson.chapters[0];
  const ok = chapterJson(1);
  assert.doesNotThrow(() => validateChapter(ok, { ...plan, n: 1 }, 'Милена'));
  assert.throws(() => validateChapter(ok.replace('тропинке', 'тро向пинке'), { ...plan, n: 1 }, 'Милена'), /foreign/);
  assert.throws(() => validateChapter(ok.replace('камни', 'obsidian'), { ...plan, n: 1 }, 'Милена'), /latin/);
  assert.throws(() => validateChapter(JSON.stringify({ blocks: [{ t: 'p', text: 'Коротко.' }] }), { ...plan, n: 1 }, 'Милена'), /paragraphs|short/);
});

test('картинка не разрывает вопрос и ответ', () => {
  const blocks = [];
  for (let i = 0; i < 12; i++) blocks.push({ t: 'p', text: `Абзац номер ${i} про камни и тропинку.` });
  blocks[5] = { t: 'p', text: 'Ты уверен?' };
  blocks[6] = { t: 'p', text: '— Абсолютно.' };
  const planCh = { n: 2, beats: ['a', 'b', 'c', 'd'], note: 'запись', images: [{ after_beat: 2, scene: 'forest_path', hero: false, brief: '', caption: 'x' }] };
  // модель поставила картинку после вопроса (позиция = 6 блоков до неё)
  const withImg = [...blocks.slice(0, 6), { t: 'image', scene: 'forest_path' }, ...blocks.slice(6)];
  const out = fixImages(withImg, planCh, 'Милена');
  const i = out.findIndex((b) => b.t === 'image');
  assert.equal(out[i - 1].text, '— Абсолютно.', 'картинка после ответа, а не между вопросом и ответом');
});

test('повторы фирменных фраз ловятся, имена из анкеты не считаются', async () => {
  const { repeatedPhrases, nameTokens } = await import('../lib/bigstory.js');
  const names = nameTokens({ name: 'Милена', friends: 'Тигран', cast: 'кот Барсик' });
  const blocks = [];
  for (let i = 0; i < 5; i++) blocks.push({ t: 'p', text: `— На секундочку, — сказал Тигран. Барсик, важный, как король, шагнул вперёд. Милена улыбнулась.` });
  const found = repeatedPhrases(blocks, names).join(' ');
  assert.match(found, /на секундочку/);
  assert.match(found, /важный как король/);
  assert.doesNotMatch(found, /тигран|барсик|милена/);
  assert.deepEqual(repeatedPhrases([{ t: 'p', text: 'Один раз сказал Тигран и пошёл дальше по дороге.' }], names), []);
});

test('жанр из плана выбирает оформление книги', async () => {
  for (const [genre, frame, footer] of [['sea', 'rope', 'sea'], ['treasure', 'chart', 'treasure'], ['wild', 'fern', 'wild'], ['mystery', 'chart', 'treasure']]) {
    const { providers, close } = await providersFor((user) => (/Это ПЛАН/.test(user) ? JSON.stringify({ ...planJson, genre }) : chapterJson(chapterNo(user))));
    const r = await generateBigBook(INPUT, { providers, health: createHealth(), log: quiet });
    close();
    assert.equal(r.book.frame, frame, genre);
    assert.equal(r.book.footer, footer, genre);
  }
});
