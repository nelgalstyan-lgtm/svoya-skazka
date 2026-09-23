// Правила русской типографики и «записок» для готовой книги. Применяются и к новым книгам, и к уже сохранённым.

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

  const label = `Из записей ${genitiveName(name, girl)}`.trim();
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
    ...(() => { const genre = normalizeGenre(book.genre) || inferGenre(book); const st = TRAVEL_STYLES[genre]; return { genre, frame: book.frame || st.frame, footer: book.footer || st.footer }; })(),
    chapters: (book.chapters || []).map((c) => ({ ...c, blocks: normalizeChapterBlocks(c.blocks.map((b) => ({ ...b })), { name, girl }) }))
  };
}
