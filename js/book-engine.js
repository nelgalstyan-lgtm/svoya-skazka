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
    wild: ['hdr-wild.png', 'hdr-wild.png', true]
  };

  function divider(withLines) {
    var d = h('div', 'bk-divider');
    var icons = HEADER_ICONS[FOOTER];
    d.appendChild(h('i'));
    d.appendChild(img(KIT + (icons ? icons[1] : 'trefoil.png'), '', ''));
    d.appendChild(h('i'));
    return d;
  }

  var FRAME = 'rope';
  var FOOTER = 'sea'; // колонтитул: treasure | wild | sea | birds

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
    } else {
      var run = h('div', 'bk-run');
      var icons = HEADER_ICONS[FOOTER];
      run.appendChild(img(KIT + (icons ? icons[0] : 'fleuron-l.png'), '', ''));
      run.appendChild(h('span', '', chapter.title));
      run.appendChild(img(KIT + (icons ? icons[1] : 'fleuron-r.png'), icons && icons[2] ? 'bk-mirror' : '', ''));
      page.appendChild(run);
      page.appendChild(h('div', 'bk-run-rule'));
    }

    var content = h('div', 'bk-content');
    page.appendChild(content);

    if (opener) {
      // длинное название главы может занять две строки — сдвигаем текст вниз, чтобы они не наложились
      var headBottom = 78 + page.querySelector('.bk-opener-head').offsetHeight;
      var top = Math.max(246, headBottom + 44);
      content.style.top = top + 'px';
      content.style.height = ((FOOTER === 'birds' ? 800 : 790) - top) + 'px';
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

  function illustrationSheet(root, block) {
    var page = newSheet(root, 'bk-ill');
    var pic = img(imageSrc(block), 'bk-ill-img', block.caption || '');
    page.appendChild(pic);
    // у морского и поискового оформления на табличке деревянный медальон, у «лозы» — исходная розетка образца
    var wood = FRAME !== 'vine';
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
      document.fonts.load('26px "Marck Script"'), document.fonts.load('700 30px Caveat')
    ]).catch(function () {});
  }

  function preloadImages(book) {
    var urls = [KIT + 'hdr-treasure-l.png', KIT + 'hdr-treasure-r.png', KIT + 'hdr-wild.png', KIT + 'hdr-sea.svg', KIT + 'footer-treasure.png', KIT + 'footer-wild.png', KIT + 'footer-sea.png', KIT + 'medallion.png', KIT + 'parchment.jpg', KIT + 'strip.png', KIT + 'bird-l.png', KIT + 'bird-r.png', KIT + 'fleuron-l.png', KIT + 'fleuron-r.png', KIT + 'trefoil.png', KIT + 'rosette.png', KIT + 'plate-band.png'];
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

      if (book.dedication) sheets.push(dedicationSheet(root, book.dedication));

      book.chapters.forEach(function (chapter) {
        var cur = textSheet(root, chapter, true);
        sheets.push(cur);
        var first = true;

        chapter.blocks.forEach(function (block) {
          if (block.t === 'image') {
            sheets.push(illustrationSheet(root, block));
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
            cur.content.appendChild(renderBlock(block, null));
          }
        });
      });

      // сквозная нумерация по физическим страницам (иллюстрации считаются, но номер не показывают — как в образце)
      sheets.forEach(function (s, i) { if (s.folio) s.folio.textContent = String(i + 1); });
      return { pages: sheets.length, sheets: sheets };
    });
  }

  global.SkazkaBook = { render: render };
})(window);
