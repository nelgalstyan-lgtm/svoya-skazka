// API на geroenok.online/api/* (тот же Worker, что отдаёт сайт). Маршруты и ответы — как у старого сервера
// (бывший server/index.js на Express), чтобы сайт не пришлось переделывать. Книга создаётся в фоне Workflow'ом (book.js).

import { buildTemplateStory, describeProviders } from '../server/lib/story.js';
import { templateBook } from '../server/lib/bigstory.js';
import { MAX_PHOTOS, MAX_FAMILY } from '../server/lib/illustrate.js';
import { createStore, isJobId } from './store.js';
import { drawImage, artOff, ART_OFF_MESSAGE } from './art.js';
import { fromBase64 } from './bytes.js';
import { jobView, bookImages, REDRAW_LIMIT } from './view.js';
import { notifyOwner } from './notify.js';

const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
// Шлюз Яндекса (через него идёт сайт, см. clientIp) обрывает запросы к Cloudflare тяжелее ~30 КБ: 503 через 50 с.
// Поэтому анкета шлёт фото кусками до UPLOAD_CHUNK_BYTES (POST /api/upload/<загрузка>/<фото>/<кусок>),
// а в /api/book/generate — только номер загрузки и сколько кусков у каждого фото. Куски лежат в photos/up-<загрузка>/:
// после заказа удаляются, а брошенные стирает правило жизненного цикла R2 для photos/ (2 суток).
export const UPLOAD_CHUNK_BYTES = 16 * 1024;
const UPLOAD_MAX_CHUNKS = Math.ceil(PHOTO_MAX_BYTES / UPLOAD_CHUNK_BYTES);
const PHOTO_MIME_RE = /^image\/(jpeg|png|webp)$/;
const chunkKey = (upload, photo, chunk) => `photos/up-${upload}/${photo}-${chunk}`;
// фото родных в загрузке идут под номерами MAX_PHOTOS… (после фото ребёнка 0…MAX_PHOTOS-1)
const FAMILY_SLOT = MAX_PHOTOS;
const BODY_MAX_BYTES = 30 * 1024 * 1024;
const EDIT_TEXT_MAX = 3000;
// Если Workflow так и не закончил книгу (сбой Cloudflare) — клиент всё равно получает книгу из шаблона
const STUCK_MS = { short: 15 * 60_000, big: 30 * 60_000 };
const FINISHING_STUCK_MS = 30 * 60_000;

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-admin-key', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS } });
const fail = (status, error) => json({ ok: false, error }, status);

/** Фото из анкеты (data:URL) → { mime, bytes } или null. Весь base64 регуляркой не проверяем — это мегабайты. */
function parsePhoto(raw) {
  if (typeof raw !== 'string') return null;
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,/i.exec(raw.slice(0, 40));
  if (!m) return null;
  const data = raw.slice(m[0].length).trim();
  if (!data || (data.length * 3) / 4 > PHOTO_MAX_BYTES) return null;
  try {
    const sub = m[1].toLowerCase();
    return { mime: sub === 'jpg' ? 'image/jpeg' : `image/${sub}`, bytes: fromBase64(data) };
  } catch {
    return null; // не base64
  }
}

function parsePhotos(body) {
  const list = Array.isArray(body?.photos) ? body.photos : [body?.photo];
  return list.slice(0, MAX_PHOTOS).map(parsePhoto).filter(Boolean);
}

/**
 * Анкета заказа → { body, photos }. Новая анкета шлёт multipart (answers — JSON, photo — файлы): его Cloudflare
 * разбирает встроенными средствами. Старая (закэшированная в браузере) — JSON с фото в data:URL: разбор такого
 * JSON на мегабайт с лишним съедает весь лимит процессора (10 мс), поэтому он оставлен только для совместимости.
 */
