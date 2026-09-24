// Временное хранилище фото ребёнка: между бесплатным превью и оплатой.
//
// Превью рисует только лист персонажа, обложку и одну иллюстрацию — остальные дорисовываются после оплаты,
// и для них снова нужны фото. Поэтому фото лежат здесь, пока книга не дорисована (тогда удаляются сразу),
// но не дольше PHOTO_TTL_HOURS (по умолчанию 48 часов) — неоплаченное превью фото с собой не уносит.
// Отдельно от книги: книга хранится год, фото — никогда дольше этого срока.

import fs from 'node:fs';
import path from 'node:path';

const ID_RE = /^[a-f0-9-]{36}$/;

export function createPhotoStore({ dir, ttlMs = Number(process.env.PHOTO_TTL_HOURS || 48) * 60 * 60_000, log = console.log } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (id) => {
    if (!ID_RE.test(id)) throw new Error('bad job id');
    return path.join(dir, `${id}.json`);
  };

  function save(id, photos) {
    fs.writeFileSync(file(id), JSON.stringify(photos));
  }

  /** Фото заказа или [] — если уже удалены или истёк срок. */
  function load(id) {
    try {
      const full = file(id);
      if (Date.now() - fs.statSync(full).mtimeMs > ttlMs) { remove(id); return []; }
      return JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch {
      return [];
    }
  }

  function remove(id) {
    try { fs.rmSync(file(id), { force: true }); } catch { /* нечего удалять */ }
  }

  function cleanup() {
    const now = Date.now();
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      try {
        if (now - fs.statSync(full).mtimeMs > ttlMs) { fs.rmSync(full, { force: true }); log(`[photos] expired ${name}`); }
      } catch { /* файл уже удалён */ }
    }
  }

  const timer = setInterval(cleanup, 30 * 60_000);
  timer.unref?.();
  cleanup();

  return { save, load, remove, cleanup, ttlMs };
}
