// Счётчик Яндекс Метрики (113598642) на всех страницах собранного сайта: перед </head> в dist/*.html.
// Запускается из scripts/build-pages.sh. Защита данных детей:
// — на личных книгах (?job=… в адресе) счётчик не запускается, Вебвизор их не записывает;
// — поля ввода (анкета: имя ребёнка и т.п.) получают класс ym-disable-keys — Вебвизор не записывает, что в них вводят.
// Об использовании Метрики сказано в privacy.html (раздел «Cookie и Яндекс Метрика»).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] || 'dist';
const ID = 113598642;
const snippet = `<!-- Yandex.Metrika counter -->
<script type="text/javascript">
    if (!/[?&]job=/.test(location.search)) {
    (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${ID}', 'ym');

    ym(${ID}, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('input, textarea, select').forEach(function (el) { el.classList.add('ym-disable-keys'); });
    });
    }
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/${ID}" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
<!-- /Yandex.Metrika counter -->
`;

let n = 0;
for (const f of readdirSync(dist).filter((name) => name.endsWith('.html'))) {
  const file = join(dist, f);
  const s = readFileSync(file, 'utf8');
  if (s.includes('mc.yandex.ru/metrika') || !s.includes('</head>')) continue;
  writeFileSync(file, s.replace('</head>', snippet + '</head>'));
  n += 1;
}
console.log(`metrika: счётчик на ${n} страницах`);
