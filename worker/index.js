// Worker «Героёнок»: сайт (статика из dist/) и API на /api/*. Книги создаются в фоне Workflow'ом BookWorkflow,
// который запускается из очереди geroenok-start.

import { WorkflowEntrypoint } from 'cloudflare:workers';
import { handleApi } from './api.js';
import { runBook } from './book.js';
import { queueHandler } from './queue.js';
import { recheckArt } from './art.js';
import { removeExpiredBooks } from './cleanup.js';

export class BookWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    await runBook(this.env, event.payload, step);
  }
}

// Подтверждение прав в Яндекс Вебмастере: файл должен отвечать 200 по адресу с .html (статика переадресовала бы на адрес без .html)
const YANDEX_VERIFY = { '/yandex_e834183a40931d36.html': 'e834183a40931d36' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // один адрес сайта для поисковиков: www → без www, навсегда (301)
    if (url.hostname === 'www.geroenok.online') {
      url.hostname = 'geroenok.online';
      return Response.redirect(url.toString(), 301);
    }
    // ВРЕМЕННО (10.10): какие заголовки присылает шлюз — чтобы понять, можно ли отличить www. Только имена, без значений.
    if (url.pathname === '/__gw-headers') {
      return Response.json({ host: url.hostname, names: [...request.headers.keys()],
        forwarded: Object.fromEntries([...request.headers].filter(([k]) => /forwarded|original|host|uri|url/i.test(k))) });
    }
    if (YANDEX_VERIFY[url.pathname]) {
      return new Response(`<html>\n    <head>\n        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">\n    </head>\n    <body>Verification: ${YANDEX_VERIFY[url.pathname]}</body>\n</html>\n`,
        { headers: { 'content-type': 'text/html; charset=UTF-8' } });
    }
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env);
      } catch (error) {
        console.error('[api]', error?.stack || error);
        return Response.json({ ok: false, error: 'Что-то пошло не так. Попробуйте ещё раз через минуту.' }, { status: 500 });
      }
    }
    // закрытые страницы только по ссылке: /p/<длинный код> → R2 private/<код>.html (в репозитории их нет — он открытый)
    const priv = /^\/p\/([A-Za-z0-9_-]{20,64})\/?$/.exec(url.pathname);
    if (priv) {
      const obj = await env.BUCKET.get(`private/${priv[1]}.html`);
      if (!obj) { const nf = await env.ASSETS.fetch(new Request(new URL('/404', url), request)); return new Response(nf.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } }); }
      return new Response(obj.body, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' } });
    }
    // /pricing/ → /pricing: у каждой страницы один адрес. Location — относительный: сайт открывают через шлюз Яндекса,
    // а Worker видит адрес workers.dev — абсолютная ссылка увела бы посетителя туда
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      return new Response(null, { status: 301, headers: { location: url.pathname.replace(/\/+$/, '') + url.search } });
    }
    const res = await env.ASSETS.fetch(request);
    // статика отвечает 307 на /pricing.html → /pricing; поисковикам нужна постоянная переадресация 301
    if ((res.status === 307 || res.status === 308) && res.headers.get('location')) {
      const to = new URL(res.headers.get('location'), url);
      return new Response(null, { status: 301, headers: { location: to.pathname + to.search } });
    }
    return res;
  },

  // книги запускаются из очереди: так OpenAI не видит страну покупателя (см. queue.js)
  queue: queueHandler,

  // раз в час: удалить книги старше года (см. cleanup.js)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(removeExpiredBooks(env));
    ctx.waitUntil(recheckArt(env).catch((e) => console.warn(`[art] проверка OpenAI: ${e?.message || e}`)));
  }
};
