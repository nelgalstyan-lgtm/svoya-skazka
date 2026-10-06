// Правила русской типографики и «записок» для готовой книги. Применяются и к новым книгам, и к уже сохранённым.

import template from '../../js/story-template.js';

const FEMALE_GUESS = /[аяАЯ]$/;

/** Имя в родительном падеже: «Артур» → «Артура», «Милена» → «Милены», «Настя» → «Насти». */
export function genitiveName(name, girl) {
  const n = String(name || '').trim();
  if (!n) return n;
  const female = typeof girl === 'boolean' ? girl : FEMALE_GUESS.test(n);
  const last = n.slice(-1);
  const stem = n.slice(0, -1);

  if (/[гкхжчшщ]а$/i.test(n)) return stem + 'и';                 // Ника → Ники, Маша → Маши
  if (/ия$/i.test(n)) return stem + 'и';                          // Мария → Марии
  if (/[аА]$/.test(n)) return stem + 'ы';                         // Милена → Милены, Никита → Никиты
  if (/[яЯ]$/.test(n)) return stem + 'и';                         // Настя → Насти, Илья → Ильи
  if (/[йЙ]$/.test(n)) return stem + 'я';                         // Андрей → Андрея
  if (/[ьЬ]$/.test(n)) return female ? stem + 'и' : stem + 'я';   // Любовь → Любови, Игорь → Игоря
  if (/[бвгджзклмнпрстфхцчшщ]$/i.test(n)) return female ? n : n + 'а'; // Артур → Артура; Ольгерд → Ольгерда
  return n;                                                       // иностранные и несклоняемые имена
}

/** Имя в дательном падеже (для «Посвящается …»): «Макс» → «Максу», «Милена» → «Милене», «Мария» → «Марии». */
export function dativeName(name, girl) {
  const n = String(name || '').trim();
  if (!n) return n;
  const female = typeof girl === 'boolean' ? girl : FEMALE_GUESS.test(n);
  const stem = n.slice(0, -1);

  if (/ия$/i.test(n)) return stem + 'и';                          // Мария → Марии
  if (/[аяАЯ]$/.test(n)) return stem + 'е';                       // Милена → Милене, Никита → Никите, Настя → Насте
  if (/[йЙ]$/.test(n)) return stem + 'ю';                         // Андрей → Андрею
  if (/[ьЬ]$/.test(n)) return female ? stem + 'и' : stem + 'ю';   // Любовь → Любови, Игорь → Игорю
  if (/[бвгджзклмнпрстфхцчшщ]$/i.test(n)) return female ? n : n + 'у'; // Макс → Максу; Ольгерд → Ольгерду
  return n;                                                       // иностранные и несклоняемые имена
}

const letters = (s) => String(s || '').toLowerCase().replace(/[^а-яёa-z0-9]+/g, ' ').trim();

/** Один и тот же текст (или один содержится в другом). */
export function isDuplicate(a, b) {
  const x = letters(a);
  const y = letters(b);
  if (x.length < 12 || y.length < 12) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Тире и реплики:
 *  — дефис/короткое тире в начале реплики → «— »;
 *  — слова автора отдельным абзацем («— засмеялась Вера.») присоединяются к реплике перед ними.
 */
// Модели иногда пишут русское слово латинскими буквами-двойниками: «Nеля», «Lusеchka» (Groq, 05.10). В русском слове
// латиница меняется на кириллицу; слова целиком на латинице не трогаем (их отсекают проверки текста).
const LAT_TO_CYR = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', N: 'Н', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У',
  a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у', k: 'к', m: 'м' };
export function fixMixedScript(text) {
  return String(text ?? '').replace(/[A-Za-zА-Яа-яЁё]+/g, (word) => {
    const cyr = (word.match(/[А-Яа-яЁё]/g) || []).length;
    const lat = word.length - cyr;
    if (!cyr || !lat || cyr < lat) return word; // по-английски (в описаниях картинок) — не наше дело
    return word.replace(/[A-Za-z]/g, (ch) => LAT_TO_CYR[ch] || ch);
  });
}

export function fixDialogue(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.t !== 'p') { out.push(b); continue; }
    const text = String(b.text)
      .replace(/^[-–―]+\s*/, '— ')
      .replace(/^—\s*—+\s*/, '— ')
      .replace(/^—(?=\S)/, '— ')
      .replace(/\s+[-–―]\s+/g, ' — ');
    const prev = out[out.length - 1];
    if (prev && prev.t === 'p' && /^—\s/.test(prev.text) && /^—\s+[а-яё]/.test(text)) {
      prev.text = prev.text.replace(/\s+$/, '').replace(/(?<!\.)\.$/, ',') + ' ' + text; // «часы.» + «— сказала» → «часы, — сказала»
      continue;
    }
    out.push({ ...b, text });
  }
  return out;
}

