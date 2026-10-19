// Общие мелочи страниц сайта (не книг): липкая кнопка на телефоне.
// Подключается в конце <body> на всех страницах с шапкой .site-header.
(function () {
  'use strict';

  // На телефоне кнопки в шапке нет (geroenok.css): после первого экрана внизу появляется «Создать бесплатное превью».
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
})();
