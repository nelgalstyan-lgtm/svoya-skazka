// Worker «Героёнок»: сайт (статика из dist/) и API на /api/*. Книги создаются в фоне Workflow'ом BookWorkflow,
// который запускается из очереди geroenok-start.

import { WorkflowEntrypoint } from 'cloudflare:workers';
import { handleApi } from './api.js';
import { runBook } from './book.js';
import { queueHandler } from './queue.js';
import { removeExpiredBooks } from './cleanup.js';

export class BookWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    await runBook(this.env, event.payload, step);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
    return env.ASSETS.fetch(request);
  },

  // книги запускаются из очереди: так OpenAI не видит страну покупателя (см. queue.js)
  queue: queueHandler,

  // раз в час: удалить книги старше года (см. cleanup.js)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(removeExpiredBooks(env));
  }
};