async function readOrder(request, env) {
  if (Number(request.headers.get('content-length') || 0) > BODY_MAX_BYTES) return null;
  if (/multipart\/form-data/i.test(request.headers.get('content-type') || '')) {
    const form = await request.formData().catch(() => null);
    if (!form) return null;
    let body;
    try { body = JSON.parse(String(form.get('answers') || '{}')); } catch { return null; }
    const device = String(form.get('device') || '');
    if (form.get('upload')) return { body, device, ...(await readUpload(env, String(form.get('upload')), String(form.get('photoParts') || ''), String(form.get('familyParts') || ''))) };
    const files = form.getAll('photo').filter((f) => typeof f === 'object' && f && PHOTO_MIME_RE.test(f.type) && f.size > 0 && f.size <= PHOTO_MAX_BYTES);
    const photos = await Promise.all(files.slice(0, MAX_PHOTOS).map(async (f) => ({ mime: f.type, bytes: new Uint8Array(await f.arrayBuffer()) })));
    const familyFiles = form.getAll('family').filter((f) => typeof f === 'object' && f && PHOTO_MIME_RE.test(f.type) && f.size > 0 && f.size <= PHOTO_MAX_BYTES);
    const familyPhotos = await Promise.all(familyFiles.slice(0, MAX_FAMILY).map(async (f) => ({ mime: f.type, bytes: new Uint8Array(await f.arrayBuffer()) })));
    return { body, photos, familyPhotos, device };
  }
  const body = await readJson(request);
  return body && { body, photos: parsePhotos(body), device: String(body.device || '') };
}

/**
 * Фото, присланные кусками: parts — JSON [{ type, n }] по каждому фото ребёнка, familyParts — то же для фото родного
 * (номер FAMILY_SLOT). Не хватает куска — broken (просим нажать ещё раз).
 */
async function readUpload(env, upload, partsJson, familyJson = '') {
  const parse = (j) => { try { return j ? JSON.parse(j) : []; } catch { return null; } };
  const parts = parse(partsJson), fam = parse(familyJson);
  const okPart = (p) => PHOTO_MIME_RE.test(p?.type) && Number.isInteger(p.n) && p.n > 0 && p.n <= UPLOAD_MAX_CHUNKS;
  const valid = isJobId(upload) && Array.isArray(parts) && parts.length > 0 && parts.length <= MAX_PHOTOS && parts.every(okPart)
    && Array.isArray(fam) && fam.length <= MAX_FAMILY && fam.every(okPart);
  if (!valid) return { photos: [], familyPhotos: [], broken: true, chunkKeys: [] };
  const slots = [...parts.map((p, i) => ({ ...p, slot: i })), ...fam.map((p, i) => ({ ...p, slot: FAMILY_SLOT + i, family: true }))];
  const chunkKeys = slots.flatMap((p) => Array.from({ length: p.n }, (_, c) => chunkKey(upload, p.slot, c)));
  const chunks = new Map(await Promise.all(chunkKeys.map(async (key) => {
    const obj = await env.BUCKET.get(key);
    return [key, obj ? new Uint8Array(await obj.arrayBuffer()) : null];
  })));
  if ([...chunks.values()].some((c) => !c)) return { photos: [], familyPhotos: [], broken: true, chunkKeys };
  const glue = (p) => {
    const pieces = Array.from({ length: p.n }, (_, c) => chunks.get(chunkKey(upload, p.slot, c)));
    const bytes = new Uint8Array(pieces.reduce((n, b) => n + b.length, 0));
    let at = 0;
    for (const b of pieces) { bytes.set(b, at); at += b.length; }
    return { mime: p.type, bytes };
  };
  return { photos: slots.filter((p) => !p.family).map(glue), familyPhotos: slots.filter((p) => p.family).map(glue), broken: false, chunkKeys };
}

async function uploadChunk(request, env, upload, photo, chunk) {
  const p = /^\d{1,3}$/.test(photo) ? Number(photo) : -1;
  const c = /^\d{1,4}$/.test(chunk) ? Number(chunk) : -1;
  if (!isJobId(upload) || p < 0 || p >= FAMILY_SLOT + MAX_FAMILY || c < 0 || c >= UPLOAD_MAX_CHUNKS) return fail(404, 'Not found');
  if (await limited(env.UPLOAD_LIMITER, clientIp(request, env))) return fail(429, 'Слишком много запросов подряд. Подождите пару минут и попробуйте снова.');
  if (Number(request.headers.get('content-length') || 0) > UPLOAD_CHUNK_BYTES) return fail(400, 'Слишком большой кусок фото.');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > UPLOAD_CHUNK_BYTES) return fail(400, 'Слишком большой кусок фото.');
  await env.BUCKET.put(chunkKey(upload, p, c), bytes);
  return json({ ok: true });
}

async function readJson(request) {
  if (Number(request.headers.get('content-length') || 0) > BODY_MAX_BYTES) return null;
  return request.json().catch(() => null);
}

