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

  /**
   * Кнопка «Слушать книгу». texts — массив абзацев по порядку. Читает по одному абзацу, чтобы длинную книгу
   * можно было поставить на паузу и продолжить с того же места.
   */
  function attachListen(button, getTexts) {
    if (!button) return;
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
    });
    global.addEventListener('beforeunload', function () { synth.cancel(); });
    label();
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
  function qrBlock(page, jobId, className) {
    var svg = qrSvg(bookUrl(page, jobId));
    if (!svg) return null;
    var box = document.createElement('div');
    box.className = className || 'qr-block';
    var code = document.createElement('div');
    code.className = 'qr-code';
    code.innerHTML = svg; // SVG собран библиотекой из нашего же адреса, пользовательского текста в нём нет
    var text = document.createElement('div');
    text.className = 'qr-text';
    text.textContent = 'Наведите камеру телефона — книга откроется онлайн: её можно читать и слушать вслух';
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
      '@media print{.sk-redraw,.sk-toast{display:none!important}}';
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

  global.SkazkaExtras = {
    attachEditor: attachEditor,
    paragraphText: paragraphText,
    attachListen: attachListen,
    bookUrl: bookUrl,
    qrBlock: qrBlock,
    orderSequel: orderSequel,
    readSequel: readSequel,
    certificate: certificate
  };
})(window);
