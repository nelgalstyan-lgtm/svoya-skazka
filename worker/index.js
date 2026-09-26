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
  }
};
