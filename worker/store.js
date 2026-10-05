// Хранилище в R2 (бакет geroenok):
//   jobs/<id>.json      — задача и книга; картинок внутри нет, только ссылки /api/img/…
//   img/<id>/<file>     — иллюстрации (WebP), лист персонажа, раскраска
//   media/<id>/<file>   — озвучка книги (mp3 на главу, отдаётся через /api/media/…); voice-tmp/<id>/ — куски до склейки
//   photos/<id>/<n>     — фото ребёнка: до оплаты (не дольше PHOTO_TTL_HOURS) и до конца дорисовки
// Правило жизненного цикла R2 дополнительно удаляет photos/ старше 2 суток — даже если код что-то пропустит.
// Книга целиком (все эти папки) удаляется через год после заказа — см. cleanup.js; дата заказа хранится
// и в метаданных jobs/<id>.json, чтобы находить старые книги по списку, не открывая каждую.

import { fromBase64 } from './bytes.js';

const ID_RE = /^[a-f0-9-]{36}$/;
const FILE_RE = /^[a-z0-9-]+\.(webp|png|jpeg)$/;
const IMG_SRC_RE = /^\/api\/img\/([a-f0-9-]{36})\/([a-z0-9-]+\.(?:webp|png|jpeg))$/;

export const isJobId = (id) => ID_RE.test(String(id || ''));
export const isImageFile = (file) => FILE_RE.test(String(file || ''));

const EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpeg' };