/** Лимит запросов с одного адреса (привязка Rate Limiting; без неё — без лимита). */
async function limited(limiter, key) {
  if (!limiter) return false;
  try { return !(await limiter.limit({ key })).success; } catch { return false; }
}

/**
 * Адрес посетителя для лимитов. Сайт открывается через шлюз Яндекса (API Gateway в России: часть российских провайдеров
 * режет Cloudflare) — тогда Cloudflare видит адрес шлюза, а настоящий шлюз кладёт в x-real-remote-address. Этому заголовку
 * верим, только если шлюз прислал и наш секрет x-geroenok-proxy (он вписан в спецификацию шлюза и в секрет PROXY_SECRET).
 */
export function clientIp(request, env = {}) {
  const viaProxy = Boolean(env.PROXY_SECRET) && request.headers.get('x-geroenok-proxy') === env.PROXY_SECRET;
  const real = viaProxy && (request.headers.get('x-real-remote-address') || '').trim();
  return real || request.headers.get('cf-connecting-ip') || 'local';
}

// Бесплатные превью в сутки (каждое ≈15 ₽ картинок): с одного браузера — 3; с одного адреса — 10, с запасом,
// потому что у мобильных операторов один адрес на многих людей. Хозяйка (заголовок x-admin-key) — без лимита.
export const PREVIEW_LIMITS = { device: 3, ip: 10 };
const DEVICE_RE = /^[a-z0-9-]{16,64}$/i;

