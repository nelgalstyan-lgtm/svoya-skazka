// Worker «Героёнок»: сайт (статика из dist/) и API на /api/*. Книги создаются в фоне Workflow'ом BookWorkflow.

import { WorkflowEntrypoint } from 'cloudflare:workers';
import { handleApi } from './api.js';
import { runBook } from './book.js';

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
    return env.ASSETS.fetch(request);
  },

  // ВРЕМЕННО (проверка 26.09): отвечает ли OpenAI, если рисование запущено не из запроса покупателя
  async scheduled(event, env) {
    if (new Date(event.scheduledTime).getUTCMinutes() % 2) return;
    const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` } }).catch(() => null);
    console.log(`[diag] cron: openai ${r ? r.status : 'network error'}`);
    await env.BOOK_WORKFLOW.create({ params: { mode: 'diag', country: 'cron' } });
  },

  async queue(batch, env) {
    for (const msg of batch.messages) {
      const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` } }).catch(() => null);
      console.log(`[diag] queue from ${msg.body.country}: openai ${r ? r.status : 'network error'}`);
      await env.BOOK_WORKFLOW.create({ params: { mode: 'diag', country: `queue-from-${msg.body.country}` } });
      msg.ack();
    }
  }
};
