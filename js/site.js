// Общие мелочи страниц сайта (не книг): липкая кнопка на телефоне, листалка разворотов, цели Метрики.
// Подключается в конце <body> на всех страницах с шапкой .site-header.
(function () {
  'use strict';

  // --- цели Яндекс Метрики (счётчик ставит scripts/add-metrika.mjs при сборке; без него — тишина) ---
  var METRIKA_ID = 113598642;
  var sent = {};
  function goal(name, once) {
    if (once && sent[name]) return;
    sent[name] = true;
    try { if (typeof window.ym === 'function') window.ym(METRIKA_ID, 'reachGoal', name); } catch (e) { /* нет счётчика */ }
  }
  window.geroenokGoal = goal;

  // клики по кнопкам и ссылкам с data-goal="…" (главная кнопка, «Полистать», финальный призыв)
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('a[data-goal], button[data-goal]');
    if (el) goal(el.getAttribute('data-goal'));
  });
  // аудио-образцы: первое включение на странице
  document.addEventListener('play', function (e) {
    if (e.target && e.target.tagName === 'AUDIO') goal(e.target.getAttribute('data-goal') || 'audio_play', true);
  }, true);

  // --- липкая кнопка: на телефоне кнопки в шапке нет (geroenok.css); после первого экрана внизу «Создать бесплатное превью».
  // На самой анкете кнопка не нужна.
  var cta = document.querySelector('.header-cta');
  if (cta && !/\/create(\.html)?$/.test(location.pathname)) {
    var bar = document.createElement('div');
    bar.className = 'sticky-cta';
    var a = document.createElement('a');
    a.className = 'btn btn-primary';
    a.href = cta.getAttribute('href');
    a.textContent = 'Создать бесплатное превью';
    a.setAttribute('data-goal', 'sticky_cta');
    bar.appendChild(a);
    document.body.appendChild(bar);
    document.body.classList.add('has-sticky-cta');

    var shown = false;
    var check = function () {
      var want = window.scrollY > window.innerHeight * 0.8;
      if (want !== shown) { shown = want; bar.classList.toggle('is-shown', want); }
    };
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    check();
  }

  // --- обложка на первом экране главной чуть поворачивается за мышью (±3°); на телефоне и при «уменьшить движение» — нет
  var heroBook = document.querySelector('.hh-book');
  if (heroBook && matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var hero = heroBook.closest('.hero-home') || heroBook;
    var frame = 0, mx = 0, my = 0;
    var tilt = function () {
      frame = 0;
      var r = heroBook.getBoundingClientRect();
      var nx = Math.max(-1, Math.min(1, (mx - (r.left + r.width / 2)) / (window.innerWidth / 2)));
      var ny = Math.max(-1, Math.min(1, (my - (r.top + r.height / 2)) / (window.innerHeight / 2)));
      heroBook.style.setProperty('--tilt-y', (nx * 3).toFixed(2) + 'deg');
      heroBook.style.setProperty('--tilt-x', (-ny * 3).toFixed(2) + 'deg');
    };
    hero.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      if (!frame) frame = requestAnimationFrame(tilt);
    });
    hero.addEventListener('mouseleave', function () {
      heroBook.style.setProperty('--tilt-x', '0deg');
      heroBook.style.setProperty('--tilt-y', '0deg');
    });
  }

  // --- листалка разворотов на главной ([data-flip]): вкладки книг, стрелки, счётчик; свайп — прокруткой ленты ---
  document.querySelectorAll('[data-flip]').forEach(function (flip) {
    var tabs = flip.querySelectorAll('.hf-tabs [data-book]');
    var prev = flip.querySelector('.hf-prev');
    var next = flip.querySelector('.hf-next');
    var count = flip.querySelector('.hf-count');
    var title = flip.querySelector('.hf-title');
    var open = flip.querySelector('.hf-open');
    var book = flip.querySelector('.hf-book:not([hidden])');

    function track() { return book.querySelector('.hf-track'); }
    function update() {
      var t = track();
      var pages = t.children.length;
      var w = t.children[0].getBoundingClientRect().width || 1;
      var perView = Math.max(1, Math.round(t.clientWidth / w));
      var first = Math.round(t.scrollLeft / w) + 1;
      var last = Math.min(pages, first + perView - 1);
      count.textContent = (perView > 1 ? 'Страницы ' + first + '–' + last : 'Страница ' + first) + ' из ' + pages;
      prev.disabled = t.scrollLeft < 4;
      next.disabled = t.scrollLeft + t.clientWidth > t.scrollWidth - 4;
    }
    function go(dir) {
      var t = track();
      t.scrollBy({ left: dir * t.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      goal('spread_flip', true);
    }
    prev.addEventListener('click', function () { go(-1); });
    next.addEventListener('click', function () { go(1); });
    flip.querySelectorAll('.hf-track').forEach(function (t) {
      var timer;
      t.addEventListener('scroll', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { update(); if (t.scrollLeft > 4) goal('spread_flip', true); }, 80);
      }, { passive: true });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      });
    });
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (b) { b.setAttribute('aria-selected', String(b === tab)); });
        flip.querySelectorAll('.hf-book').forEach(function (bk) { bk.hidden = bk.id !== tab.getAttribute('data-book'); });
        book = flip.querySelector('#' + tab.getAttribute('data-book'));
        track().scrollLeft = 0;
        title.textContent = book.getAttribute('data-title') + '.';
        open.href = book.getAttribute('data-href');
        update();
        goal('spread_style', true);
      });
    });
    window.addEventListener('resize', update);
    window.addEventListener('load', update);
    update();
  });
})();
