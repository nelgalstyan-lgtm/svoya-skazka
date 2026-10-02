/*
 * Движок вёрстки книги «Большая история».
 *
 * Принимает содержимое (главы → блоки) и раскладывает его по страницам комплекта оформления.
 * Оформление лежит отдельно (assets/kit/*.css + картинки) и от содержимого не зависит:
 * чтобы сделать книгу для другого ребёнка, меняется только объект `book`.
 *
 * Формат содержимого:
 * {
 *   title, dedication: { title, lead, paragraphs[], date, signature },
 *   chapters: [{ n, title, initial: 'lion'|'arch'|'disc'|null, blocks: [
 *     { t: 'p', text }                      абзац или реплика
 *     { t: 'date', text }                   отдельная строка-дата
 *     { t: 'card', text }                   цитата-карточка
 *     { t: 'scrap', text }                  записка от руки внутри текста
 *     { t: 'note', label, text }            записка «Из записей…» в конце главы
 *     { t: 'search', text }                 строка поиска
 *     { t: 'image', src, caption }          иллюстрация на всю страницу — встаёт СРАЗУ после предыдущего блока
 *     { t: 'end', text }
 *   ]}]
 * }
 */
(function (global) {
  'use strict';

  var KIT = 'assets/kit/';
  var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
  // Размеры резных буквиц в px страницы (у картинки-буквицы буква уже нарисована внутри)
  var INITIALS = { lion: { w: 100, h: 118 }, arch: { w: 77, h: 159 }, disc: { w: 108, h: 105 } };

  var NBSP = ' ';
  // Язык книги: book.lang === 'en' — английские надписи движка (первые заказы из США, 01.10); по умолчанию русский
  var LANG = 'ru';
  function t(ru, en) { return LANG === 'en' ? en : ru; }
  function quoted(text) { return t('«', '“') + String(text).replace(/^[«“"]|[»”"]$/g, '') + t('»', '”'); }
  // Тире не должно оказываться в начале строки посреди реплики: «слово — слово» склеиваем неразрывным пробелом перед тире;
  // а тире в начале реплики — с первым словом («— Привет»)
  function typo(text) {
    return String(text).replace(/^—\s+/, '—' + NBSP).replace(/\s+—\s+/g, NBSP + '— ');
  }

  function h(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function img(src, cls, alt) {
    var node = new Image();
    node.src = src;
    node.alt = alt || '';
    if (cls) node.className = cls;
    return node;
  }

  // значки верхнего колонтитула и разделителя — по жанру (footer): [слева, справа, зеркалить правый]
  var HEADER_ICONS = {
    sea: ['hdr-sea.svg', 'hdr-sea.svg', false],
    treasure: ['hdr-treasure-l.png', 'hdr-treasure-r.png', false],
    wild: ['hdr-wild.png', 'hdr-wild.png', true],
    cookies: ['hdr-cookies-l.png', 'hdr-cookies-r.png', false],
    elves: ['hdr-elves-l.png', 'hdr-elves-r.png', false]
  };
  // Фирменное оформление «Героёнок» (по умолчанию у всех книг): светлая бумага, акварельные предметы темы
  // (assets/kit/decor/<набор>/item-N.webp — порядок как на листе владелицы, см. scripts/book_decor.py),
  // заставка главы vignette.webp. icons — значки шапки, sprig — веточка (у номера страницы, в углах рамки, у подписи).
  // У приключенческих тем листики ни о чём не говорят — там вместо веточек предметы темы:
  // corners — углы рамки [лв, пв, лн, пн], folio — по бокам номера страницы, plate — по бокам подписи к иллюстрации.
  var DECOR = {
    tajny: { icons: [2, 7], sprig: 9, corners: [1, 4, 5, 8], folio: [6, 3], plate: [1, 4], strip: true }, // карта, лупа, перо, дневник; часы, сундучок; боковая полоса-карта
    more: { icons: [2, 8], sprig: 9, corners: [6, 7, 3, 1], plate: [6, 5] }, // ракушка, подзорная труба, канат, кораблик; у номера — морская трава
    poxod: { icons: [3, 4], sprig: 10 },
    // розы — героиням; героям вместо роз корона, башня, свиток, ключ, кубок, арфа
    korolevstvo: { icons: [1, 4], sprig: 9, boy: { corners: [1, 2, 5, 4], folio: [7, 6], plate: [2, 5] } },
    les: { icons: [1, 3], sprig: 5 },
    podvodnoe: { icons: [1, 4], sprig: 9 },
    'novyj-god': { icons: [2, 3], sprig: 10 },
    'den-rozhdeniya': { icons: [3, 2], sprig: 9, compose: [9, 1, 10] } // своей заставки нет: торт между веточками
  };
  // набор по жанру книги; у старых книг без жанра — по прежнему колонтитулу
  var DECOR_BY_GENRE = { sea: 'more', treasure: 'tajny', universal: 'tajny', wild: 'poxod', kingdom: 'korolevstvo', forest: 'les', underwater: 'podvodnoe', newyear: 'novyj-god', newyear_elves: 'novyj-god', birthday: 'den-rozhdeniya' };
  var DECOR_BY_FOOTER = { sea: 'more', treasure: 'tajny', pirates: 'tajny', wild: 'poxod', jungle: 'poxod', kingdom: 'korolevstvo', forest: 'les', underwater: 'podvodnoe', cookies: 'novyj-god', elves: 'novyj-god', birthday: 'den-rozhdeniya' };
  function decorFor(book) { return DECOR_BY_GENRE[book.genre] || DECOR_BY_FOOTER[book.footer] || 'tajny'; }
  var BOY = false; // герой — мальчик: у некоторых наборов свои украшения (DECOR[set].boy)
  function decorCfg() { var c = DECOR[SET]; return BOY && c.boy ? Object.assign({}, c, c.boy) : c; }
  function decorItem(n, set) { return KIT + 'decor/' + (set || SET) + '/item-' + n + '.webp'; }
  // пара украшений по бокам (номера страницы, подписи): свои предметы темы или веточка и её зеркальная копия
  function decorPair(key, cls) {
    var cfg = decorCfg();
    if (cfg[key]) return [img(decorItem(cfg[key][0]), 'bk-decor ' + cls, ''), img(decorItem(cfg[key][1]), 'bk-decor ' + cls, '')];
    return [img(decorItem(cfg.sprig), 'bk-decor bk-mirror ' + cls, ''), img(decorItem(cfg.sprig), 'bk-decor ' + cls, '')];
  }

  // заставка: у главы — по теме книги; у посвящения книги ко дню рождения — торт между веточками
  function vignette(set) {
    set = set || SET;
    var box = h('div', 'bk-divider bk-vignette');
    var c = DECOR[set].compose;
    if (c) c.forEach(function (n, i) { box.appendChild(img(decorItem(n, set), 'bk-decor' + (i === 1 ? ' bk-vg-main' : '') + (i === 2 ? ' bk-mirror' : ''), '')); });
    else box.appendChild(img(KIT + 'decor/' + set + '/vignette.webp', 'bk-decor', ''));
    return box;
  }

  // полноразмерные разделители под названием главы (вместо «линия–значок–линия»)
  var DIVIDERS = { cookies: 'divider-cookies.png', elves: 'divider-elves.png' };
  // границы текстового поля у оформлений с рамкой по периметру: нижний край и минимальный верх на странице открытия главы
  // banner: название главы стоит на баннере рамки (и на странице открытия главы — там под баннером только «Глава N»)
  var LAYOUT = {
    cookies: { bottom: 691, openerMin: 215, gap: 34 },
    elves: { bottom: 702, openerMin: 300, gap: 30 },
    pirates: { bottom: 717, openerMin: 222, gap: 18, banner: true },
    jungle: { bottom: 707, openerMin: 234, gap: 18, banner: true, multiline: true },
    brand: { bottom: 790, openerMin: 250, gap: 30 }
  };

  function divider(withLines) {
    if (FRAME === 'brand') return vignette();
    if (DIVIDERS[FOOTER]) {
      var full = h('div', 'bk-divider bk-divider-img');
      full.appendChild(img(KIT + DIVIDERS[FOOTER], '', ''));
      return full;
    }
    var d = h('div', 'bk-divider');
    var icons = HEADER_ICONS[FOOTER];
    d.appendChild(h('i'));
    d.appendChild(img(KIT + (icons ? icons[1] : 'trefoil.png'), '', ''));
    d.appendChild(h('i'));
    return d;
  }

  var FRAME = 'rope';
  var FOOTER = 'sea'; // колонтитул: treasure | wild | sea | birds
  var ART = ''; // ' bk-art-3d' — книга в стиле «3D-мультфильм»
  var SET = 'tajny'; // набор фирменного оформления (DECOR)
  var EXTRA = ''; // классы страницы: набор, возраст (подросткам предметы мельче и приглушённее)
  var OCCASION = ''; // повод книги: у дня рождения — своя заставка посвящения

  // название главы в узкой шапке: сжимаем шрифт, пока не влезет (в одну строку или в высоту блока); совсем длинное — многоточие
  function fitRunTitle(span, run, multiline) {
    if (!multiline) span.style.whiteSpace = 'nowrap';
    var size = parseFloat(getComputedStyle(span).fontSize) || 20;
    var over = function () { return multiline ? span.offsetHeight > run.clientHeight + 1 : span.scrollWidth > span.clientWidth + 1; };
    while (over() && size > 13) {
      size -= 1; span.style.fontSize = size + 'px';
      if (multiline) span.style.lineHeight = Math.round(size * 1.12) + 'px';
    }
    if (over()) {
      span.style.overflow = 'hidden';
      if (multiline) { span.style.display = '-webkit-box'; span.style.webkitLineClamp = '2'; span.style.webkitBoxOrient = 'vertical'; } else span.style.textOverflow = 'ellipsis';
    }
  }

  // верхняя строка страницы: название главы (со значками и линией — или просто на баннере рамки)
  function addRun(page, title) {
    var lay = LAYOUT[FOOTER] || {};
    var icons = FRAME === 'brand' ? ['decor/' + SET + '/item-' + DECOR[SET].icons[0] + '.webp', 'decor/' + SET + '/item-' + DECOR[SET].icons[1] + '.webp', false] : HEADER_ICONS[FOOTER];
    var run = h('div', 'bk-run');
    if (!lay.banner) run.appendChild(img(KIT + (icons ? icons[0] : 'fleuron-l.png'), '', ''));
    var span = h('span', '', title);
    run.appendChild(span);
    if (!lay.banner) run.appendChild(img(KIT + (icons ? icons[1] : 'fleuron-r.png'), icons && icons[2] ? 'bk-mirror' : '', ''));
    page.appendChild(run);
    if (!lay.banner) page.appendChild(h('div', 'bk-run-rule'));
    if (LAYOUT[FOOTER]) fitRunTitle(span, run, !!lay.multiline);
  }

  function newSheet(root, kind) {
    var wrap = h('div', 'bk-wrap');
    var strip = FRAME === 'brand' && DECOR[SET].strip && /bk-text/.test(kind); // полоса во всю высоту у левого края — как карта у Алекса
    var page = h('div', 'bk-page bk-f-' + FRAME + ' bk-footer-' + FOOTER + ART + EXTRA + (strip ? ' bk-has-strip' : '') + ' ' + kind);
    // фирменная рамка страницы: двойная линия по краю и веточки темы в углах (не на обложках, иллюстрациях и раскраске)
    if (FRAME === 'brand' && /bk-(text|ded|finale|song)/.test(kind)) {
      var frame = h('div', 'bk-brand-frame');
      var corners = decorCfg().corners;
      ['tl', 'tr', 'bl', 'br'].forEach(function (c, i) {
        frame.appendChild(corners ? img(decorItem(corners[i]), 'bk-decor bk-corner bk-corner-item bk-corner-' + c, '') : img(decorItem(DECOR[SET].sprig), 'bk-decor bk-corner bk-corner-' + c, ''));
      });
      page.appendChild(frame);
    }
    wrap.appendChild(page);
    root.appendChild(wrap);
    return page;
  }

  function textSheet(root, chapter, opener) {
    var page = newSheet(root, 'bk-text' + (opener ? ' bk-opener' : ''));
    var stripEl = h('div', 'bk-strip');
    if (FRAME === 'brand' && DECOR[SET].strip) stripEl.style.backgroundImage = 'url("' + KIT + 'decor/' + SET + '/strip.webp")';
    page.appendChild(stripEl);

    if (opener) {
      var head = h('div', 'bk-opener-head');
      head.appendChild(h('div', 'bk-chapter-no', t('Глава ', 'Chapter ') + (ROMAN[chapter.n] || chapter.n)));
      head.appendChild(divider());
      head.appendChild(h('div', 'bk-chapter-title', chapter.title));
      page.appendChild(head);
      if (LAYOUT[FOOTER] && LAYOUT[FOOTER].banner) addRun(page, chapter.title);
    } else {
      addRun(page, chapter.title);
    }

    var content = h('div', 'bk-content');
    page.appendChild(content);

    if (opener) {
      // длинное название главы может занять две строки — сдвигаем текст вниз, чтобы они не наложились
      var lay = LAYOUT[FOOTER] || {};
      var headEl = page.querySelector('.bk-opener-head');
      var headBottom = (parseFloat(getComputedStyle(headEl).top) || 78) + headEl.offsetHeight;
      var top = Math.max(lay.openerMin || 246, headBottom + (lay.gap || 44));
      content.style.top = top + 'px';
      content.style.height = ((lay.bottom || (FOOTER === 'birds' ? 800 : 790)) - top) + 'px';
    }

    var folio;
    if (FRAME === 'brand') {
      // номер страницы между двумя веточками темы
      folio = h('div', 'bk-folio bk-folio-brand');
      var fp = decorPair('folio', '');
      folio.append(fp[0], h('span', 'bk-no', ''), fp[1]);
    } else if (FOOTER === 'birds') {
      folio = h('div', 'bk-folio');
      folio.appendChild(img(KIT + 'bird-l.png', '', ''));
      folio.appendChild(h('span', 'bk-no', ''));
      folio.appendChild(img(KIT + 'bird-r.png', '', ''));
    } else {
      folio = h('div', 'bk-folio bk-fo bk-fo-' + FOOTER);
      folio.appendChild(h('span', 'bk-no', ''));
    }
    page.appendChild(folio);

    return { page: page, content: content, folio: folio.querySelector('.bk-no') };
  }

  function illustrationSheet(root, block, imageIndex) {
    var page = newSheet(root, 'bk-ill');
    page.setAttribute('data-img', String(imageIndex));
    var pic = img(imageSrc(block), 'bk-ill-img', block.caption || '');
    page.appendChild(pic);
    // у оформлений темы «Путешествие» на табличке деревянный медальон; у праздничных (лента/изморозь) — бумажная розетка
    var wood = FRAME === 'rope' || FRAME === 'chart' || FRAME === 'fern';
    var rosette;
    if (FRAME === 'brand') {
      // фирменная подпись: бумажная табличка в двойной рамке, сверху медальон с предметом темы, по краям веточки
      rosette = h('div', 'bk-brand-medal');
      rosette.appendChild(img(decorItem(DECOR[SET].icons[0]), 'bk-decor', ''));
    } else {
      rosette = img(KIT + (wood ? 'medallion.png' : 'rosette.png'), wood ? 'bk-medal' : 'bk-rosette', '');
    }
    page.appendChild(rosette);
    var plate = h('div', 'bk-plate');
    if (block.plateTop) { // подпись в несколько строк: табличка выше стандартной
      plate.style.top = block.plateTop + '%';
      plate.style.height = (96.3 - block.plateTop) + '%';
      rosette.style.top = (block.plateTop - (wood ? 4.4 : FRAME === 'brand' ? 3.4 : 2.2)) + '%';
    }
    if (FRAME === 'brand') {
      var pp = decorPair('plate', 'bk-plate-sprig');
      pp[0].classList.add('bk-plate-sprig-l'); pp[1].classList.add('bk-plate-sprig-r');
      plate.append(pp[0], pp[1]);
    }
    var d = h('div', 'bk-plate-div');
    d.append(h('i'), h('b'), h('i'));
    plate.appendChild(d);
    plate.appendChild(h('div', 'bk-plate-cap', block.caption || ''));
    page.appendChild(plate);
    return { page: page, folio: null };
  }

  // Обложка: иллюстрация с ребёнком на всю страницу, название набрано поверх (кириллицу модель рисует с ошибками).
  // Пока иллюстрации нет — первая картинка книги или фон темы.
  function coverSheet(root, book) {
    var page = newSheet(root, 'bk-cover');
    var first = null;
    book.chapters.some(function (c) { return c.blocks.some(function (b) { if (b.t === 'image') { first = b; return true; } return false; }); });
    var src = book.cover || (first ? imageSrc(first) : null);
    if (src) {
      var coverImg = img(src, 'bk-cover-img', book.title);
      page.appendChild(coverImg);
      // название внизу, если верх обложки занят (решение сервера: Gemini смотрит на обложку — coverTitlePlace в worker/art.js)
      if (book.coverTitle && book.coverTitle.place === 'bottom') page.classList.add('bk-title-bottom');
    }
    var head = h('div', 'bk-cover-head');
    head.appendChild(h('div', 'bk-cover-kicker', t('Персональная книга', 'A personalized book')));
    var titleEl = h('div', 'bk-cover-title', book.title);
    // если название ложится на лицо героя — у книги можно задать кегль и отступ сверху (coverTitle: { size, top }, px)
    // длинное название — мельче: меньше строк поверх картинки (у «Амилии» три строки закрывали голову)
    var len = String(book.title || '').length;
    if (len > 34) titleEl.style.fontSize = '36px'; else if (len > 22) titleEl.style.fontSize = '42px';
    if (book.coverTitle && book.coverTitle.size) titleEl.style.fontSize = book.coverTitle.size + 'px';
    if (book.coverTitle && book.coverTitle.top != null) head.style.top = book.coverTitle.top + 'px';
    head.appendChild(titleEl);
    page.appendChild(head);
    var name = book.meta && book.meta.heroName;
    if (name) {
      var who = h('div', 'bk-cover-hero');
      who.appendChild(h('small', '', t('Главный герой', 'Starring')));
      who.appendChild(document.createTextNode(name));
      page.appendChild(who);
    }
    page.appendChild(h('div', 'bk-cover-brand', t('Героёнок', 'Geroenok')));
    return { page: page, folio: null };
  }

  // посвящение бывает и в строку, и на полстраницы: короткое — по центру, длинное уменьшаем, пока не встанет над подписью
  function fitDedication(page, body, foot, d) {
    var chars = (d.paragraphs || []).join(' ').length;
    if (chars < 260) page.classList.add('bk-ded-short');
    var lead = page.querySelector('.bk-ded-lead');
    var shrink = function (min) {
      // длинная первая фраза не наедет на текст
      if (lead) body.style.top = (lead.offsetTop + lead.offsetHeight + 22) + 'px';
      var size = parseFloat(getComputedStyle(body).fontSize) || 17.5;
      while (body.offsetTop + body.offsetHeight > foot.offsetTop - 16 && size > min) {
        size -= 0.5;
        body.style.fontSize = size + 'px';
      }
      return body.offsetTop + body.offsetHeight <= foot.offsetTop - 16;
    };
    if (shrink(13.5)) return;
    // совсем длинное (как у Алекса): заголовок выше, заставка меньше — больше места тексту
    page.classList.add('bk-ded-long');
    body.style.fontSize = '';
    shrink(11.5);
  }

  function dedicationSheet(root, d) {
    var page = newSheet(root, 'bk-ded');
    page.appendChild(h('div', 'bk-ded-title', d.title || t('Посвящается', 'Dedicated to')));
    page.appendChild(FRAME === 'brand' && OCCASION === 'birthday' ? vignette('den-rozhdeniya') : divider());
    if (d.lead) page.appendChild(h('div', 'bk-ded-lead', d.lead));
    var body = h('div', 'bk-ded-body');
    (d.paragraphs || []).forEach(function (p) { body.appendChild(h('p', '', p)); });
    page.appendChild(body);
    var foot = h('div', 'bk-ded-foot');
    if (d.date) foot.appendChild(h('div', 'bk-ded-date', d.date));
    if (d.signature) foot.appendChild(h('div', 'bk-ded-sign', d.signature));
    page.appendChild(foot);
    page.appendChild(h('div', 'bk-ded-rule'));
    if (FRAME === 'brand') fitDedication(page, body, foot, d);
    return { page: page, folio: null };
  }

  // Последние страницы: «Конец» (с QR-кодом на онлайн-версию), сертификат героя и раскраска
  function finaleSheet(root, opts) {
    var page = newSheet(root, 'bk-finale bk-has-hare');
    page.appendChild(h('div', 'bk-finale-title', t('Конец', 'The End')));
    // Героёнок, хранитель историй, прощается с читателем — в любом оформлении
    page.appendChild(img(KIT + 'decor/hare-greeting.webp', 'bk-finale-hare', ''));
    page.appendChild(h('div', 'bk-finale-text', t('Эта книга написана специально для своего героя — с привычками, друзьями и близкими из анкеты. Пусть она возвращается к вам снова и снова.', 'This book was written especially for its hero — with their own habits, friends and family. May you come back to it again and again.')));
    if (opts && opts.qr) { opts.qr.classList.add('bk-qr'); page.appendChild(opts.qr); }
    page.appendChild(h('div', 'bk-finale-brand', t('Героёнок', 'Geroenok')));
    return { page: page, folio: null };
  }

  // Портрет героя для сертификата — из обложки: там ребёнок всегда в центре нижних двух третей,
  // поэтому берём голову и плечи из этой области (не фото ребёнка: фото храним не дольше 48 часов)
  function portrait(src, cls) {
    var p = h('div', cls);
    p.style.backgroundImage = 'url("' + String(src).replace(/"/g, '%22') + '")';
    return p;
  }

  function certificateSheet(root, c, cover, ownPortrait, faceCrop) {
    var page = newSheet(root, 'bk-cert' + (cover ? ' bk-cert-has-portrait' : ''));
    page.appendChild(h('div', 'bk-cert-kicker', c.kicker));
    page.appendChild(h('div', 'bk-cert-title', c.title));
    if (cover) {
      var pic = portrait(cover, 'bk-cert-portrait');
      // готовый портрет (book.portrait — лицо крупно) показываем целиком, без кадрирования обложки
      if (ownPortrait) { pic.style.backgroundSize = 'cover'; pic.style.backgroundPosition = '50% 50%'; }
      else if (faceCrop) pic.classList.add('bk-cert-face');
      page.appendChild(pic);
    }
    page.appendChild(divider());
    page.appendChild(h('div', 'bk-cert-name', c.name));
    page.appendChild(h('div', 'bk-cert-text', c.text));
    var foot = h('div', 'bk-cert-foot');
    var d = h('div', '', c.date); d.appendChild(h('b', '', t('дата', 'date')));
    // подпись: печать с Героёнком (PNG с прозрачностью — переживает сборку PDF) и росчерк «Героёнок»
    var sg = h('div', 'bk-cert-sign');
    var seal = document.createElement('img');
    seal.className = 'bk-cert-seal'; seal.src = 'assets/brand/logo-mark-alpha.png'; seal.alt = t('Печать Героёнка', 'Geroenok seal');
    var hand = h('div', 'bk-cert-hand');
    hand.appendChild(h('span', 'bk-cert-signature', t('Героёнок', 'Geroenok')));
    hand.appendChild(h('b', '', t('хранитель историй', 'keeper of stories')));
    sg.append(seal, hand);
    foot.append(d, sg);
    page.appendChild(foot);
    return { page: page, folio: null };
  }

  // Текст для задней обложки: своя аннотация книги (book.blurb) или общий текст о герое
  function blurbFor(book) {
    if (book.blurb) return book.blurb;
    var name = book.meta && book.meta.heroName;
    if (LANG === 'en') return name ? 'The hero of this book is ' + name + '. Not a made-up character, but a real child: drawn from a photo on the cover and on every illustration, in a story written just for ' + (book.meta.heroGirl ? 'her' : 'him') + '.' : 'This book was written for one single reader. Its hero is a real child, drawn from a photo on the cover and on every illustration.';
    if (!name) return 'Эта книга написана для одного-единственного читателя. Её герой — настоящий ребёнок: он нарисован по фото на обложке и на каждой иллюстрации.';
    var g = book.meta.heroGirl;
    return (g ? 'Главная героиня' : 'Главный герой') + ' этой книги — ' + name + '. Не выдуманный персонаж, а настоящий ребёнок: ' + (g ? 'она нарисована' : 'он нарисован')
      + ' по фото на обложке и на каждой иллюстрации, а история написана специально для ' + (g ? 'неё' : 'него')
      + ' — с ' + (g ? 'её' : 'его') + ' привычками, друзьями и близкими.';
  }

  // Картинка для задней обложки: book.backImage или последняя иллюстрация книги (у заказа — только нарисованная по фото)
  function backImageFor(book, onlyGenerated) {
    if (book.backImage) return book.backImage;
    var last = null;
    book.chapters.forEach(function (c) {
      c.blocks.forEach(function (b) {
        if (b.t === 'image' && (!onlyGenerated || /^(data:|\/api\/img\/)/.test(b.src || ''))) last = imageSrc(b);
      });
    });
    return last || book.cover || null;
  }

  // Длинная цитата не должна наезжать на арку с иллюстрацией: сначала уменьшаем шрифт, потом сдвигаем арку ниже
  function fitBackQuote(page) {
    var quote = page.querySelector('.bk-back-quote');
    var arch = page.querySelector('.bk-back-arch');
    if (!quote || !arch || !quote.offsetHeight) return;
    var gap = 14;
    var size = parseFloat(getComputedStyle(quote).fontSize) || 27;
    while (quote.offsetTop + quote.offsetHeight + gap > arch.offsetTop && size > 21) {
      size -= 1;
      quote.style.fontSize = size + 'px';
    }
    var over = quote.offsetTop + quote.offsetHeight + gap - arch.offsetTop;
    if (over > 0) {
      arch.style.top = (arch.offsetTop + over) + 'px';
      arch.style.height = Math.max(200, arch.offsetHeight - over) + 'px';
    }
  }

  // Аннотация не должна заходить под QR-код и знак Героёнка (у «Амилии» QR закрыл конец текста, 01.10)
  function fitBackBlurb(page) {
    var text = page.querySelector('.bk-back-text');
    if (!text || !text.offsetHeight) return;
    var limit = [page.querySelector('.bk-back-qr'), page.querySelector('.bk-back-foot')]
      .filter(function (el) { return el && el.offsetHeight; })
      .reduce(function (min, el) { return Math.min(min, el.getBoundingClientRect().top); }, Infinity);
    if (limit === Infinity) return;
    var size = parseFloat(getComputedStyle(text).fontSize) || 17.5;
    var bottom = function () { return text.getBoundingClientRect().bottom; };
    var scale = text.getBoundingClientRect().height / text.offsetHeight || 1; // страница может быть уменьшена под экран
    while (bottom() > limit - 10 * scale && size > 12.5) {
      size -= 0.5;
      text.style.fontSize = size + 'px';
      text.style.lineHeight = Math.round(size * 1.6) + 'px';
    }
  }

  // Задняя обложка: иллюстрация в арке, аннотация, возраст и знак Героёнка (нужна и для печати в твёрдом переплёте)
  function backCoverSheet(root, book, opts) {
    var page = newSheet(root, 'bk-back');
    // цитата из книги над иллюстрацией (у образцов)
    if (book.backQuote) { page.classList.add('bk-back-has-quote'); page.appendChild(h('div', 'bk-back-quote', typo(book.backQuote))); }
    var src = backImageFor(book, opts && opts.onlyGenerated);
    if (src) {
      var arch = h('div', 'bk-back-arch');
      arch.appendChild(img(src, '', ''));
      page.appendChild(arch);
    }
    page.appendChild(h('div', 'bk-back-text', typo(blurbFor(book))));
    var foot = h('div', 'bk-back-foot');
    var seal = document.createElement('img');
    seal.className = 'bk-back-seal'; seal.src = 'assets/brand/logo-mark-alpha.png'; seal.alt = '';
    var brand = h('div', 'bk-back-brand', t('Героёнок', 'Geroenok'));
    brand.appendChild(h('small', '', 'geroenok.online'));
    foot.append(seal, brand);
    foot.appendChild(h('div', 'bk-back-age', '0+')); // возрастной знак: книга подходит любому возрасту
    page.appendChild(foot);
    // QR на онлайн-версию книги (в ней «Слушать»): у заказа есть, у образцов без адреса — нет
    if (opts && opts.backQr) { page.classList.add('bk-back-has-qr'); page.appendChild(opts.backQr); }
    fitBackQuote(page);
    fitBackBlurb(page);
    return { page: page, folio: null };
  }

  // Песня по книге: название и слова; послушать — кнопкой «Песня» в онлайн-версии (QR на задней обложке)
  function songSheet(root, song) {
    var page = newSheet(root, 'bk-song');
    page.appendChild(h('div', 'bk-song-kicker', t('Песня из книги', 'The song from the book')));
    page.appendChild(h('div', 'bk-song-title', quoted(song.title)));
    page.appendChild(divider());
    page.appendChild(global.SkazkaExtras.songLyrics(song));
    page.appendChild(h('div', 'bk-song-note', t('Послушать песню — в онлайн-версии книги', 'Listen to the song in the online version of the book')));
    return { page: page, folio: null };
  }

  function coloringSheet(root, src, first) {
    var page = newSheet(root, 'bk-coloring');
    page.appendChild(h('div', 'bk-coloring-title', first ? t('Раскрась свою книгу', 'Color your book') : t('Раскраска', 'Coloring page')));
    page.appendChild(img(src, 'bk-coloring-img', t('Раскраска', 'Coloring page')));
    return { page: page, folio: null };
  }

  var SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>';

  function renderBlock(block, opts) {
    var node;
    switch (block.t) {
      case 'date':
        return h('p', 'bk-date', block.text);
      case 'card':
        return h('div', 'bk-card', quoted(block.text));
      case 'scrap':
        return h('div', 'bk-scrap', block.text);
      case 'note':
        node = h('div', 'bk-note');
        node.appendChild(h('div', 'bk-note-lbl', block.label || t('Из записей', 'From the notes')));
        node.appendChild(h('div', '', quoted(block.text)));
        return node;
      case 'search':
        node = h('div', 'bk-search');
        node.innerHTML = SEARCH_ICON;
        node.appendChild(h('span', '', block.text));
        return node;
      case 'end':
        return h('div', 'bk-end', block.text);
      default:
        node = h('p');
        block = { t: block.t, text: typo(block.text) };
        // буквица — только когда абзац начинается с буквы (не с тире реплики и не с кавычки)
        if (opts && !/^[A-Za-zА-Яа-яЁё]/.test(block.text)) opts = null;
        if (opts && opts.initial) {
          // первый абзац главы: резная буквица (буква нарисована в картинке) или типографская
          var size = INITIALS[opts.initial];
          if (size) {
            var pic = img(KIT + 'initials/' + opts.initial + '.png', 'bk-initial', block.text.charAt(0));
            pic.style.width = size.w + 'px';
            pic.style.height = size.h + 'px';
            node.appendChild(pic);
            node.appendChild(document.createTextNode(block.text.slice(1)));
            return node;
          }
        }
        if (opts && opts.dropcap) {
          node.appendChild(h('span', 'bk-dropcap', block.text.charAt(0)));
          node.appendChild(document.createTextNode(block.text.slice(1)));
          return node;
        }
        node.textContent = block.text;
        return node;
    }
  }

  function imageSrc(block) { return block.src || 'assets/scenes/' + (block.scene || 'forest_path') + '.jpg'; }

  function overflows(content) { return content.scrollHeight > content.clientHeight + 1; }

  // с образцом текста: без него браузер грузит только латиницу, и кириллица приходит позже — после замеров страниц
  var CYR = 'Аа Жж Юю Ёё Aa 0';

  function loadFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load('25px Literata', CYR), document.fonts.load('700 25px Literata', CYR),
      document.fonts.load('italic 15px Literata', CYR), document.fonts.load('italic 700 17px Literata', CYR),
      document.fonts.load('700 46px Lora', CYR), document.fonts.load('600 22px Lora', CYR),
      document.fonts.load('26px "Marck Script"', CYR), document.fonts.load('700 30px Caveat', CYR),
      document.fonts.load('26px Lobster', CYR), document.fonts.load('800 27px Podkova', CYR)
    ]).catch(function () {});
  }

  function preloadImages(book) {
    var urls = [book.cover || KIT + 'parchment.jpg', KIT + 'hdr-treasure-l.png', KIT + 'hdr-treasure-r.png', KIT + 'hdr-wild.png', KIT + 'hdr-sea.svg', KIT + 'footer-treasure.png', KIT + 'footer-wild.png', KIT + 'footer-sea.png', KIT + 'medallion.png', KIT + 'parchment.jpg', KIT + 'strip.png', KIT + 'bird-l.png', KIT + 'bird-r.png', KIT + 'fleuron-l.png', KIT + 'fleuron-r.png', KIT + 'trefoil.png', KIT + 'rosette.png', KIT + 'plate-band.png', KIT + 'frame-cookies.jpg', KIT + 'frame-elves.jpg', KIT + 'hdr-cookies-l.png', KIT + 'hdr-cookies-r.png', KIT + 'hdr-elves-l.png', KIT + 'hdr-elves-r.png', KIT + 'divider-cookies.png', KIT + 'divider-elves.png', KIT + 'frame-pirates.jpg', KIT + 'frame-jungle.jpg', KIT + 'orn-pirates-skull.png'];
    if (ART && /^(pirates|jungle|cookies|elves)$/.test(FRAME)) urls.push(KIT + 'frame-' + FRAME + '-3d.jpg');
    urls.push(KIT + 'decor/hare-greeting.webp'); // Героёнок на странице «Конец» — во всех оформлениях
    if (FRAME === 'brand') {
      var cfg = DECOR[SET];
      urls.push(decorItem(cfg.icons[0]), decorItem(cfg.icons[1]), decorItem(cfg.sprig));
      [].concat(cfg.corners || [], cfg.folio || [], cfg.plate || []).forEach(function (n) { urls.push(decorItem(n)); });
      if (cfg.boy) [].concat(cfg.boy.corners || [], cfg.boy.folio || [], cfg.boy.plate || []).forEach(function (n) { urls.push(decorItem(n)); });
      if (cfg.strip) urls.push(KIT + 'decor/' + SET + '/strip.webp');
      if (cfg.compose) cfg.compose.forEach(function (n) { urls.push(decorItem(n)); });
      else urls.push(KIT + 'decor/' + SET + '/vignette.webp');
      if (OCCASION === 'birthday') DECOR['den-rozhdeniya'].compose.forEach(function (n) { urls.push(decorItem(n, 'den-rozhdeniya')); });
    }
    book.chapters.forEach(function (c) {
      if (c.initial) urls.push(KIT + 'initials/' + c.initial + '.png');
      c.blocks.forEach(function (b) { if (b.t === 'image') urls.push(imageSrc(b)); });
    });
    return Promise.all(urls.map(function (u) {
      return new Promise(function (resolve) { var i = new Image(); i.onload = i.onerror = resolve; i.src = u; });
    }));
  }

  // приключение для 11–16 лет без праздничного повода — оформление как у книги Алекса: пергамент, карта, предметы исследователя
  // (решение владелицы 02.10: фирменные предметы и веточки подросткам слишком «детские»; сказки и праздники — в фирменном)
  var ADVENTURE_GENRES = { sea: 1, treasure: 1, wild: 1, universal: 1, mystery: 1 };
  function teenAdventure(book) {
    return book.ageGroup === '11-16' && !!ADVENTURE_GENRES[book.genre] && book.occasion !== 'birthday' && book.occasion !== 'newyear';
  }

  /** Раскладывает книгу по страницам внутри root. Возвращает { pages, sheets }. */
  function render(book, root, opts) {
    // фирменное оформление у всех книг; прежние рамки — только если их явно просят (?frame=… — для сравнения)
    LANG = book.lang === 'en' ? 'en' : 'ru';
    FRAME = (opts && opts.frame) || (teenAdventure(book) ? 'chart' : 'brand');
    FOOTER = FRAME === 'brand' ? 'brand' : FRAME === 'chart' && !(opts && opts.frame) ? 'treasure' : (opts && opts.footer) || book.footer || (FRAME === 'vine' ? 'birds' : 'sea');
    SET = decorFor(book);
    OCCASION = book.occasion || '';
    BOY = book.meta ? book.meta.heroGirl === false : false;
    EXTRA = FRAME === 'brand' ? ' bk-set-' + SET + (book.ageGroup === '11-16' ? ' bk-teen' : '') : '';
    // книга в стиле «3D-мультфильм»: рисованные рамки берутся в 3D-варианте (parchment.css, .bk-art-3d)
    ART = book.art === '3d' ? ' bk-art-3d' : '';
    return Promise.all([loadFonts(), preloadImages(book)]).then(function () {
      root.textContent = '';
      var sheets = [];

      if (!(opts && opts.noCover)) sheets.push(coverSheet(root, book));
      if (book.dedication) sheets.push(dedicationSheet(root, book.dedication));

      var imageIndex = 0;
      book.chapters.forEach(function (chapter, ci) {
        var cur = textSheet(root, chapter, true);
        sheets.push(cur);
        var first = true;

        chapter.blocks.forEach(function (block, bi) {
          if (block.t === 'image') {
            // номер считаем и у пропущенной — он совпадает с номером иллюстрации на сервере (перерисовка)
            if (opts && opts.onlyGenerated && !/^(data:|\/api\/img\/)/.test(block.src || '')) { imageIndex++; return; }
            sheets.push(illustrationSheet(root, block, imageIndex++));
            cur = null; // после иллюстрации текст продолжается на новой странице
            return;
          }
          if (!cur) { cur = textSheet(root, chapter, false); sheets.push(cur); }

          var isFirst = first && block.t === 'p';
          var initial = FRAME === 'brand' ? null : chapter.initial; // резные буквицы — у прежних рамок, в фирменном оформлении типографская
          var node = renderBlock(block, isFirst ? { initial: initial, dropcap: !initial } : null);
          if (isFirst) first = false;
          cur.content.appendChild(node);

          if (overflows(cur.content)) {
            cur.content.removeChild(node);
            cur = textSheet(root, chapter, false);
            sheets.push(cur);
            node = renderBlock(block, null);
            cur.content.appendChild(node);
          }
          // адрес абзаца в книге — для правки текста прямо на странице
          if (block.t === 'p') { node.setAttribute('data-ch', String(ci)); node.setAttribute('data-bi', String(bi)); }
        });
      });

      if (opts && opts.locked) {
        var lock = newSheet(root, 'bk-finale bk-locked');
        lock.appendChild(h('div', 'bk-finale-title', 'Продолжение'));
        lock.appendChild(divider());
        lock.appendChild(h('div', 'bk-finale-text', opts.locked.text));
        var pay = h('div', 'bk-locked-pay');
        pay.appendChild(opts.locked.button);
        pay.appendChild(h('div', 'bk-locked-note', 'Все иллюстрации дорисуются сразу после оплаты — за несколько минут.'));
        lock.appendChild(pay);
        sheets.push({ page: lock, folio: null });
      } else if (!(opts && opts.noFinale)) {
        sheets.push(finaleSheet(root, opts));
        if (opts && opts.certificate) sheets.push(certificateSheet(root, opts.certificate, book.portrait || book.cover, Boolean(book.portrait), Boolean(opts.onlyGenerated && book.coverFace)));
        if (book.song && book.song.src && book.song.chorus) sheets.push(songSheet(root, book.song));
        (book.coloring || []).forEach(function (src, i) { sheets.push(coloringSheet(root, src, i === 0)); });
      }
      if (!(opts && (opts.noCover || opts.noBackCover))) sheets.push(backCoverSheet(root, book, opts));

      // сквозная нумерация по физическим страницам (иллюстрации считаются, но номер не показывают — как в образце)
      sheets.forEach(function (s, i) { if (s.folio) s.folio.textContent = String(i + 1); });
      return { pages: sheets.length, sheets: sheets };
    });
  }

  global.SkazkaBook = { render: render, blurbFor: blurbFor };
})(window);