/** Текст записки без повторов подписи: «Из записей: Карта ведёт домой» → «Карта ведёт домой». */
export function cleanNoteText(text) {
  return String(text || '')
    .replace(/^[«"„\s]*из\s+записей(?=[\s:—\-–])[^:—\-–]*[:—\-–]\s*/i, '') // \b с кириллицей в JS не работает
    .replace(/^[«"„\s]+|[»"“\s]+$/g, '')
    .trim();
}

/**
 * Приводит главу в порядок: реплики, подпись записки («Из записей Артура»), текст без дублей.
 * Записка не должна повторять абзац из конца главы: заменяем её на запасную фразу из плана или убираем.
 */
export function normalizeChapterBlocks(blocks, { name, girl, planNote } = {}) {
  const fixed = fixDialogue(blocks);
  const noteIndex = fixed.map((b) => b.t).lastIndexOf('note');
  const rest = fixed.filter((b) => b.t !== 'note');
  if (noteIndex === -1) return rest;

  // «Из альбома …» — своя подпись у книг малышей, собранных вручную (Аделина, 06.10): её не трогаем
  const own = String(fixed[noteIndex].label || '');
  const label = /^Из альбома /.test(own) ? own : `Из записей ${genitiveName(name, girl)}`.trim();
  let text = cleanNoteText(fixed[noteIndex].text);
  const recent = rest.filter((b) => b.t === 'p').slice(-5).map((b) => b.text);
  const dup = (t) => !t || recent.some((p) => isDuplicate(t, p));

  if (dup(text)) {
    const alt = cleanNoteText(planNote);
    text = alt && !dup(alt) ? alt : '';
  }
  return text ? [...rest, { t: 'note', label, text }] : rest;
}

// Оформление «Пергамент» по теме+жанру книги: боковая отделка + колонтитул.
// Название сохранено историческим (изначально было только для «Путешествия»), но теперь шире.
export const TRAVEL_STYLES = {
  sea: { frame: 'rope', footer: 'sea' },            // морская история: канат, розы ветров
  treasure: { frame: 'chart', footer: 'treasure' }, // экспедиции и поиск сокровищ: карта, ряд предметов
  wild: { frame: 'fern', footer: 'wild' },          // дикая природа, джунгли, суша: папоротник с лозой, следы
  universal: { frame: 'chart', footer: 'treasure' }, // жанр не определён (нейтральная тайна, загадка): карта и предметы исследователя
  birthday: { frame: 'ribbon', footer: 'birthday' }, // день рождения: лента с флажками, воздушные шары
  newyear: { frame: 'cookies', footer: 'cookies' },  // новый год, «Пряничное»: рамка из пряников и конфет по периметру
  newyear_elves: { frame: 'elves', footer: 'elves' }, // новый год, «Эльфийское»: эльфы и подарки — выбирает заказчик
  kingdom: { frame: 'vine', footer: 'kingdom' },     // сказка — королевство: готовая золотая лоза с виноградом (была не задействована)
  forest: { frame: 'leaf', footer: 'forest' },       // сказка — заколдованный лес: листва на тёмной зелени
  underwater: { frame: 'wave', footer: 'underwater' } // сказка — подводное царство: пузыри и волны на глубоком бирюзовом
};

const clip = (s, n) => String(s ?? '').replace(/<[^>]*>/g, '').trim().slice(0, n);

/** Дата подписи посвящения: «26.09.2026». */
export function dedicationDate(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(date.getDate())}.${p(date.getMonth() + 1)}.${date.getFullYear()}`;
}

// «От кого» пишут по-разному: «дядя», «от дяди», «Дяди», «мамы и папы» — подпись всегда «С любовью, дядя / мама и папа»
const SIGN_WORDS = {
  дяди: 'дядя', тёти: 'тётя', тети: 'тетя', мамы: 'мама', папы: 'папа', мамочки: 'мамочка', папочки: 'папочка',
  бабушки: 'бабушка', дедушки: 'дедушка', бабули: 'бабуля', дедули: 'дедуля', деда: 'дед', бабы: 'баба',
  брата: 'брат', братика: 'братик', сестры: 'сестра', сестрёнки: 'сестрёнка', сестренки: 'сестренка',
  крёстной: 'крёстная', крестной: 'крестная', крёстного: 'крёстный', крестного: 'крестный',
  родителей: 'родители', друзей: 'друзья', семьи: 'семья', подруги: 'подруга', друга: 'друг',
  твоей: 'твоя', твоего: 'твой', твоих: 'твои', вашей: 'ваша', вашего: 'ваш', любящей: 'любящая', любящего: 'любящий', любящих: 'любящие'
};
// имена после «от» или после родственника в родительном падеже — тоже в именительный:
// «от дяди Вазгена» → «дядя Вазген», «Андрея» → «Андрей», «от Аделины и Ани» → «Аделина и Аня», «Ольги» → «Ольга»
function nominativeName(tok) {
  if (/(лл|нн|мм|сс|тт)и$/.test(tok)) return tok; // Нелли, Элли, Энни — не склоняются
  if (/[бвгджзклмнпрстфхцчшщ]а$/.test(tok)) return tok.slice(0, -1);
  if (/[аеиоуэюя]я$/.test(tok)) return tok.slice(0, -1) + 'й';
  if (/[иь]и$/.test(tok)) return tok.slice(0, -1) + 'я'; // Нелии → Нелия, Марии → Мария, Ильи → Илья
  if (/ы$/.test(tok)) return tok.slice(0, -1) + 'а';
  if (/[гкхжшчщ]и$/.test(tok)) return tok.slice(0, -1) + 'а';
  if (/[бвдзлмнпрстф]и$/.test(tok)) return tok.slice(0, -1) + 'я';
  return tok;
}

function keepCase(src, word) { return src[0] === src[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word; }

export function signatureName(raw) {
  let text = clip(raw, 80).replace(/^с\s+любовью[,!.\s]*/i, '').replace(/[.!]+$/, '').trim();
  let genitive = /^от\s+/i.test(text);
  text = text.replace(/^от\s+/i, '');
  return text.split(/(\s+|,)/).map((tok) => {
    const word = SIGN_WORDS[tok.toLowerCase()];
    if (word) { genitive = true; return keepCase(tok, word); }
    if (genitive && /^[А-ЯЁ][а-яё]+$/.test(tok)) return nominativeName(tok);
    return tok;
  }).join('');
}

/**
 * Подпись и своё посвящение из анкеты. Если в «своё посвящение» вписали только подпись («С любовью, Вазген»),
 * это подпись, а не посвящение: имя добавляется к «От кого» («дядя Вазген»), текст посвящения пишем мы.
 */
export function dedicationParts(input = {}) {
  let from = signatureName(input.from);
  let own = clip(input.dedication, 1200);
  const m = /^с\s+любовью[,!.\s]+([^\n.!?]{1,40}?)[.!]?$/i.exec(own.trim());
  if (m) {
    const who = signatureName(m[1]);
    if (!from) from = who;
    else if (!from.toLowerCase().includes(who.toLowerCase())) from = `${from} ${who}`;
    own = '';
  }
  return { from, own };
}

/**
 * Посвящение книги с учётом анкеты: input.from — от кого книга («мама и папа», «твоя Неля») — становится подписью
 * «С любовью, …»; input.dedication — своё посвящение родителей (абзацы через пустую строку) заменяет текст ИИ.
 * base — посвящение, которое написал ИИ или шаблон ({ lead, paragraphs }); null — если его нет («Сказка»).
 * Возвращает null, если посвящения нет и родители ничего не написали.
 */
export function dedicationFor(input = {}, base = null, date = new Date()) {
  const parts = dedicationParts(input);
  const from = parts.from;
  const own = parts.own.split(/\n\s*\n|\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
  if (!base && !from && !own.length) return null;
  const d = { title: 'Посвящается', lead: base?.lead || '', paragraphs: base?.paragraphs || [] };
  if (own.length) {
    // лист называется «Посвящается» — первой строкой должно быть, кому («Люсечке — главной героине…»). Если родители
    // написали пожелание без имени («Будь всегда такой красивой»), оно идёт после этой строки, а не вместо неё (05.10)
    const c = template.normalizeInput(input);
    const named = c.name && own[0].toLowerCase().includes(dativeName(c.name, c.girl).toLowerCase()); // уже «Люсечке …»
    const sentence = (t) => (/[.!?…»)]$/.test(t) ? t : `${t}.`);
    const mine = own.map(sentence);
    if (named || !base?.lead) { d.lead = mine[0]; d.paragraphs = mine.slice(1); } else { d.lead = base.lead; d.paragraphs = mine; }
  }
  if (from) { d.signature = `С любовью,\n${from}`; d.date = dedicationDate(date); }
  return d;
}

/**
 * Посвящение «Сказки», если родители не написали своё (анкета обещает: «тёплые слова напишем мы — от вашего имени»):
 * одна фраза с именем по поводу книги и два коротких абзаца без выдуманных фактов. Подпись «С любовью, …» и своё
 * посвящение добавляет dedicationFor.
 */
export function shortDedication(input = {}) {
  const c = template.normalizeInput(input);
  // лист называется «Посвящается» — имя в дательном падеже: «Посвящается Максу — главному герою этой сказки»
  const name = c.name ? dativeName(c.name, c.girl) : 'Тебе';
  const occ = c.kind === 'holiday' ? template.holidayKind(c.occasion) : template.occasionKind(c.occasion);
  const love = dedicationParts(input).from ? '.' : ', с любовью.'; // с подписью «С любовью, …» не повторяем
  const lead = occ === 'birthday' ? `${name} — ${c.girl ? 'имениннице' : 'имениннику'} в день рождения${love}`
    : occ === 'newyear' ? `${name} — ${c.girl ? 'главной героине' : 'главному герою'} этой новогодней сказки${love}`
    : `${name} — ${c.girl ? 'главной героине' : 'главному герою'} этой сказки${love}`;
  return { lead, paragraphs: ['Эта сказка написана специально для тебя. Пусть в ней будет много чудес, смеха и тепла.', 'Возвращайся к ней снова и снова — она всегда будет тебя ждать.'] };
}

/**
 * Кто на иллюстрациях (решения владелицы 30.09 и 05.10): из людей — только ребёнок; родные — только если загружены
 * их фото (до 3 родных: в «Большой истории» первый бесплатно, второй и третий — +290 ₽; в «Сказке» — +290 ₽). В тексте близкие остаются как были.
 */
export function illustrationPeopleRule(input = {}) {
  const family = Array.isArray(input.family) ? input.family.filter((p) => p && p.who).slice(0, 3) : [];
  const base = 'из людей на картинке — только сам ребёнок';
  if (!family.length) return `${base}: родителей, братьев и сестёр, друзей и других людей не рисуем, даже если они есть в сцене (в тексте они остаются), а питомцы, животные, игрушки и сказочные существа — можно`;
  const list = family.map((p) => [p.who, p.name].filter(Boolean).join(' ')).join(', ');
  return `${base} и его близкие, которых мы рисуем по фото: ${list}; в нескольких сценах, где они участвуют по сюжету, назови их в описании по-английски (например, "the mother", "the grandfather"); других людей (друзей, прохожих) не рисуем, а питомцы, животные и сказочные существа — можно`;
}

/** Возрастная группа по возрасту ребёнка: 0–4, 5–10, 11–16. Возраст не указан — самая массовая, 5–10. */
/**
 * Как писать для возраста из анкеты. Простота — в длине фраз и выборе тем, а не в бедности языка:
 * текст должен звучать как у хорошего детского писателя, а не как упрощённый пересказ.
 */
export function ageVoiceRule(age) {
  const a = Number(age);
  const common = 'Простота здесь — не бедность: точные глаголы, одна живая деталь в каждой сцене, интонация, которую приятно читать вслух. Никаких общих слов и штампов («невероятное приключение», «сердце наполнилось радостью», «волшебный мир»), никаких нравоучений в конце.';
  if (!Number.isFinite(a) || a <= 0) return `Возраст не указан: пиши так, чтобы книгу с удовольствием слушал шестилетний и не заскучал девятилетний. ${common}`;
  if (a <= 4) return `Слушатель — малыш ${a} лет, книгу читают ему вслух. Фразы короткие и ясные, но живые: звукоподражания, одна повторяющаяся фраза-припев на всю книгу, знакомый мир (дом, игрушки, питомец, мама и папа). На странице одно понятное событие. Ничего страшного: препятствие мягкое и решаемое. ${common}`;
  if (a <= 7) return `Слушатель — ребёнок ${a} лет, книгу обычно читают вслух родители. Много диалога, смешные реплики и юмор ситуаций. Незнакомое слово можно, если его смысл понятен из сцены. Лёгкое напряжение допустимо, но без жути: книгу читают перед сном, поэтому главы и страницы заканчиваются любопытством, а не страхом. ${common}`;
  if (a <= 10) return `Читатель — ребёнок ${a} лет, читает сам или вместе со взрослым. Живой литературный язык без сюсюканья и лишних уменьшительных. Настоящая загадка с подсказками, которые читатель может заметить раньше героя; герой думает сам, ошибается и находит выход. Юмор и лёгкая ирония взрослых персонажей. ${common}`;
  return `Читатель — подросток ${a} лет. Никакого сюсюканья, уменьшительных слов и обращений «малыш». Язык хорошей подростковой прозы: ирония, мысли героя, сомнения и выбор, уважение к читателю. Герой ведёт себя на свой возраст, не младше. ${common}`;
}

/**
 * Как вплести повод в историю выбранной темы (приключение или сказка). Повод — не отдельный жанр:
 * книга остаётся приключением или сказкой, а день рождения, Новый год или своё событие становятся её частью.
 * kind — из occasionKind: 'birthday' | 'newyear' | 'other' | ''. Пустая строка — повода нет.
 */
export function occasionRule(kind, occasion = '') {
  if (kind === 'birthday') return 'Повод — день рождения героя. История остаётся приключением или сказкой по выбранной теме и происходит в день рождения или накануне: праздник — тёплый фон и финал (свечи, торт, близкие из анкеты), а не сюжет «праздник чуть не сорвался». Возраст цифрой не называй.';
  if (kind === 'newyear') return 'Повод — Новый год. История остаётся приключением или сказкой по выбранной теме, но идёт в зимние праздники: снег, ёлка, огни, новогодняя ночь; новогоднее волшебство вплетено в сюжет, финал — встреча Нового года с близкими из анкеты. Главный герой — ребёнок, а не Дед Мороз.';
  if (kind === 'other' && occasion) return `Повод — «${occasion}». Книгу дарят к этому событию: история остаётся приключением или сказкой по выбранной теме, но мягко связана с ним — герой проживает похожую ситуацию или событие становится частью сюжета, и финал поддерживает ребёнка. Без морали в лоб и без слов «ты должен».`;
  return '';
}

export function ageGroupFor(age) {
  const a = Number(age);
  if (!Number.isFinite(a) || a <= 0) return '5-10';
  if (a <= 4) return '0-4';
  if (a <= 10) return '5-10';
  return '11-16';
}

// Оформление по возрасту. «Пергамент» (TRAVEL_STYLES) — взрослее, для 11–16; для 5–10 (и пока для 0–4, у них своего нет)
// путешествие оформлено яркими иллюстрированными рамками: пираты и карта сокровищ, джунгли-сафари.
const PIRATES = { frame: 'pirates', footer: 'pirates' };
const AGE_STYLES = { '5-10': { sea: PIRATES, treasure: PIRATES, universal: PIRATES, wild: { frame: 'jungle', footer: 'jungle' } } };

/** Рамка+колонтитул для жанра с учётом возраста; если для группы отдельного оформления нет — общее. */
export function styleFor(genre, ageGroup) {
  const group = ageGroup === '0-4' ? '5-10' : ageGroup;
  return (AGE_STYLES[group] && AGE_STYLES[group][genre]) || TRAVEL_STYLES[genre];
}

const SEA_WORDS = /(море|моря|морю|морем|морск|корабл|парус|остров|пират|шторм|капитан|якор|шхун|волн[аыуе]|лодк|пристан|штурвал|маяк)/gi;
const TREASURE_WORDS = /(клад|сокровищ|экспедиц|ключ|сундук|тайник|шифр|компас|карту|карты|карта|тайн|секрет|загадк|улик|головоломк|расследов|механизм)/gi;
const WILD_WORDS = /(лес|гор[аыуеоы]|тропа|тропин|следы|следа|волк|олен|медвед|костёр|костер|палатк|поход|река|реки|болот|пещер|зверь|зверей|дерев)/gi;

/** Жанр из плана; «mystery» — прежнее название «поисков и загадок» — считается экспедицией. */
export function normalizeGenre(genre) {
  const g = String(genre || '').toLowerCase().trim();
  if (g === 'mystery') return 'treasure';
  return TRAVEL_STYLES[g] && g !== 'universal' ? g : null;
}

/** Жанр по тексту — для книг без явного жанра (например, сохранённых раньше). */
export function inferGenre(book) {
  const chapters = book.chapters || [];
  const text = [book.title, ...chapters.flatMap((c) => [c.title, ...c.blocks.map((b) => b.text || '')])].join(' ');
  const count = (re) => (text.match(re) || []).length;
  const ships = chapters.flatMap((c) => c.blocks).filter((b) => b.t === 'image' && b.scene === 'ship_deck').length;
  const sea = count(SEA_WORDS) + ships * 4;
  const treasure = count(TREASURE_WORDS);
  const wild = count(WILD_WORDS);
  if (sea >= 8) return 'sea';
  // природа — только когда она явно главная и без загадки: лес и пещера бывают просто местом действия детектива
  if (wild >= 15 && wild > treasure * 3) return 'wild';
  if (treasure >= 3) return 'treasure';
  if (wild >= 8) return 'wild';
  return 'universal';
}

export const inferFrame = (book) => TRAVEL_STYLES[inferGenre(book)].frame;

/** Применяет правила к готовой книге (в том числе сохранённой раньше). Не меняет исходный объект. */
export function normalizeBook(book, { name, girl } = {}) {
  return {
    ...book,
    ...(() => { const genre = normalizeGenre(book.genre) || inferGenre(book); const st = styleFor(genre, book.ageGroup); return { genre, frame: book.frame || st.frame, footer: book.footer || st.footer }; })(),
    // английская книга (заказы из США, 01.10) собрана вручную: русские правки диалогов и «Из записей …» её не касаются
    chapters: (book.chapters || []).map((c) => ({ ...c, blocks: book.lang === 'en' ? c.blocks.map((b) => ({ ...b })) : normalizeChapterBlocks(c.blocks.map((b) => ({ ...b })), { name, girl }) }))
  };
}
