import test from 'node:test';
import assert from 'node:assert/strict';
import { genitiveName, fixDialogue, cleanNoteText, normalizeChapterBlocks, normalizeBook } from '../lib/booktext.js';

test('имя в родительном падеже: «Из записей Артура», а не «Артур»', () => {
  const cases = [['Артур', false, 'Артура'], ['Милена', true, 'Милены'], ['Тигран', false, 'Тиграна'], ['Настя', true, 'Насти'],
    ['Мария', true, 'Марии'], ['Илья', false, 'Ильи'], ['Андрей', false, 'Андрея'], ['Игорь', false, 'Игоря'], ['Любовь', true, 'Любови'],
    ['Ника', true, 'Ники'], ['Маша', true, 'Маши'], ['Никита', false, 'Никиты'], ['Макс', false, 'Макса'], ['Ли', true, 'Ли']];
  for (const [n, girl, want] of cases) assert.equal(genitiveName(n, girl), want, n);
});

test('слова автора идут в одном абзаце с репликой, одно тире', () => {
  const out = fixDialogue([
    { t: 'p', text: '— Ты же только что починил огромные часы!' },
    { t: 'p', text: '— засмеялась Вера.' },
    { t: 'p', text: '- Правда? - спросил он.' },
    { t: 'p', text: '—— Нет.' },
    { t: 'p', text: '—Да.' }
  ]);
  assert.equal(out[0].text, '— Ты же только что починил огромные часы! — засмеялась Вера.');
  assert.equal(out[1].text, '— Правда? — спросил он.');
  assert.equal(out[2].text, '— Нет.');
  assert.equal(out[3].text, '— Да.');
  // точка перед словами автора превращается в запятую
  assert.equal(fixDialogue([{ t: 'p', text: '— Хорошо.' }, { t: 'p', text: '— сказала мама.' }])[0].text, '— Хорошо, — сказала мама.');
  // повествование, которое просто идёт после реплики, не склеивается
  assert.equal(fixDialogue([{ t: 'p', text: '— Хорошо.' }, { t: 'p', text: 'Мама вышла.' }]).length, 2);
});

test('записка: без «Из записей:» внутри и без повтора абзаца из текста', () => {
  assert.equal(cleanNoteText('«Из записей: Карта ведёт туда, где всё начиналось.»'), 'Карта ведёт туда, где всё начиналось.');
  assert.equal(cleanNoteText('Из записей Артура — Часы всегда правы'), 'Часы всегда правы');

  const body = Array.from({ length: 6 }, (_, i) => ({ t: 'p', text: `Абзац ${i} про часы и мельницу.` }));
  const dupNote = { t: 'note', label: 'Из записей Артур', text: 'Звук был очень близко, но это были не часы.' };
  const chapter = [...body, { t: 'p', text: 'Звук был очень близко, но это были не часы.' }, dupNote];

  // записка повторяет абзац → берём запасную фразу из плана
  const a = normalizeChapterBlocks(chapter, { name: 'Артур', girl: false, planNote: 'Часы идут, пока их слушают' });
  const note = a[a.length - 1];
  assert.equal(note.t, 'note');
  assert.equal(note.label, 'Из записей Артура');
  assert.equal(note.text, 'Часы идут, пока их слушают');

  // запасной фразы нет → записку убираем, а не показываем дубль
  const b = normalizeChapterBlocks(chapter, { name: 'Артур', girl: false });
  assert.ok(b.every((x) => x.t !== 'note'));
});

test('уже сохранённая книга исправляется при показе', () => {
  const book = { title: 'x', chapters: [{ n: 1, title: 'T', blocks: [
    ...Array.from({ length: 5 }, (_, i) => ({ t: 'p', text: `Абзац ${i}, в котором что-то происходит с героем.` })),
    { t: 'note', label: 'Из записей Артур', text: 'Из записей: Карта ведёт туда, где всё начиналось.' }
  ] }] };
  const fixed = normalizeBook(book, { name: 'Артур', girl: false });
  assert.deepEqual(fixed.chapters[0].blocks.at(-1), { t: 'note', label: 'Из записей Артура', text: 'Карта ведёт туда, где всё начиналось.' });
  assert.equal(book.chapters[0].blocks.at(-1).label, 'Из записей Артур', 'исходный объект не изменяется');
});

