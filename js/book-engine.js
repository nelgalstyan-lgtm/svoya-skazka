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
  // полноразмерные разделители под названием главы (вместо «линия–значок–линия»)
  var DIVIDERS = { cookies: 'divider-cookies.png', elves: 'divider-elves.png' };
  // границы текстового поля у оформлений с рамкой по периметру: нижний край и минимальный верх на странице открытия главы
  // banner: название главы стоит на баннере рамки (и на странице открытия главы — там под баннером только «Глава N»)
  var LAYOUT = {
    cookies: { bottom: 691, openerMin: 215, gap: 34 },
    elves: { bottom: 702, openerMin: 300, gap: 30 },
    pirates: { bottom: 717, openerMin: 222, gap: 18, banner: true },
    jungle: { bottom: 707, openerMin: 234, gap: 18, banner: true, multiline: true }
  };

  function divider(withLines) {
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
    var icons = HEADER_ICONS[FOOTER];
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
    var page = h('div', 'bk-page bk-f-' + FRAME + ' bk-footer-' + FOOTER + ' ' + kind);
    wrap.appendChild(page);
    root.appendChild(wrap);
    return page;
  }

  function textSheet(root, chapter, opener) {
    var page = newSheet(root, 'bk-text' + (opener ? ' bk-opener' : ''));
    page.appendChild(h('div', 'bk-strip'));

    if (opener) {
      var head = h('div', 'bk-opener-head');
      head.appendChild(h('div', 'bk-chapter-no', 'Глава ' + (ROMAN[chapter.n] || chapter.n)));
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
    if (FOOTER === 'birds') {
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
    var rosette = img(KIT + (wood ? 'medallion.png' : 'rosette.png'), wood ? 'bk-medal' : 'bk-rosette', '');
    page.appendChild(rosette);
    var plate = h('div', 'bk-plate');
    if (block.plateTop) { // подпись в несколько строк: табличка выше стандартной
      plate.style.top = block.plateTop + '%';
      plate.style.height = (96.3 - block.plateTop) + '%';
      rosette.style.top = (block.plateTop - (wood ? 4.4 : 2.2)) + '%';
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
    if (src) page.appendChild(img(src, 'bk-cover-img', book.title));
    var head = h('div', 'bk-cover-head');
    head.appendChild(h('div', 'bk-cover-kicker', 'Персональная книга'));
    head.appendChild(h('div', 'bk-cover-title', book.title));
    page.appendChild(head);
    var name = book.meta && book.meta.heroName;
    if (name) {
      var who = h('div', 'bk-cover-hero');
      who.appendChild(h('small', '', 'Главный герой'));
      who.appendChild(document.createTextNode(name));
      page.appendChild(who);
    }
    page.appendChild(h('div', 'bk-cover-brand', 'Своя Сказка'));
    return { page: page, folio: null };
  }

  function dedicationSheet(root, d) {
    var page = newSheet(root, 'bk-ded');
    page.appendChild(h('div', 'bk-ded-title', d.title || 'Посвящается'));
    page.appendChild(divider());
    if (d.lead) page.appendChild(h('div', 'bk-ded-lead', d.lead));
    var body = h('div', 'bk-ded-body');
    (d.paragraphs || []).forEach(function (p) { body.appendChild(h('p', '', p)); });
    page.appendChild(body);
    var foot = h('div', 'bk-ded-foot');
    if (d.date) foot.appendChild(h('div', 'bk-ded-date', d.date));
    if (d.signature) foot.appendChild(h('div', 'bk-ded-sign', d.signature));
    page.appendChild(foot);
    page.appendChild(h('div', 'bk-ded-rule'));
    return { page: page, folio: null };
  }

  // Последние страницы: «Конец» (с QR-кодом на онлайн-версию), сертификат героя и раскраска
  function finaleSheet(root, opts) {
    var page = newSheet(root, 'bk-finale');
    page.appendChild(h('div', 'bk-finale-title', 'Конец'));
    page.appendChild(divider());
    page.appendChild(h('div', 'bk-finale-text', 'Эта книга написана специально для своего героя — с привычками, друзьями и близкими из анкеты. Пусть она возвращается к вам снова и снова.'));
    if (opts && opts.qr) { opts.qr.classList.add('bk-qr'); page.appendChild(opts.qr); }
    page.appendChild(h('div', 'bk-finale-brand', 'Своя Сказка'));
    return { page: page, folio: null };
  }

  function certificateSheet(root, c) {
    var page = newSheet(root, 'bk-cert');
    page.appendChild(h('div', 'bk-cert-kicker', c.kicker));
    page.appendChild(h('div', 'bk-cert-title', c.title));
    page.appendChild(divider());
    page.appendChild(h('div', 'bk-cert-name', c.name));
    page.appendChild(h('div', 'bk-cert-text', c.text));
    var foot = h('div', 'bk-cert-foot');
    var d = h('div', '', c.date); d.appendChild(h('b', '', 'дата'));
    var sg = h('div', '', 'Своя Сказка'); sg.appendChild(h('b', '', 'подпись'));
    foot.append(d, sg);
    page.appendChild(foot);
    return { page: page, folio: null };
  }

  function coloringSheet(root, src, first) {
    var page = newSheet(root, 'bk-coloring');
    page.appendChild(h('div', 'bk-coloring-title', first ? 'Раскрась свою книгу' : 'Раскраска'));
    page.appendChild(img(src, 'bk-coloring-img', 'Раскраска'));
    return { page: page, folio: null };
  }

  var SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>';

  function renderBlock(block, opts) {
    var node;
    switch (block.t) {
      case 'date':
        return h('p', 'bk-date', block.text);
      case 'card':
        return h('div', 'bk-card', '«' + block.text.replace(/^«|»$/g, '') + '»');
      case 'scrap':
        return h('div', 'bk-scrap', block.text);
      case 'note':
        node = h('div', 'bk-note');
        node.appendChild(h('div', 'bk-note-lbl', block.label || 'Из записей'));
        node.appendChild(h('div', '', '«' + block.text.replace(/^«|»$/g, '') + '»'));
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

  function loadFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load('25px Tinos'), document.fonts.load('700 25px Tinos'),
      document.fonts.load('italic 15px Tinos'), document.fonts.load('italic 700 17px Tinos'),
      document.fonts.load('700 46px "Cormorant Garamond"'), document.fonts.load('600 22px "Cormorant Garamond"'),
      document.fonts.load('26px "Marck Script"'), document.fonts.load('700 30px Caveat'),
      document.fonts.load('26px Lobster'), document.fonts.load('800 27px Podkova')
    ]).catch(function () {});
  }

  function preloadImages(book) {
    var urls = [book.cover || KIT + 'parchment.jpg', KIT + 'hdr-treasure-l.png', KIT + 'hdr-treasure-r.png', KIT + 'hdr-wild.png', KIT + 'hdr-sea.svg', KIT + 'footer-treasure.png', KIT + 'footer-wild.png', KIT + 'footer-sea.png', KIT + 'medallion.png', KIT + 'parchment.jpg', KIT + 'strip.png', KIT + 'bird-l.png', KIT + 'bird-r.png', KIT + 'fleuron-l.png', KIT + 'fleuron-r.png', KIT + 'trefoil.png', KIT + 'rosette.png', KIT + 'plate-band.png', KIT + 'frame-cookies.jpg', KIT + 'frame-elves.jpg', KIT + 'hdr-cookies-l.png', KIT + 'hdr-cookies-r.png', KIT + 'hdr-elves-l.png', KIT + 'hdr-elves-r.png', KIT + 'divider-cookies.png', KIT + 'divider-elves.png', KIT + 'frame-pirates.jpg', KIT + 'frame-jungle.jpg', KIT + 'orn-pirates-skull.png'];
    book.chapters.forEach(function (c) {
      if (c.initial) urls.push(KIT + 'initials/' + c.initial + '.png');
      c.blocks.forEach(function (b) { if (b.t === 'image') urls.push(imageSrc(b)); });
    });
    return Promise.all(urls.map(function (u) {
      return new Promise(function (resolve) { var i = new Image(); i.onload = i.onerror = resolve; i.src = u; });
    }));
  }

  /** Раскладывает книгу по страницам внутри root. Возвращает { pages, sheets }. */
  function render(book, root, opts) {
    FRAME = (opts && opts.frame) || book.frame || 'rope';
    FOOTER = (opts && opts.footer) || book.footer || (FRAME === 'vine' ? 'birds' : 'sea');
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
            if (opts && opts.onlyGenerated && !/^data:/.test(block.src || '')) { imageIndex++; return; }
            sheets.push(illustrationSheet(root, block, imageIndex++));
            cur = null; // после иллюстрации текст продолжается на новой странице
            return;
          }
          if (!cur) { cur = textSheet(root, chapter, false); sheets.push(cur); }

          var isFirst = first && block.t === 'p';
          var node = renderBlock(block, isFirst ? { initial: chapter.initial, dropcap: !chapter.initial } : null);
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

      if (!(opts && opts.noFinale)) {
        sheets.push(finaleSheet(root, opts));
        if (opts && opts.certificate) sheets.push(certificateSheet(root, opts.certificate));
        (book.coloring || []).forEach(function (src, i) { sheets.push(coloringSheet(root, src, i === 0)); });
      }

      // сквозная нумерация по физическим страницам (иллюстрации считаются, но номер не показывают — как в образце)
      sheets.forEach(function (s, i) { if (s.folio) s.folio.textContent = String(i + 1); });
      return { pages: sheets.length, sheets: sheets };
    });
  }

  global.SkazkaBook = { render: render };
})(window);
