import test from 'node:test';
import assert from 'node:assert/strict';
import { genitiveName, fixDialogue, cleanNoteText, normalizeChapterBlocks, normalizeBook, ageVoiceRule, signatureName, dedicationFor, fixMixedScript } from '../lib/booktext.js';
import { buildPrompt } from '../lib/story.js';
import { buildPlanPrompt, buildChapterPrompt } from '../lib/bigstory.js';

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

test('возрастные группы и оформление путешествия по возрасту', async () => {
  const { ageGroupFor, styleFor, TRAVEL_STYLES } = await import('../lib/booktext.js');
  assert.deepEqual([3, 4, 5, 10, 11, 16].map(ageGroupFor), ['0-4', '0-4', '5-10', '5-10', '11-16', '11-16']);
  assert.equal(ageGroupFor(undefined), '5-10');
  assert.equal(ageGroupFor(''), '5-10');
  // 5–10 (и пока 0–4): яркие рамки; 11–16 и старые книги без возраста — «Пергамент»
  assert.deepEqual(styleFor('treasure', '5-10'), { frame: 'pirates', footer: 'pirates' });
  assert.deepEqual(styleFor('wild', '0-4'), { frame: 'jungle', footer: 'jungle' });
  assert.deepEqual(styleFor('sea', '11-16'), TRAVEL_STYLES.sea);
  assert.deepEqual(styleFor('wild', undefined), TRAVEL_STYLES.wild);
  // праздник и сказка от возраста пока не зависят
  assert.deepEqual(styleFor('birthday', '5-10'), TRAVEL_STYLES.birthday);
});

test('правило возраста: своё для малыша, дошкольника, школьника и подростка — и всегда про живой язык', () => {
  const rules = [3, 6, 9, 13, undefined].map(ageVoiceRule);
  assert.equal(new Set(rules).size, rules.length);
  assert.match(rules[0], /читают ему вслух/);
  assert.match(rules[1], /перед сном/);
  assert.match(rules[3], /подросток/);
  for (const r of rules) assert.match(r, /не бедность/);
});

test('правило возраста попадает в промпты «Сказки» и «Большой истории»', () => {
  const input = { name: 'Макс', gender: 'мальчик', age: '4', theme: 'приключения' };
  assert.match(buildPrompt(input).user, /малыш 4 лет/);
  assert.match(buildPlanPrompt(input).user, /малыш 4 лет/);
  const plan = { title: 'Т', logline: 'Л', motifs: ['м'], chapters: [{ n: 1, title: 'Г', goal: 'ц', beats: ['с'], hook: 'х', note: 'з', images: [] }] };
  assert.match(buildChapterPrompt(input, plan, 0, [], []).user, /малыш 4 лет/);
});

test('shortDedication: посвящение «Сказки» по поводу и полу, без выдуманных фактов', async () => {
  const { shortDedication, dedicationFor } = await import('../lib/booktext.js');
  // лист «Посвящается» — имя в дательном падеже
  assert.match(shortDedication({ name: 'Макс', gender: 'Мальчик' }).lead, /^Максу — главному герою этой сказки, с любовью\.$/);
  assert.match(shortDedication({ name: 'Аня', gender: 'Девочка', occasion: 'день рождения' }).lead, /^Ане — имениннице/);
  assert.equal(shortDedication({ name: 'Аня', gender: 'Девочка', occasion: 'Новый год' }).lead, 'Ане, нашей волшебнице, — с Новым годом!');
  const d = dedicationFor({ name: 'Макс', from: 'мама' }, shortDedication({ name: 'Макс', gender: 'Мальчик', from: 'мама' }));
  assert.equal(d.signature, 'С любовью,\nмама');
  assert.equal(d.lead, 'Максу — главному герою этой сказки.', 'с подписью «С любовью» не повторяем');
  assert.equal(d.paragraphs.length, 2);
  const own = dedicationFor({ dedication: 'Наше слово' }, shortDedication({ name: 'Макс' }));
  assert.equal(own.lead, 'Наше слово');
});

test('имя в дательном падеже: «Посвящается Максу», а не «Макс»', async () => {
  const { dativeName } = await import('../lib/booktext.js');
  const cases = [['Макс', false, 'Максу'], ['Тигран', false, 'Тиграну'], ['Милена', true, 'Милене'], ['Никита', false, 'Никите'],
    ['Настя', true, 'Насте'], ['Илья', false, 'Илье'], ['Мария', true, 'Марии'], ['Андрей', false, 'Андрею'], ['Игорь', false, 'Игорю'],
    ['Любовь', true, 'Любови'], ['Маша', true, 'Маше'], ['Ника', true, 'Нике'], ['Нико', false, 'Нико'], ['Эстер', true, 'Эстер']];
  for (const [n, girl, want] of cases) assert.equal(dativeName(n, girl), want, n);
});

test('подпись посвящения: «от кого» в именительном падеже, подпись из поля посвящения', () => {
  assert.equal(signatureName('Дяди'), 'Дядя');
  assert.equal(signatureName('от дяди Вазгена'), 'дядя Вазген');
  assert.equal(signatureName('мамы и папы'), 'мама и папа');
  assert.equal(signatureName('от Аделины и Аэлиты'), 'Аделина и Аэлита');
  assert.equal(signatureName('от брата Андрея'), 'брат Андрей');
  assert.equal(signatureName('мама, папа и Аэлита'), 'мама, папа и Аэлита');
  assert.equal(signatureName('дядя Миша'), 'дядя Миша');
  const d = dedicationFor({ from: 'Дяди', dedication: 'С любовью, Вазген' }, { lead: 'Неле', paragraphs: [] });
  assert.equal(d.signature, 'С любовью,\nДядя Вазген');
  assert.equal(d.lead, 'Неле', 'подпись в поле посвящения не становится текстом посвящения');
});

test('латинские буквы-двойники в русских словах меняются на кириллицу, английский текст не трогаем', () => {
  assert.equal(fixMixedScript('Nеля держала руку'), 'Неля держала руку');
  assert.equal(fixMixedScript('Lusеchka stands by a window'), 'Lusеchka stands by a window');
  assert.equal(fixMixedScript('кoфе и шоколад'), 'кофе и шоколад');
});