/** Счётчики превью за сутки: R2 limits/<дата>/<хэш>. Адрес и id браузера храним только хэшем; правило R2 удаляет limits/ через 3 дня. */
async function previewCounters(env, request, device) {
  const day = new Date().toISOString().slice(0, 10);
  const salt = env.ADMIN_KEY || 'geroenok';
  const hash = async (value) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${value}`));
    return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  const keys = { ip: `limits/${day}/ip-${await hash(`ip:${clientIp(request, env)}`)}` };
  if (DEVICE_RE.test(device || '')) keys.device = `limits/${day}/dev-${await hash(`device:${device}`)}`;
  const counts = {};
  await Promise.all(Object.entries(keys).map(async ([kind, key]) => {
    const obj = await env.BUCKET.get(key);
    counts[kind] = obj ? Number((await obj.json()).n) || 0 : 0;
  }));
  return {
    exceeded: Object.keys(keys).find((kind) => counts[kind] >= PREVIEW_LIMITS[kind]) || null,
    count: () => Promise.all(Object.entries(keys).map(([kind, key]) => env.BUCKET.put(key, JSON.stringify({ n: counts[kind] + 1 }))))
  };
}

const LIMIT_MESSAGES = {
  device: `Сегодня здесь уже сделано ${PREVIEW_LIMITS.device} бесплатных превью — это дневной лимит. Готовые превью можно открыть по ссылке и оплатить, а новое сделать завтра.`,
  ip: 'Из вашей сети сегодня сделано много бесплатных превью. Попробуйте завтра или напишите нам — поможем.'
};

/**
 * Родные по фото (решения владелицы 05.10): в «Большой истории» первый бесплатно, второй и третий — +290 ₽; в «Сказке» — +290 ₽ за всех (до 3):
 * answers.familyPhotos === true, answers.family [{ who, name }] и по одному фото на человека, по порядку. → { list } (только с фото) или { error } — если выбрали, но не заполнили.
 */
export function familyFromOrder(body, files = []) {
  if (body?.familyPhotos !== true) return { list: [] };
  const people = Array.isArray(body.family) ? body.family.slice(0, MAX_FAMILY) : [];
  const text = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const list = people.map((p) => ({ name: text(p?.name, 40), who: text(p?.who, 40) })).slice(0, files.length);
  if (!list.length) return { error: 'Вы выбрали «Родные по фото» — загрузите фото хотя бы одного человека или снимите галочку.' };
  if (list.some((p) => !p.who)) return { error: 'Укажите, кто на каждом фото: мама, папа, бабушка…' };
  // рисуем настоящего человека: без его согласия заказ не принимаем (политика конфиденциальности)
  if (body.familyConsent !== true) return { error: 'Подтвердите, что люди на фото согласны, чтобы их нарисовали в книге.' };
  return { list };
}

/** Родные по фото должны попасть и в сюжет: дописываем в «Кого ещё включить» тех, кого там ещё нет. */
export function castWithFamily(cast = '', family = []) {
  const low = String(cast).toLowerCase();
  const extra = family
    .filter((p) => !(p.name && low.includes(p.name.toLowerCase())) && !(!p.name && low.includes(p.who.toLowerCase())))
    .map((p) => [p.who, p.name].filter(Boolean).join(' '));
  return [String(cast).trim(), ...extra].filter(Boolean).join(', ').slice(0, 500);
}

// ---------------------------------------------------------------- маршруты

async function generate(request, env, store) {
  const order = await readOrder(request, env);
  if (!order) return fail(400, 'Не получилось прочитать анкету. Попробуйте ещё раз.');
  if (order.broken) return fail(400, 'Фото не догрузились — проверьте интернет и нажмите кнопку ещё раз.');
  const { body, photos } = order;
  const big = body.tariff === 'big';
  const ip = clientIp(request, env);
  // большая книга — 7 запросов к ИИ и 10 иллюстраций, поэтому лимит строже и считается отдельно
  if (await limited(big ? env.BIG_LIMITER : env.GEN_LIMITER, ip)) {
    return fail(429, 'Слишком много запросов подряд. Подождите пару минут и попробуйте снова.');
  }

  // Главная ценность книги — ребёнок, похожий на себя, на каждой иллюстрации: без фото заказ не принимаем
  if (!photos.length) return fail(400, 'Загрузите хотя бы одно фото ребёнка — по нему рисуются все иллюстрации книги.');
  const age = String(body.age ?? '').trim();
  if (age && !/^(?:[2-9]|1[0-6])$/.test(age)) return fail(400, 'Возраст ребёнка — от 2 до 16 лет.');

  const owner = Boolean(env.ADMIN_KEY) && request.headers.get('x-admin-key') === env.ADMIN_KEY;
  // в OpenAI кончились деньги — превью вышло бы без ребёнка на картинках, поэтому не принимаем (хозяйке — можно, для проверки)
  if (!owner && await artOff(env)) return fail(503, ART_OFF_MESSAGE);
  const counters = owner ? null : await previewCounters(env, request, order.device);
  if (counters?.exceeded) return fail(429, LIMIT_MESSAGES[counters.exceeded]);

  const input = {};
  for (const key of ['name', 'age', 'gender', 'eyes', 'occasion', 'habits', 'friends', 'cast', 'style', 'theme', 'interests', 'special', 'lesson', 'design']) {
    input[key] = typeof body[key] === 'string' || typeof body[key] === 'number' ? String(body[key]).slice(0, 500) : '';
  }
  input.sequel = typeof body.sequel === 'string' ? body.sequel.slice(0, 1200) : '';
  // посвящение: от кого книга (подпись «С любовью, …») и своё посвящение родителей — необязательно
  input.from = typeof body.from === 'string' ? body.from.slice(0, 80) : '';
  input.dedication = typeof body.dedication === 'string' ? body.dedication.slice(0, 1200) : '';
  if (big) input.tariff = 'big';
  // раскраска входит в «Большую историю»; к «Сказке» её можно добавить отдельно
  if (big || body.coloring === true) input.coloring = true;
  // песня по книге — так же: входит в «Большую историю», к «Сказке» — отдельно
  if (big || body.song === true) input.song = true;
  // заказчик сам отметил, что книгу можно показать в примерах на сайте (необязательно)
  if (body.showcase === true) input.showcase = true;
  // родные по фото: рисуются после оплаты, в превью — только ребёнок
  const family = familyFromOrder(body, order.familyPhotos || []);
  if (family.error) return fail(400, family.error);
  if (family.list.length) {
    input.family = family.list;
    input.cast = castWithFamily(input.cast, family.list);
  }

  const id = crypto.randomUUID();
  const job = { id, status: 'queued', createdAt: Date.now(), startedAt: null, finishedAt: null, input, progress: 'Готовимся…', result: null };
  // фото — отдельно от книги: понадобятся, чтобы дорисовать книгу после оплаты, и удалятся не позже чем через 48 ч
  await store.savePhotos(id, photos);
  if (input.family) await store.savePhotos(id, order.familyPhotos.slice(0, input.family.length), { family: true });
  if (order.chunkKeys?.length) await env.BUCKET.delete(order.chunkKeys);
  await store.saveJob(job);
  await startBook(env, id, 'preview');
  await counters?.count();
  await notifyOwner(env, job, 'new'); // письмо владелице «новый заказ» (notify.js)
  return json({ ok: true, jobId: id, status: job.status, position: 0 });
}

/** Страховка: книга зависла дольше разумного — отдаём книгу из шаблона (как старый сервер при сбое ИИ). */
async function rescueStuck(store, job, now = Date.now()) {
  if (job.status !== 'completed' && job.status !== 'failed' && now - job.createdAt > (job.input?.tariff === 'big' ? STUCK_MS.big : STUCK_MS.short)) {
    return store.updateJob(job.id, (j) => {
      if (j.status === 'completed') return;
      j.status = 'completed';
      j.result = j.input?.tariff === 'big' ? { book: templateBook(j.input), source: 'template', provider: null, model: null } : { ...buildTemplateStory(j.input), source: 'template', provider: null, model: null };
      j.finishedAt = now;
      j.progress = '';
    });
  }
  if (job.finishing && now - (job.paidAt || 0) > FINISHING_STUCK_MS) {
    return store.updateJob(job.id, (j) => { j.finishing = false; j.progress = ''; });
  }
  return job;
}

async function status(store, id) {
  let job = await store.getJob(id);
  if (!job) return fail(404, 'Job not found');
  job = await rescueStuck(store, job);
  return json(jobView(job));
}

// Перерисовать одну иллюстрацию. Фото ребёнка к этому времени уже удалено — лицо и одежду держит лист персонажа.
async function redraw(request, env, store, id) {
  const job = await store.getJob(id);
  if (!job || job.status !== 'completed') return fail(404, 'Книга не найдена');
  if (!job.paid || job.finishing) return fail(402, 'Перерисовка доступна после оплаты книги.');
  if (await limited(env.EDIT_LIMITER, `${clientIp(request, env)}:redraw`)) return fail(429, 'Слишком много запросов подряд. Подождите пару минут.');

  const used = job.redraws || 0;
  if (used >= REDRAW_LIMIT) return fail(403, `Бесплатные перерисовки закончились (${REDRAW_LIMIT} на книгу). Напишите нам — поможем.`);

  const result = job.result;
  const sheet = await store.loadImage(result.sheet || result.book?.sheet);
  if (!sheet) return fail(409, 'Для этой книги перерисовка недоступна: у неё нет иллюстраций с ребёнком.');

  const body = await readJson(request);
  const images = bookImages(result);
  const index = Number(body?.index);
  const wish = typeof body?.wish === 'string' ? body.wish.slice(0, 300).trim() : '';
  if (!Number.isInteger(index) || index < 0 || index >= images.length) return fail(400, 'Нет такой иллюстрации');

  // родной по фото: его лист (фото к этому времени удалено) — чтобы и на перерисованной картинке он был похож
  const familySheet = (result.book || result).familySheet ? await store.loadImage((result.book || result).familySheet) : null;
  const image = await drawImage(env, {
    kind: 'scene',
    sheet,
    family: familySheet ? job.input?.family || [] : [],
    familySheet,
    styleLabel: job.input?.style,
    eyes: job.input?.eyes,
    look: result.look || result.book?.look,
    face: result.face || result.book?.face || '',
    age: job.input?.age,
    // пожелание родителя идёт как данные о сцене, а не как инструкция
    brief: wish ? `${images[index].brief} Parent's note about what to change (in Russian): «${wish}».` : images[index].brief
  });
  if (!image) return fail(502, 'Не получилось перерисовать сейчас. Попробуйте через несколько минут — попытка не потрачена.');

  const src = await store.putImage(id, `scene-${index}`, image);
  // перечитываем: пока рисовали (полминуты), родитель мог поправить текст
  const saved = await store.updateJob(id, (j) => {
    bookImages(j.result)[index]?.set(src);
    j.redraws = (j.redraws || 0) + 1;
  });
  return json({ ok: true, src, left: REDRAW_LIMIT - saved.redraws });
}