test('оформление по теме: море → канат, поиски и загадки → карта', async () => {
  const { inferFrame } = await import('../lib/booktext.js');
  const sea = { title: 'Пираты острова', chapters: [{ title: 'Корабль', blocks: [
    { t: 'p', text: 'Капитан вышел на палубу корабля, и море шумело. Парус надулся, волна ударила в борт, остров был близко.' },
    { t: 'p', text: 'Шторм, якорь, шхуна, лодка, пристань, штурвал.' }] }] };
  const mystery = { title: 'Тайна старых часов', chapters: [{ title: 'Чердак', blocks: [{ t: 'p', text: 'Артур нашёл карту и старый компас на чердаке.' }] }] };
  assert.equal(inferFrame(sea), 'rope');
  assert.equal(inferFrame(mystery), 'chart'); // нейтральная тайна: карта, а не морской канат
  assert.equal(normalizeBook({ ...mystery, frame: 'vine' }, { name: 'Артур' }).frame, 'vine', 'явно заданное оформление не меняется');
});

test('жанры путешествия: у каждого своё оформление и колонтитул', async () => {
  const { inferGenre, normalizeGenre, TRAVEL_STYLES } = await import('../lib/booktext.js');
  assert.equal(normalizeGenre('mystery'), 'treasure', 'старое название «поиски и загадки» = экспедиция');
  assert.equal(normalizeGenre('wild'), 'wild');
  assert.equal(normalizeGenre('что-то другое'), null);
  assert.deepEqual(TRAVEL_STYLES.sea, { frame: 'rope', footer: 'sea' });
  assert.deepEqual(TRAVEL_STYLES.treasure, { frame: 'chart', footer: 'treasure' });
  assert.deepEqual(TRAVEL_STYLES.wild, { frame: 'fern', footer: 'wild' });

  const mk = (text) => ({ title: 'Книга', chapters: [{ title: 'Глава', blocks: [{ t: 'p', text }] }] });
  assert.equal(inferGenre(mk('Клад, сундук, экспедиция, тайник, шифр и старая карта.')), 'treasure');
  assert.equal(inferGenre(mk('Волк оставил следы в лесу. Тропа вела в горы, у реки они разбили палатку и развели костёр в лесу у горы.')), 'wild');
  assert.equal(inferGenre(mk('Капитан вышел на палубу корабля, море шумело. Парус, шторм, остров, якорь, волна.')), 'sea');
  assert.equal(inferGenre(mk('Обычный день.')), 'universal');

  const fixed = normalizeBook(mk('Волк, следы, лес, тропа, горы, костёр, река, палатка, поход.'), { name: 'Ян' });
  assert.equal(fixed.footer, 'wild');
  assert.equal(fixed.frame, 'fern');
  assert.equal(normalizeBook({ ...mk('x'), footer: 'treasure' }, { name: 'Ян' }).footer, 'treasure', 'явно заданное сохраняется');
});

test('загадка в лесу и пещере — это «тайны и экспедиции», а не дикая природа', async () => {
  const { inferGenre, TRAVEL_STYLES } = await import('../lib/booktext.js');
  const mk = (text) => ({ title: 'Книга', chapters: [{ title: 'Глава', blocks: [{ t: 'p', text }] }] });
  // как в книге про часы: природы (лес, тропа, пещера) больше, но вся история — поиск детали механизма и старая карта
  const mixed = mk('Лес тропа пещера '.repeat(15) + 'Карта, тайна, загадка, механизм, ключ. '.repeat(4));
  assert.equal(inferGenre(mixed), 'treasure');
  // явная природа без загадки остаётся природой
  assert.equal(inferGenre(mk('Лес тропа волк следы костёр палатка '.repeat(4))), 'wild');
  // нейтральное оформление по умолчанию — карта и предметы, а не морское
  assert.deepEqual(TRAVEL_STYLES.universal, { frame: 'chart', footer: 'treasure' });
  assert.equal(normalizeBook(mk('Обычный день.'), { name: 'Ян' }).footer, 'treasure');
});
