// Удаление книг через год после заказа (обещано в политике конфиденциальности: «Готовая книга хранится один год»).
// Запускается по расписанию Worker'а (triggers.crons в wrangler.jsonc), раз в час.
// За один запуск — не больше MAX_PER_RUN книг: остальные удалятся в следующие часы.

import { createStore } from './store.js';

export const KEEP_MS = 365 * 24 * 60 * 60_000;
const MAX_PER_RUN = 25;

export async function removeExpiredBooks(env, { now = Date.now(), log = console.log } = {}) {
  const store = createStore(env.BUCKET);
  const ids = (await store.jobsCreatedBefore(now - KEEP_MS)).slice(0, MAX_PER_RUN);
  for (const id of ids) {
    const files = await store.removeBook(id);
    log(`[cleanup] ${id}: книга старше года удалена (${files} файлов)`);
  }
  return ids;
}