// Правка текста родителем: «Сказка» — страницы целиком, «Большая история» — отдельные абзацы
async function edit(request, env, store, id) {
  const job = await store.getJob(id);
  if (!job || job.status !== 'completed') return fail(404, 'Книга не найдена');
  if (!job.paid || job.finishing) return fail(402, 'Правка текста доступна после оплаты книги.');
  if (job.noEdit) return fail(403, 'Эту книгу править нельзя.');
  if (await limited(env.EDIT_LIMITER, `${clientIp(request, env)}:edit`)) return fail(429, 'Слишком много запросов подряд. Подождите пару минут.');

  const body = await readJson(request);
  const edits = Array.isArray(body?.edits) ? body.edits.slice(0, 500) : [];
  const clean = (t) => String(t || '').replace(/<[^>]*>/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, EDIT_TEXT_MAX);
  let applied = 0;
  for (const e of edits) {
    const text = clean(e?.text);
    if (!text) continue;
    if (job.result.book) {
      const block = job.result.book.chapters[Number(e.chapter)]?.blocks[Number(e.block)];
      if (block && typeof block.text === 'string') { block.text = text; applied += 1; }
    } else {
      const page = job.result.pages?.[Number(e.page)];
      if (page) { page.text = text; applied += 1; }
    }
  }
  // more: правки пришли несколькими запросами (шлюз не пропускает тяжёлые) — озвучку запускаем по последнему
  const revoice = applied && !body?.more && env.YANDEX_API_KEY && (job.voiceRuns || 0) < VOICE_RUNS_MAX;
  if (revoice) job.voiceRuns = (job.voiceRuns || 0) + 1;
  if (applied) await store.saveJob(job);
  if (revoice) await startBook(env, id, 'voice', job.voiceRuns); // озвучка догонит правку через пару минут
  return json({ ok: true, applied });
}