export function createStore(bucket, { photoTtlMs = 48 * 60 * 60_000 } = {}) {
  const jobKey = (id) => `jobs/${id}.json`;

  async function getJob(id) {
    if (!isJobId(id)) return null;
    const obj = await bucket.get(jobKey(id));
    return obj ? obj.json() : null;
  }

  async function saveJob(job) {
    await bucket.put(jobKey(job.id), JSON.stringify(job), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { createdAt: String(job.createdAt || Date.now()) }
    });
  }

  /** Все ключи под префиксом (R2 отдаёт список страницами по 1000). */
  async function listKeys(prefix, include) {
    const out = [];
    let cursor;
    do {
      const page = await bucket.list({ prefix, cursor, ...(include ? { include } : {}) });
      out.push(...page.objects);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return out;
  }

  /** Книги, заказанные раньше before (мс): [id]. У старых записей без метаданных — дата последнего сохранения (она не раньше заказа). */
  async function jobsCreatedBefore(before) {
    const objects = await listKeys('jobs/', ['customMetadata']);
    return objects
      .filter((o) => {
        const created = Number(o.customMetadata?.createdAt) || new Date(o.uploaded).getTime();
        return created < before;
      })
      .map((o) => o.key.slice(5, -5))
      .filter(isJobId);
  }

  /** Удаляет книгу со всеми файлами: иллюстрации, озвучка, песня, фото. Саму запись — последней, чтобы при сбое повторить. */
  async function removeBook(id) {
    if (!isJobId(id)) return 0;
    let removed = 0;
    for (const prefix of [`img/${id}/`, `media/${id}/`, `voice-tmp/${id}/`, `photos/${id}/`]) {
      const keys = (await listKeys(prefix)).map((o) => o.key);
      for (let k = 0; k < keys.length; k += 1000) await bucket.delete(keys.slice(k, k + 1000));
      removed += keys.length;
    }
    await bucket.delete(jobKey(id));
    return removed + 1;
  }

  /** Прочитать задачу, поменять и сохранить. Возвращает изменённую задачу (или null, если её нет). */
  async function updateJob(id, change) {
    const job = await getJob(id);
    if (!job) return null;
    change(job);
    await saveJob(job);
    return job;
  }

  // Фото родного («Большая история», 1 родной по фото) — там же, photos/<id>/f<n>: тот же срок, то же удаление и правило R2
  async function savePhotos(id, photos, { family = false } = {}) {
    await Promise.all(photos.map((p, i) => bucket.put(`photos/${id}/${family ? 'f' : ''}${i}`, p.bytes, { httpMetadata: { contentType: p.mime } })));
  }

  /** Фото заказа: [{ mime, bytes }] или [] — если уже удалены или истёк срок хранения. family: true — фото родного. */
  async function loadPhotos(id, { family = false } = {}) {
    const list = await bucket.list({ prefix: `photos/${id}/` });
    const mine = family ? /\/f(\d+)$/ : /\/(\d+)$/;
    const fresh = list.objects
      .filter((o) => mine.test(o.key) && Date.now() - new Date(o.uploaded).getTime() <= photoTtlMs)
      .sort((a, b) => Number(mine.exec(a.key)[1]) - Number(mine.exec(b.key)[1]));
    const photos = await Promise.all(fresh.map(async (o) => {
      const obj = await bucket.get(o.key);
      return obj && { mime: obj.httpMetadata?.contentType || 'image/jpeg', bytes: new Uint8Array(await obj.arrayBuffer()) };
    }));
    return photos.filter(Boolean);
  }

  async function removePhotos(id) {
    const list = await bucket.list({ prefix: `photos/${id}/` });
    if (list.objects.length) await bucket.delete(list.objects.map((o) => o.key));
  }

  /** Сохраняет картинку и возвращает её адрес для книги. Имя со случайным хвостом: перерисовка не упрётся в кэш браузера. */
  async function putImage(id, name, image) {
    const file = `${name}-${crypto.randomUUID().slice(0, 8)}.${EXT[image.mime] || 'webp'}`;
    await bucket.put(`img/${id}/${file}`, image.bytes, { httpMetadata: { contentType: image.mime } });
    return `/api/img/${id}/${file}`;
  }

  /** Картинка книги по её адресу (/api/img/… или старый data:URL) → { mime, bytes } или null. */
  async function loadImage(src) {
    const m = IMG_SRC_RE.exec(String(src || ''));
    if (m) {
      const obj = await bucket.get(`img/${m[1]}/${m[2]}`);
      return obj && { mime: obj.httpMetadata?.contentType || 'image/webp', bytes: new Uint8Array(await obj.arrayBuffer()) };
    }
    const d = /^data:(image\/(?:png|jpeg|webp));base64,/.exec(String(src || '').slice(0, 40));
    return d ? { mime: d[1], bytes: fromBase64(src.slice(d[0].length)) } : null;
  }

  // ---------- озвучка
  const MEDIA_SRC_RE = /^\/api\/media\/([a-f0-9-]{36})\/([a-z0-9-]+\.mp3)$/;
  const mediaKey = (src) => { const m = MEDIA_SRC_RE.exec(String(src || '')); return m ? `media/${m[1]}/${m[2]}` : null; };

  async function putMedia(key, bytes) {
    await bucket.put(key, bytes, { httpMetadata: { contentType: 'audio/mpeg' } });
  }

  /** Склеивает куски mp3 в один файл главы и возвращает его адрес /api/media/<id>/<name>-<хвост>.mp3. */
  async function joinMedia(id, name, keys) {
    const parts = await Promise.all(keys.map(async (k) => { const o = await bucket.get(k); return o ? new Uint8Array(await o.arrayBuffer()) : null; }));
    if (parts.some((p) => !p)) return null;
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    const file = `${name}-${crypto.randomUUID().slice(0, 8)}.mp3`;
    await putMedia(`media/${id}/${file}`, out);
    return `/api/media/${id}/${file}`;
  }

  async function removeMedia(keys) {
    if (keys.length) await bucket.delete(keys);
  }

  const getImageObject = (id, file) => (isJobId(id) && isImageFile(file) ? bucket.get(`img/${id}/${file}`) : null);

  return { getJob, saveJob, updateJob, jobsCreatedBefore, removeBook, savePhotos, loadPhotos, removePhotos, putImage, loadImage, getImageObject, putMedia, joinMedia, removeMedia, mediaKey };
}
