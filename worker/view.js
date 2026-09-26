// Что видит клиент: превью до оплаты и полная книга после. Перенесено из server/index.js без изменений логики.

import { normalizeBook } from '../server/lib/booktext.js';

// Нарисованная иллюстрация с ребёнком: картинка из хранилища (или старый data:URL), а не запасной фон assets/scenes/…
export const isDrawn = (src) => /^(data:|\/api\/img\/)/.test(src || '');

export const REDRAW_LIMIT = 3;

// Ответы анкеты без фото — для продолжения книги и подписи на обложке
const ANSWER_KEYS = ['name', 'age', 'gender', 'eyes', 'theme', 'occasion', 'habits', 'friends', 'cast', 'style', 'lesson', 'interests', 'special'];
function jobAnswers(job) {
  const out = {};
  for (const key of ANSWER_KEYS) out[key] = job.input?.[key] || '';
  return out;
}

function clientBook(job) {
  const { sheet, ...book } = normalizeBook(job.result.book, { name: job.input?.name, girl: !/^(мал|boy|male)/i.test(job.input?.gender || '') });
  return book;
}

// В бесплатном превью «Сказки» открыты первые страницы, «Большой истории» — первая глава; остальное сервер не отдаёт вовсе
const PREVIEW_PAGES = 2;
const PREVIEW_CHAPTERS = 1;
// Цены (₽) — показываются на закрытой странице превью; меняются здесь и на pricing.html / create.html
export const PRICES = { short: 690, big: 1490, coloring: 190 };
export const priceOf = (job) => (job.input?.tariff === 'big' ? PRICES.big : PRICES.short + (job.input?.coloring ? PRICES.coloring : 0));

function previewResult(job) {
  const answers = jobAnswers(job);
  if (job.result.book) {
    const book = clientBook(job);
    const rest = book.chapters.slice(PREVIEW_CHAPTERS);
    return { kind: 'book', locked: true, price: priceOf(job), book: { ...book, coloring: [], chapters: book.chapters.slice(0, PREVIEW_CHAPTERS) }, lockedChapters: rest.map((c) => c.title), lockedImages: rest.reduce((n, c) => n + c.blocks.filter((b) => b.t === 'image').length, 0), answers };
  }
  const pages = job.result.pages;
  return { locked: true, price: priceOf(job), coloringOrdered: Boolean(job.input?.coloring), title: job.result.title, pages: pages.slice(0, PREVIEW_PAGES), lockedPages: Math.max(0, pages.length - PREVIEW_PAGES), cover: job.result.cover || null, coloring: [], answers };
}

function fullResult(job) {
  return job.result.book
    ? { kind: 'book', book: clientBook(job), answers: jobAnswers(job) }
    : { title: job.result.title, pages: job.result.pages, cover: job.result.cover || null, coloring: job.result.coloring || [], answers: jobAnswers(job) };
}

export function jobView(job, now = Date.now()) {
  const done = job.status === 'completed';
  return {
    ok: true,
    jobId: job.id,
    status: job.status,
    ready: done,
    position: 0,
    progress: done && !job.finishing ? '' : job.progress || '',
    paid: Boolean(job.paid),
    finishing: Boolean(job.finishing), // оплачено, дорисовываем иллюстрации
    redrawsLeft: done ? Math.max(0, REDRAW_LIMIT - (job.redraws || 0)) : null,
    canRedraw: done ? Boolean(job.result.sheet || job.result.book?.sheet) : false,
    elapsedMs: (job.finishedAt || now) - job.createdAt,
    // клиенту отдаём только книгу; лист персонажа остаётся на сервере — он нужен только для перерисовки
    result: !done ? null : job.paid && !job.finishing ? fullResult(job) : previewResult(job)
  };
}

/** Все иллюстрации с ребёнком по порядку: { brief, src, set(src) } — одинаково для «Сказки» и «Большой истории». */
export function bookImages(result) {
  if (result.book) {
    return result.book.chapters.flatMap((c) => c.blocks.filter((b) => b.t === 'image')).map((b) => ({ brief: b.brief, src: b.src, set: (src) => { b.src = src; } }));
  }
  return (result.pages || []).map((p) => ({ brief: p.heroBrief, src: p.heroImage, set: (src) => { p.heroImage = src; p.hero = true; } }));
}