// Оплата подтверждена. Сейчас вызывается вручную (заголовок x-admin-key = секрет ADMIN_KEY) — для проверки;
// после подключения ЮKassa то же самое будет делать её уведомление об оплате.
async function unlock(request, env, store, id) {
  if (!env.ADMIN_KEY) return fail(503, 'Оплата пока не подключена.');
  if (request.headers.get('x-admin-key') !== env.ADMIN_KEY) return fail(403, 'Нет доступа');
  const r = await unlockBook(env, store, id);
  return json(r, r.ok ? 200 : 404);
}

// Удалить книгу раньше срока по просьбе заказчика (политика конфиденциальности): вручную, заголовок x-admin-key
async function removeBookNow(request, env, store, id) {
  if (!env.ADMIN_KEY || request.headers.get('x-admin-key') !== env.ADMIN_KEY) return fail(403, 'Нет доступа');
  if (!(await store.getJob(id))) return fail(404, 'Книга не найдена');
  const files = await store.removeBook(id);
  console.log(`[delete] ${id}: удалена по просьбе заказчика (${files} файлов)`);
  return json({ ok: true, files });
}

/**
 * Запуск создания книги — через очередь, а не прямо отсюда. Если Workflow создать из запроса покупателя,
 * OpenAI видит страну покупателя и отказывает заказам из РФ; из обработчика очереди — не видит (проверено 26.09).
 */
async function startBook(env, id, mode, run = 0) {
  const instance = mode === 'complete' ? `${id}-complete` : mode === 'voice' ? `${id}-voice-${run}` : id;
  await env.START_QUEUE.send({ instance, id, mode });
}

// Сколько раз можно переозвучить книгу после правок (каждый раз — только изменившиеся главы)
const VOICE_RUNS_MAX = 10;

/** Отмечает книгу оплаченной и запускает дорисовку. Повторный вызов для той же книги ничего не делает. */
export async function unlockBook(env, store, id) {
  const job = await store.getJob(id);
  if (!job || job.status !== 'completed') return { ok: false, error: 'Книга не найдена' };
  if (job.paid) return { ok: true, paid: true };
  await store.updateJob(id, (j) => {
    j.paid = true;
    j.paidAt = Date.now();
    j.finishing = true;
    j.progress = 'Дорисовываем иллюстрации…';
  });
  // дорисовка идёт в фоне: клиент следит за ходом через /status
  await startBook(env, id, 'complete');
  await notifyOwner(env, job, 'paid'); // письмо владелице «заказ оплачен»
  return { ok: true, paid: true };
}

