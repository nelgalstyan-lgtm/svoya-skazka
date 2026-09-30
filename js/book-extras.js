/*
 * Общие возможности обеих книг (book.html — «Сказка», book-pro.html — «Большая история»):
 *   — «Слушать»: книга читается вслух голосом устройства (бесплатно, работает офлайн);
 *   — QR-код на последней странице: ведёт на онлайн-версию книги (читать и слушать с телефона);
 *   — «Продолжение»: переносит анкету и краткое содержание книги в новую анкету;
 *   — сертификат «Герой книги» и раскраска — содержимое страниц (оформление рисует сама книга).
 */
(function (global) {
  'use strict';

  var SEQUEL_KEY = 'skazka:sequel';

  // ---------------------------------------------------------------- чтение вслух

  function pickVoice() {
    var voices = global.speechSynthesis ? global.speechSynthesis.getVoices() : [];
    var ru = voices.filter(function (v) { return /^ru/i.test(v.lang); });
    // «естественные» голоса (Microsoft Natural, Google) звучат заметно живее стандартных
    return ru.filter(function (v) { return /natural|google|online/i.test(v.name); })[0] || ru[0] || null;
  }

  /** Короткая подсказка под кнопкой (например, почему не звучит голос устройства). */
  function hintNear(button, text) {
    var box = button.parentNode.querySelector('.listen-hint');
    if (!box) {
      box = document.createElement('div');
      box.className = 'listen-hint';
      box.setAttribute('role', 'status');
      box.style.cssText = 'position:absolute; right:12px; top:100%; margin-top:8px; max-width:340px; z-index:20; padding:12px 14px; border-radius:12px; background:#FFFCF5; color:#3F2816; font:14px/1.45 "PT Sans",Arial,sans-serif; box-shadow:0 12px 26px -12px rgba(0,0,0,.55); border:1px solid #E2D3B5;';
      button.parentNode.style.position = 'relative';
      button.parentNode.appendChild(box);
    }
    box.textContent = text;
    clearTimeout(box._t);
    box._t = setTimeout(function () { box.remove(); }, 12000);
  }

  /**
   * Кнопка «Слушать книгу».
   * audio — готовая озвучка рассказчиком [{ title, src }] (если есть): играет главы по порядку.
   * Иначе texts — абзацы по порядку: читает голос устройства, по одному абзацу (пауза и продолжение с того же места).
   */
  function attachListen(button, getTexts, audio) {
    if (!button) return;
    if (audio && audio.length) return attachAudio(button, audio);
    if (!('speechSynthesis' in global)) { button.style.display = 'none'; return; }
    var synth = global.speechSynthesis;
    var queue = null;
    var index = 0;
    var playing = false;

    function label() { button.textContent = playing ? '⏸ Пауза' : (queue && index > 0 && index < queue.length ? '▶ Продолжить' : '🔊 Слушать книгу'); }

    function speakNext() {
      if (!playing) return;
      if (index >= queue.length) { playing = false; index = 0; label(); return; }
      var u = new SpeechSynthesisUtterance(queue[index]);
      u.lang = 'ru-RU';
      u.rate = 0.92; // сказку читают неспешно
      var voice = pickVoice();
      if (voice) u.voice = voice;
      u.onend = function () { index += 1; speakNext(); };
      u.onerror = function () { playing = false; label(); };
      synth.speak(u);
    }

    button.addEventListener('click', function () {
      if (!queue) queue = getTexts().filter(Boolean);
      if (playing) { playing = false; synth.cancel(); label(); return; }
      playing = true;
      label();
      speakNext();
      // голос устройства может молчать (нет русского голоса, браузер без синтеза речи) — не оставляем человека в тишине
      setTimeout(function () {
        if (playing && !synth.speaking && !synth.pending) {
          playing = false; synth.cancel(); label();
          hintNear(button, 'Не получилось включить чтение вслух: в этом браузере нет русского голоса. Откройте книгу в Chrome, Edge или Safari — или на телефоне.');
        }
      }, 2500);
    });
    global.addEventListener('beforeunload', function () { synth.cancel(); });
    label();
  }

  /** Настоящая озвучка: главы по порядку одной кнопкой, пауза и продолжение. */
  function attachAudio(button, tracks) {
    var player = new Audio();
    player.preload = 'none';
    var index = 0;
    function label() {
      button.textContent = !player.paused ? '⏸ Пауза' : (index > 0 || player.currentTime > 0 ? '▶ Продолжить' : '🔊 Слушать книгу');
      button.title = tracks[index] ? 'Сейчас: ' + tracks[index].title : '';
    }
    function load(i) { index = i; player.src = tracks[i].src; }
    player.addEventListener('ended', function () {
      if (index + 1 < tracks.length) { load(index + 1); player.play(); } else { index = 0; player.removeAttribute('src'); label(); }
    });
    player.addEventListener('play', label);
    player.addEventListener('pause', label);
    player.addEventListener('error', function () { label(); hintNear(button, 'Не получилось загрузить озвучку. Проверьте интернет и попробуйте ещё раз.'); });
    button.addEventListener('click', function () {
      if (!player.paused) { player.pause(); return; }
      if (!player.getAttribute('src')) load(index);
      player.play().catch(function () { hintNear(button, 'Браузер не дал включить звук — нажмите ещё раз.'); });
    });
    label();
  }

  // ---------------------------------------------------------------- песня по книге

  /**
   * Слова песни для страницы книги (порядок, как её поют: куплет, припев, два куплета, припев, финал);
   * второй раз припев — только пометкой. Оформление — у страницы (.song-lyrics и вложенные .song-part).
   */
  function songLyrics(song) {
    var box = document.createElement('div');
    box.className = 'song-lyrics';
    var verses = song.verses || [];
    var parts = [
      { kind: 'verse', lines: verses[0] },
      { kind: 'chorus', label: 'Припев', lines: song.chorus },
      { kind: 'verse', lines: verses[1] },
      { kind: 'verse', lines: verses[2] },
      { kind: 'repeat', label: 'Припев' },
      { kind: 'outro', lines: song.outro }
    ];
    parts.forEach(function (p) {
      if (p.kind !== 'repeat' && !(p.lines && p.lines.length)) return;
      var part = document.createElement('div');
      part.className = 'song-part song-' + p.kind;
      if (p.label) {
        var label = document.createElement('div');
        label.className = 'song-label';
        label.textContent = p.label + (p.kind === 'repeat' ? ' (повтор)' : '');
        part.appendChild(label);
      }
      (p.lines || []).forEach(function (line) {
        var l = document.createElement('div');
        l.className = 'song-line';
        l.textContent = line;
        part.appendChild(l);
      });
      box.appendChild(part);
    });
    return box;
  }

  /** Кнопка «🎵 Песня» в меню книги: включает и ставит на паузу. Песни нет — кнопка скрыта. */
  function attachSong(button, song) {
    if (!button) return;
    if (!song || !song.src) { button.hidden = true; return; }
    button.hidden = false;
    var player = new Audio();
    player.preload = 'none';
    function label() { button.textContent = player.paused ? '🎵 Песня' : '⏸ Пауза'; }
    player.addEventListener('play', label);
    player.addEventListener('pause', label);
    player.addEventListener('ended', function () { player.currentTime = 0; label(); });
    player.addEventListener('error', function () { label(); hintNear(button, 'Не получилось загрузить песню. Проверьте интернет и попробуйте ещё раз.'); });
    button.title = song.title ? '«' + song.title + '»' : '';
    button.addEventListener('click', function () {
      if (!player.paused) { player.pause(); return; }
      if (!player.getAttribute('src')) player.src = song.src;
      player.play().catch(function () { hintNear(button, 'Браузер не дал включить звук — нажмите ещё раз.'); });
    });
    label();
  }

  // ---------------------------------------------------------------- PDF-файл книги

  var PDF_LIBS = [
    '/assets/vendor/html2canvas.min.js',
    '/assets/vendor/jspdf.umd.min.js'
  ];

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[data-src="' + src + '"]')) return resolve();
      var el = document.createElement('script');
      el.src = src;
      el.setAttribute('data-src', src);
      el.onload = resolve;
      el.onerror = function () { reject(new Error('не загрузилось: ' + src)); };
      document.head.appendChild(el);
    });
  }

  /**
   * Кнопка «Скачать PDF»: страницы книги рисуются в картинки и собираются в PDF-файл нужного формата (в браузере,
   * без сервера). opts: { selector — страницы, widthMm, heightMm, scaleVar — CSS-переменная масштаба страниц,
   * fileName() }. Не вышло (старый браузер, нет интернета для библиотек) — открываем печать, там есть «Сохранить как PDF».
   */
  function libsReady() {
    return loadScript(PDF_LIBS[0]).then(function () { return loadScript(PDF_LIBS[1]); })
      .then(function () { return document.fonts ? document.fonts.ready : null; });
  }

  // снимок страницы книги в полном размере (без уменьшения под экран)
  function snap(node, scale, scaleVar, adjust) {
    node.setAttribute('data-pdf-snap', '1');
    return global.html2canvas(node, {
      scale: scale, useCORS: true, backgroundColor: '#ffffff', logging: false,
      onclone: function (doc) {
        if (scaleVar) doc.documentElement.style.setProperty(scaleVar, '1');
        var copy = doc.querySelector('[data-pdf-snap]');
        if (copy) keepImageFit(copy);
        if (adjust && copy) adjust(copy);
      }
    }).then(function (canvas) { node.removeAttribute('data-pdf-snap'); return canvas; },
      function (error) { node.removeAttribute('data-pdf-snap'); throw error; });
  }

  /**
   * html2canvas не умеет object-fit и растягивает такие картинки на весь блок (обложка, арка, иллюстрации).
   * В копии страницы заменяем их блоком с фоном: background-size cover/contain он рисует правильно.
   */
  function keepImageFit(page) {
    var win = page.ownerDocument.defaultView || global;
    Array.prototype.forEach.call(page.querySelectorAll('img'), function (im) {
      var cs = win.getComputedStyle(im);
      var fit = cs.objectFit;
      if (fit !== 'cover' && fit !== 'contain') return;
      var box = page.ownerDocument.createElement('div');
      box.className = im.className;
      box.style.cssText = im.style.cssText;
      box.style.display = cs.display === 'inline' ? 'inline-block' : cs.display;
      box.style.width = cs.width;
      box.style.height = cs.height;
      box.style.backgroundImage = 'url("' + String(im.currentSrc || im.src).replace(/"/g, '%22') + '")';
      box.style.backgroundSize = fit;
      box.style.backgroundPosition = cs.objectPosition || '50% 50%';
      box.style.backgroundRepeat = 'no-repeat';
      im.parentNode.replaceChild(box, im);
    });
  }

  /**
   * В переплёте правая страница (1-я, 3-я… в файле) прилегает к корешку левым краем, левая — правым.
   * Оформление сбоку (полоса, карта) должно быть с внешнего края, иначе у половины страниц оно уходит в клей:
   * на правых страницах переносим его вправо, а текст сдвигаем к корешку, сохраняя поля страницы.
   */
  function mirrorForBinding(page) {
    var win = page.ownerDocument.defaultView || global; // копия страницы живёт в своём окне
    // «Сказка» (book.html): полоса и поля меняются местами целиком через CSS-класс
    if (page.querySelector('.sk-strip')) { page.classList.add('sk-strip-right'); return; }
    var strip = page.querySelector('.bk-strip');
    if (!strip || win.getComputedStyle(strip).display === 'none') return;
    var cs = win.getComputedStyle(page);
    var l = parseFloat(cs.getPropertyValue('--l')), w = parseFloat(cs.getPropertyValue('--w'));
    if (!(l >= 0 && w > 0)) return;
    page.style.setProperty('--l', (page.offsetWidth - l - w) + 'px');
    strip.style.left = 'auto';
    strip.style.right = '0';
    strip.style.transform = 'scaleX(-1)';
  }

  /** Собирает PDF из страниц (selector) — по странице на лист widthMm×heightMm. */
  function buildPdf(button, opts) {
    var original = button.textContent;
    button.textContent = 'Готовим PDF…';
    return libsReady().then(function () {
      var pages = Array.prototype.slice.call(document.querySelectorAll(opts.selector));
      var w = opts.widthMm, h = opts.heightMm;
      var pdf = new global.jspdf.jsPDF({ unit: 'mm', format: [w, h], orientation: w > h ? 'l' : 'p', compress: true });
      var i = 0;
      function next() {
        if (i >= pages.length) return pdf;
        button.textContent = 'Готовим PDF: ' + (i + 1) + ' из ' + pages.length;
        // чётный номер в файле (с нуля) — правая страница разворота
        return snap(pages[i], 2, opts.scaleVar, i % 2 === 0 ? mirrorForBinding : null).then(function (canvas) {
          if (i > 0) pdf.addPage([w, h], w > h ? 'l' : 'p');
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, w, h, undefined, 'FAST');
          i += 1;
          return new Promise(function (r) { setTimeout(r, 0); }).then(next);
        });
      }
      return next();
    }).then(function (pdf) { pdf.save(opts.fileName()); })
      .then(function () { button.textContent = original; }, function (error) { button.textContent = original; throw error; });
  }

  function attachPdf(button, opts) {
    if (!button) return;
    var busy = false;
    button.addEventListener('click', function () {
      if (busy) return;
      busy = true;
      buildPdf(button, opts)
        .catch(function (error) {
          console.warn('[pdf]', error);
          hintNear(button, 'Не получилось собрать PDF в этом браузере. Открываем печать — выберите «Сохранить как PDF».');
          setTimeout(function () { global.print(); }, 800);
        })
        .then(function () { busy = false; });
    });
  }

  /**
   * Обложка для типографии одним листом: задняя сторона, корешок и лицевая, с запасом под обрез со всех сторон.
   * Размер листа: (ширина страницы × 2 + корешок + 2 × запас) × (высота + 2 × запас), в мм.
   */
  function buildCoverSpread(button, opts, spineMm) {
    var BLEED = 5; // мм под обрез (у твёрдого переплёта типография может попросить больше — это видно в их шаблоне)
    var original = button.textContent;
    button.textContent = 'Готовим обложку…';
    return libsReady().then(function () {
      var front = document.querySelector(opts.frontSelector);
      var back = document.querySelector(opts.backSelector);
      if (!front || !back) throw new Error('no cover pages');
      return snap(back, 3, opts.scaleVar).then(function (b) {
        return snap(front, 3, opts.scaleVar).then(function (f) { return [b, f]; });
      });
    }).then(function (pair) {
      var b = pair[0], f = pair[1];
      var pxmm = f.width / opts.widthMm;
      var bleed = Math.round(BLEED * pxmm), spine = Math.round(spineMm * pxmm);
      var W = bleed * 2 + b.width + spine + f.width, H = bleed * 2 + f.height;
      var c = document.createElement('canvas');
      c.width = W; c.height = H;
      var g = c.getContext('2d');
      g.drawImage(b, bleed, bleed);
      g.drawImage(f, bleed + b.width + spine, bleed);
      // корешок: цвет обложки, название снизу вверх и «Героёнок»
      g.fillStyle = opts.spineColor || '#1c1410';
      g.fillRect(bleed + b.width, bleed, spine, f.height);
      if (spineMm >= 6) {
        var text = (opts.title() || '') + '   ·   Героёнок';
        var size = Math.min(spine * 0.42, 6 * pxmm);
        g.save();
        g.translate(bleed + b.width + spine / 2, bleed + f.height / 2);
        g.rotate(-Math.PI / 2);
        g.fillStyle = opts.spineInk || '#fbe6b0';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        do { g.font = '700 ' + Math.round(size) + 'px ' + (opts.spineFont || 'Georgia, serif'); size *= 0.94; }
        while (g.measureText(text).width > f.height * 0.86 && size > 8);
        g.fillText(text, 0, 0);
        g.restore();
      }
      // запас под обрез: крайние ряды и столбцы вытягиваем наружу
      var t = document.createElement('canvas');
      t.width = W; t.height = H;
      var tg = t.getContext('2d');
      tg.drawImage(c, 0, 0);
      g.drawImage(t, 0, bleed, W, 1, 0, 0, W, bleed);
      g.drawImage(t, 0, bleed + f.height - 1, W, 1, 0, bleed + f.height, W, bleed);
      tg.drawImage(c, 0, 0);
      g.drawImage(t, bleed, 0, 1, H, 0, 0, bleed, H);
      g.drawImage(t, W - bleed - 1, 0, 1, H, W - bleed, 0, bleed, H);
      var wmm = W / pxmm, hmm = H / pxmm;
      var pdf = new global.jspdf.jsPDF({ unit: 'mm', format: [wmm, hmm], orientation: 'l', compress: true });
      pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, wmm, hmm, undefined, 'FAST');
      pdf.save(opts.fileBase() + ' — обложка (корешок ' + spineMm + ' мм).pdf');
    }).then(function () { button.textContent = original; }, function (error) { button.textContent = original; throw error; });
  }

  /**
   * Кнопка «Для типографии»: панель с двумя файлами — страницы книги без обложки и обложка одним листом.
   * В типографии обложку печатают отдельно от страниц, поэтому файлов два.
   */
  function attachPrintKit(button, opts) {
    if (!button) return;
    if (!document.getElementById('sk-print-kit-css')) {
      var css = document.createElement('style');
      css.id = 'sk-print-kit-css';
      css.textContent =
        '.print-kit{position:absolute;right:12px;top:100%;margin-top:8px;width:min(420px,calc(100vw - 24px));z-index:20;padding:16px 18px;border-radius:14px;background:#FFFCF5;color:#3F2816;font:14px/1.45 "PT Sans",Arial,sans-serif;box-shadow:0 14px 30px -12px rgba(0,0,0,.6);border:1px solid #E2D3B5;text-align:left}' +
        '.print-kit p{margin:0 0 12px}.print-kit .pk-note{margin:8px 0 0;font-size:12.5px;color:#7a6440}' +
        '.pk-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid #EADFC8}' +
        '.pk-row b{display:block;font-size:15px}.pk-row span{display:block;font-size:13px;color:#6b5a48}' +
        '.pk-btn{flex:none;border:none;border-radius:10px;padding:9px 16px;background:#C99A4B;color:#3F2816;font:700 14px Arial,sans-serif;cursor:pointer}' +
        '.pk-spine{display:flex;align-items:center;gap:10px;padding-top:10px;border-top:1px solid #EADFC8;font-weight:700}' +
        '.pk-spine input{width:72px;padding:6px 8px;border:1px solid #CDBB98;border-radius:8px;font:15px Arial,sans-serif}';
      document.head.appendChild(css);
    }
    var panel = null;
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', function () {
      if (panel) { panel.remove(); panel = null; button.setAttribute('aria-expanded', 'false'); return; }
      // примерная ширина корешка: лист ≈ 0,1 мм (2 страницы) плюс обложка
      var spineDefault = Math.max(5, Math.round(Math.ceil(opts.pagesCount() / 2) * 0.1 + 3));
      panel = document.createElement('div');
      panel.className = 'print-kit';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Файлы для типографии');
      panel.innerHTML = '<p class="pk-lead">В типографии обложку печатают отдельно от страниц — поэтому файлов два.</p>'
        + '<div class="pk-row"><div><b>1. Страницы книги</b><span>Все страницы, кроме обложки</span></div><button type="button" class="pk-btn" data-kind="block">Скачать</button></div>'
        + '<div class="pk-row"><div><b>2. Обложка одним листом</b><span>Задняя сторона, корешок и лицевая — на одном листе, с запасом 5 мм под обрез</span></div><button type="button" class="pk-btn" data-kind="cover">Скачать</button></div>'
        + '<label class="pk-spine">Ширина корешка, мм <input type="number" min="0" max="60" step="0.5" value="' + spineDefault + '"></label>'
        + '<p class="pk-note">Точную ширину корешка скажут в типографии: она зависит от бумаги и переплёта. Впишите их число и скачайте обложку заново.</p>';
      button.parentNode.style.position = 'relative';
      button.parentNode.appendChild(panel);
      button.setAttribute('aria-expanded', 'true');
      var busy = false;
      panel.addEventListener('click', function (e) {
        var b = e.target.closest('.pk-btn');
        if (!b || busy) return;
        busy = true;
        var job = b.getAttribute('data-kind') === 'block'
          ? buildPdf(b, { selector: opts.blockSelector, widthMm: opts.widthMm, heightMm: opts.heightMm, scaleVar: opts.scaleVar, fileName: function () { return opts.fileBase() + ' — страницы.pdf'; } })
          : buildCoverSpread(b, opts, Math.max(0, Number(panel.querySelector('input').value) || spineDefault));
        job.catch(function (error) {
          console.warn('[print-kit]', error);
          hintNear(button, 'Не получилось собрать файл в этом браузере. Попробуйте Chrome на компьютере.');
        }).then(function () { busy = false; });
      });
    });
  }

  /** Имя файла из названия книги: «Алекс и тайна Ани.pdf». */
  function pdfName(title) {
    return (String(title || 'Книга').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Книга') + '.pdf';
  }

  // ---------------------------------------------------------------- QR-код на онлайн-версию

  /** Адрес онлайн-версии книги. Для файла с диска или без jobId ссылки нет — QR не рисуем. */
  function bookUrl(page, jobId) {
    if (!jobId || !/^https?:$/.test(location.protocol)) return null;
    return location.origin + location.pathname.replace(/[^/]*$/, '') + page + '?job=' + encodeURIComponent(jobId);
  }

  /** SVG-разметка QR-кода (библиотека qrcode-generator) или null, если библиотека не загрузилась. */
  function qrSvg(url) {
    if (!url || typeof global.qrcode !== 'function') return null;
    var qr = global.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }

  /** Блок «Отсканируйте — и книга откроется на телефоне»: узел или null. */
  function qrBlock(page, jobId, className, label, url) {
    var svg = qrSvg(url || bookUrl(page, jobId));
    if (!svg) return null;
    var box = document.createElement('div');
    box.className = className || 'qr-block';
    var code = document.createElement('div');
    code.className = 'qr-code';
    code.innerHTML = svg; // SVG собран библиотекой из нашего же адреса, пользовательского текста в нём нет
    var text = document.createElement('div');
    text.className = 'qr-text';
    text.textContent = label || 'Наведите камеру телефона — книга откроется онлайн: её можно читать и слушать вслух';
    box.append(code, text);
    return box;
  }

  // ---------------------------------------------------------------- продолжение

  /** Сохраняет всё для второй книги и открывает анкету: те же герои и спутники, новый сюжет. */
  function orderSequel(answers, title, summary) {
    var sequel = 'Первая книга — «' + title + '». ' + String(summary || '').slice(0, 900);
    try {
      localStorage.setItem(SEQUEL_KEY, JSON.stringify({ answers: answers || {}, sequel: sequel, title: title }));
    } catch (e) { /* хранилище недоступно — анкета откроется пустой */ }
    location.href = 'create.html?sequel=1';
  }

  function readSequel() {
    try { return JSON.parse(localStorage.getItem(SEQUEL_KEY) || 'null'); } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- сертификат героя

  function formatDate(d) {
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /** Текст сертификата «Герой книги» — оформление рисует страница. */
  function certificate(name, title, girl) {
    return {
      kicker: 'Сертификат',
      title: girl ? 'Героиня книги' : 'Герой книги',
      name: name,
      text: 'Настоящим подтверждается, что ' + name + ' — ' + (girl ? 'главная героиня' : 'главный герой') + ' книги «' + title + '» и с честью ' + (girl ? 'прошла' : 'прошёл') + ' все её испытания: ' + (girl ? 'проявила' : 'проявил') + ' смелость, доброту и находчивость.',
      date: formatDate(new Date())
    };
  }

  // ---------------------------------------------------------------- бесплатные правки

  function toast(text, tone) {
    var box = document.createElement('div');
    box.className = 'sk-toast' + (tone === 'error' ? ' is-error' : '');
    box.textContent = text;
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 4200);
  }

  function injectEditorStyles() {
    if (document.getElementById('sk-editor-css')) return;
    var css = document.createElement('style');
    css.id = 'sk-editor-css';
    css.textContent =
      '.sk-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:50;background:#232C4D;color:#F4EFE0;padding:12px 20px;border-radius:12px;font:15px/1.4 Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:calc(100% - 32px)}' +
      '.sk-toast.is-error{background:#7f1d2c}' +
      '.sk-editing [contenteditable=true]{outline:2px dashed rgba(215,154,58,.7);outline-offset:3px;border-radius:2px;cursor:text}' +
      '.sk-redraw{position:absolute;z-index:6;right:12px;top:12px;border:none;border-radius:999px;padding:8px 14px;background:rgba(35,44,77,.9);color:#F4EFE0;font:700 13px Arial,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35)}' +
      '.sk-redraw[disabled]{opacity:.6;cursor:wait}' +
      '.sk-pay{border:none;border-radius:999px;padding:16px 30px;background:#D79A3A;color:#232C4D;font:700 18px Arial,sans-serif;cursor:pointer;box-shadow:0 10px 24px -10px rgba(120,70,10,.6)}' +
      '.sk-pay[disabled]{opacity:.7;cursor:wait}' +
      '@media print{.sk-redraw,.sk-toast,.sk-pay{display:none!important}}';
    document.head.appendChild(css);
  }

  /** Текст абзаца как в книге: у первого абзаца главы буква может быть нарисована картинкой-буквицей. */
  function paragraphText(p) {
    var initial = p.querySelector('img.bk-initial');
    return ((initial ? initial.alt : '') + p.textContent).replace(/ /g, ' ').trim();
  }

  /**
   * Режим правок: текст становится редактируемым прямо на странице, на каждой иллюстрации — «Перерисовать».
   * opts: { button, apiBase, jobId, editable() → [узлы], collectEdits() → [{...}], images() → [{ img, index, host }],
   *         canRedraw, redrawsLeft }
   */
  function attachEditor(opts) {
    var button = opts.button;
    if (!button || !opts.jobId) return;
    injectEditorStyles();
    button.hidden = false;
    var editing = false;
    var left = opts.redrawsLeft || 0;
    var redrawButtons = [];

    function redrawLabel() { return '↻ Перерисовать · осталось ' + left; }

    function redraw(item, btn) {
      var wish = global.prompt('Что изменить на иллюстрации? Например: «пусть улыбается», «добавь кота». Можно оставить пустым.', '');
      if (wish === null) return;
      btn.disabled = true;
      btn.textContent = 'Рисуем… около минуты';
      fetch(opts.apiBase + '/api/book/' + encodeURIComponent(opts.jobId) + '/redraw', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: item.index, wish: wish })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Не получилось');
        item.img.src = res.d.src;
        left = res.d.left;
        toast('Готово! Новая иллюстрация уже в книге.');
      }).catch(function (e) {
        toast(e.message, 'error');
      }).then(function () {
        redrawButtons.forEach(function (b) { b.disabled = left <= 0; b.textContent = left > 0 ? redrawLabel() : 'Перерисовки закончились'; });
      });
    }

    function enter() {
      editing = true;
      document.body.classList.add('sk-editing');
      opts.editable().forEach(function (node) { node.setAttribute('contenteditable', 'true'); node.spellcheck = true; });
      if (opts.canRedraw) {
        opts.images().forEach(function (item) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'sk-redraw';
          btn.textContent = left > 0 ? redrawLabel() : 'Перерисовки закончились';
          btn.disabled = left <= 0;
          btn.addEventListener('click', function () { redraw(item, btn); });
          item.host.appendChild(btn);
          redrawButtons.push(btn);
        });
      }
      button.textContent = '💾 Сохранить правки';
      toast(opts.canRedraw ? 'Нажмите на текст, чтобы исправить его. На иллюстрациях — кнопка «Перерисовать».' : 'Нажмите на текст, чтобы исправить его.');
    }

    function leave() {
      var edits = opts.collectEdits();
      button.disabled = true;
      fetch(opts.apiBase + '/api/book/' + encodeURIComponent(opts.jobId) + '/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ edits: edits })
      }).then(function (r) {
        if (!r.ok) throw new Error('Не удалось сохранить правки. Попробуйте ещё раз.');
        // страницы перераскладываются заново: исправленный текст может занять больше места
        location.reload();
      }).catch(function (e) {
        button.disabled = false;
        toast(e.message, 'error');
      });
    }

    button.addEventListener('click', function () { if (editing) leave(); else enter(); });
  }

  // ---------------------------------------------------------------- превью и оплата

  function rub(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽'; }

  /**
   * Кнопка «Получить всю книгу». Оплата подключается последним этапом: когда она появится, страница задаёт
   * window.SkazkaPay(jobId). До этого — понятное сообщение. ?admin=КЛЮЧ в адресе — тестовая разблокировка
   * (тот же ADMIN_KEY, что в server/.env).
   */
  function payButton(opts) {
    injectEditorStyles();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sk-pay';
    btn.textContent = 'Получить всю книгу — ' + rub(opts.price);
    btn.addEventListener('click', function () {
      if (typeof global.SkazkaPay === 'function') { global.SkazkaPay(opts.jobId, opts.price); return; }
      var admin = new URLSearchParams(location.search).get('admin');
      if (admin) { unlock(opts, admin, btn); return; }
      toast('Онлайн-оплата появится совсем скоро. Сохраните ссылку на эту страницу — книга будет ждать вас.');
    });
    return btn;
  }

  function unlock(opts, key, btn) {
    btn.disabled = true;
    btn.textContent = 'Дорисовываем книгу…';
    fetch(opts.apiBase + '/api/book/' + encodeURIComponent(opts.jobId) + '/unlock', { method: 'POST', headers: { 'x-admin-key': key } })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Не получилось'); }); })
      .then(function () { location.reload(); })
      .catch(function (e) { btn.disabled = false; btn.textContent = 'Получить всю книгу — ' + rub(opts.price); toast(e.message, 'error'); });
  }

  /** Текст закрытой страницы превью: что ещё будет в книге после оплаты. */
  function lockedText(opts) {
    var parts = [];
    if (opts.pages) parts.push('ещё ' + opts.pages + ' ' + plural(opts.pages, 'страница', 'страницы', 'страниц') + ' истории — и на каждой ' + opts.name + ' нарисован' + (opts.girl ? 'а' : '') + ' по вашему фото');
    if (opts.chapters && opts.chapters.length) parts.push('ещё ' + opts.chapters.length + ' ' + plural(opts.chapters.length, 'глава', 'главы', 'глав') + ': ' + opts.chapters.map(function (t) { return '«' + t + '»'; }).join(', '));
    if (opts.images) parts.push(opts.images + ' ' + plural(opts.images, 'иллюстрация', 'иллюстрации', 'иллюстраций') + ' с героем');
    if (opts.coloring) parts.push('раскраска из иллюстраций книги');
    parts.push('сертификат героя, чтение вслух, PDF для печати и бесплатные правки');
    return 'В полной книге: ' + parts.join('; ') + '.';
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  global.SkazkaExtras = {
    payButton: payButton,
    lockedText: lockedText,
    attachEditor: attachEditor,
    paragraphText: paragraphText,
    attachListen: attachListen,
    songLyrics: songLyrics,
    attachSong: attachSong,
    attachPdf: attachPdf,
    attachPrintKit: attachPrintKit,
    pdfName: pdfName,
    bookUrl: bookUrl,
    qrBlock: qrBlock,
    orderSequel: orderSequel,
    readSequel: readSequel,
    certificate: certificate
  };
})(window);