// Медиа из R2 (media/…): аудиокнига-образец и озвучка книг покупателей. Отдаём кусками (Range → 206) — без этого Safari на iPhone
// не проигрывает звук, а перемотка не работает; R2 режет файл сам, процессор Worker'а не тратится.
// .pdf — готовый файл книги (book.pdfUrl): «Скачать PDF» отдаёт его сразу, телефону не нужно собирать 80 страниц самому
const MEDIA_RE = /^[a-z0-9-]+\/[a-z0-9-]+\.(mp3|pdf)$/;
async function media(request, env, path) {
  if (!MEDIA_RE.test(path)) return new Response('Not found', { status: 404, headers: CORS });
  const obj = await env.BUCKET.get(`media/${path}`, { range: request.headers });
  if (!obj) return new Response('Not found', { status: 404, headers: CORS });
  const headers = new Headers({ 'content-type': obj.httpMetadata?.contentType || 'audio/mpeg', 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=86400', etag: obj.httpEtag, ...CORS });
  const r = obj.range;
  if (r && request.headers.has('range')) {
    const offset = r.offset ?? (obj.size - r.suffix);
    const length = r.length ?? (obj.size - offset);
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set('content-length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('content-length', String(obj.size));
  // ?name=… — скачать файлом (PDF книги, аудиокнига целиком), а не открыть в браузере
  const askedName = new URL(request.url).searchParams.get('name');
  if (/\.pdf$/.test(path) || askedName) {
    if (/\.pdf$/.test(path)) headers.set('content-type', 'application/pdf');
    const name = askedName || path.split('/').pop();
    headers.set('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name.replace(/[\/:*?"<>|]+/g, ''))}`);
  }
  return new Response(obj.body, { headers });
}

async function image(store, id, file) {
  const obj = await store.getImageObject(id, file);
  if (!obj) return new Response('Not found', { status: 404, headers: CORS });
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType || 'image/webp',
      // имя файла уникально для каждой версии картинки — можно кэшировать навсегда
      'cache-control': 'public, max-age=31536000, immutable',
      etag: obj.httpEtag,
      ...CORS
    }
  });
}

export async function handleApi(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const store = createStore(env.BUCKET);
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  if (parts[1] === 'health' && method === 'GET') {
    const out = { ok: true, colo: request.cf?.colo || null, providers: describeProviders(), heroIllustrations: Boolean(env.OPENAI_API_KEY || env.GEMINI_API_KEY), guaranteedFallback: true };
    // ?openai=1 — отвечает ли OpenAI на запрос прямо из обработки этого посетителя (из РФ — 403; поэтому книги идут через очередь)
    if (url.searchParams.get('openai') === '1' && env.OPENAI_API_KEY && !(await limited(env.EDIT_LIMITER, `${clientIp(request, env)}:health`))) {
      const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` } }).catch(() => null);
      out.openai = r ? r.status : 'network error';
      const detail = r && !r.ok ? (await r.text().catch(() => '')).slice(0, 160) : '';
      console.log(`[health] colo ${out.colo} country ${request.cf?.country} openai ${out.openai} ${detail}`);
    }
    return json(out);
  }
  if (parts[1] === 'img' && parts.length === 4 && method === 'GET') return image(store, parts[2], parts[3]);
  if (parts[1] === 'media' && parts.length === 4 && method === 'GET') return media(request, env, `${parts[2]}/${parts[3]}`);
  // проверка писем владелице: одно тестовое письмо, только с ключом хозяйки
  if (parts[1] === 'admin' && parts[2] === 'notify-test' && method === 'POST') {
    if (!env.ADMIN_KEY || request.headers.get('x-admin-key') !== env.ADMIN_KEY) return fail(403, 'Нет доступа');
    const sent = await notifyOwner(env, { id: '00000000-0000-4000-8000-000000000000', input: { name: 'Проверка', age: '5', gender: 'Девочка', theme: 'Сказка', style: 'Акварель' } }, 'new', console.log);
    return json({ ok: sent });
  }
  if (parts[1] === 'upload' && parts.length === 5 && method === 'POST') return uploadChunk(request, env, parts[2], parts[3], parts[4]);
  if (parts[1] === 'book') {
    if (parts[2] === 'generate' && parts.length === 3 && method === 'POST') return generate(request, env, store);
    const id = parts[2];
    if (!isJobId(id) || parts.length !== 4) return fail(404, 'Not found');
    const action = parts[3];
    if ((action === 'status' || action === 'result') && method === 'GET') return status(store, id);
    if (action === 'redraw' && method === 'POST') return redraw(request, env, store, id);
    if (action === 'edit' && method === 'POST') return edit(request, env, store, id);
    if (action === 'unlock' && method === 'POST') return unlock(request, env, store, id);
    if (action === 'delete' && method === 'POST') return removeBookNow(request, env, store, id);
  }
  return fail(404, 'Not found');
}
