// Создание книги по шагам (Cloudflare Workflow). На бесплатном тарифе у каждого шага свои 10 мс процессора,
// а ожидание ИИ в них не входит. Поэтому книга режется на шаги: текст (или план и каждая глава),
// лист персонажа, обложка, каждая иллюстрация, каждая страница раскраски. Результат шага Cloudflare
// запоминает: если что-то упадёт, повторится только этот шаг.
//
// step — объект Workflow (step.do(name, config, fn)); в тестах — простая замена, которая сразу вызывает fn.
//
// mode 'preview' — бесплатное превью: весь текст + лист персонажа, обложка и первая иллюстрация.
// mode 'complete' — после оплаты: остальные иллюстрации и раскраска, потом фото удаляются.

import { generateStory, prepareHeroPages } from '../server/lib/story.js';
import { writePlan, writeChapter, chapterContext, assembleBigBook, templateBook } from '../server/lib/bigstory.js';
import template from '../js/story-template.js';
import { createStore } from './store.js';
import { drawImage } from './art.js';
import { isDrawn, bookImages } from './view.js';

const { normalizeInput } = template;

const TEXT_STEP = { retries: { limit: 1, delay: '10 seconds', backoff: 'constant' }, timeout: '10 minutes' };
const IMAGE_STEP = { retries: { limit: 1, delay: '10 seconds', backoff: 'constant' }, timeout: '15 minutes' };
const QUICK_STEP = { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' }, timeout: '1 minute' };
const CONCURRENCY = 3;
const MAX_COLORING = 6;

export async function runBook(env, { id, mode }, step, { log = console.warn } = {}) {
  const store = createStore(env.BUCKET);
  const progress = (text) => store.updateJob(id, (job) => { job.progress = text; if (job.status === 'queued') { job.status = 'processing'; job.startedAt = Date.now(); } });
  const ctx = { env, store, id, step, log, progress };
  return mode === 'complete' ? completeFlow(ctx) : previewFlow(ctx);
}

// ---------------------------------------------------------------- рисование

/**
 * Иллюстрации книги по шагам: лист персонажа (если его ещё нет), потом обложка и сцены по три одновременно,
 * вторая попытка для не получившихся. Возвращает адреса: { sheet, cover, scenes: [src|null] }.
 */
async function drawBook(ctx, { input, briefs, coverBrief, look, only = null, sheet = null }) {
  const { env, store, id, step, log, progress } = ctx;
  const style = { styleLabel: input.style, eyes: normalizeInput(input).eyes, look };
  const wanted = briefs.map((_, i) => !only || only.includes(i));
  const total = wanted.filter(Boolean).length + (coverBrief ? 1 : 0) + (sheet ? 0 : 1);
  let started = 0;

  const draw = (name, kind, brief) => step.do(name, IMAGE_STEP, async () => {
    started += 1;
    await progress(`Рисуем иллюстрации с вашим ребёнком (${Math.min(started, total)} из ${total})…`);
    const [refs, sheetImage] = await Promise.all([store.loadPhotos(id), kind === 'sheet' ? null : store.loadImage(sheet)]);
    const image = await drawImage(env, { kind, refs, sheet: sheetImage, brief, ...style, log });
    return image ? store.putImage(id, name, image) : null;
  });

  if (!sheet) sheet = await draw('sheet', 'sheet', 'character reference sheet');

  const jobs = [
    ...(coverBrief ? [{ name: 'cover', kind: 'cover', brief: coverBrief }] : []),
    ...briefs.map((brief, i) => ({ name: `scene-${i}`, kind: 'scene', brief, i })).filter((j) => wanted[j.i])
  ];
  const results = new Map();
  const runAll = async (list, suffix = '') => {
    for (let k = 0; k < list.length; k += CONCURRENCY) {
      const batch = list.slice(k, k + CONCURRENCY);
      const srcs = await Promise.all(batch.map((j) => draw(j.name + suffix, j.kind, j.brief)));
      batch.forEach((j, n) => { if (srcs[n]) results.set(j.name, srcs[n]); });
    }
  };
  await runAll(jobs);
  // вторая попытка для того, что не нарисовалось (сбой сервиса, таймаут)
  const failed = jobs.filter((j) => !results.has(j.name));
  if (failed.length) {
    log(`[book] ${id}: retrying ${failed.length} failed image(s)`);
    await runAll(failed, '-retry');
  }

  return {
    sheet,
    cover: results.get('cover') || null,
    scenes: briefs.map((_, i) => results.get(`scene-${i}`) || null)
  };
}

/** Раскраска: контурные версии готовых иллюстраций (не больше MAX_COLORING). */
async function drawColoring(ctx, sources) {
  const { env, store, id, step, log, progress } = ctx;
  const list = sources.filter(Boolean).slice(0, MAX_COLORING);
  const out = [];
  for (let k = 0; k < list.length; k += CONCURRENCY) {
    const batch = list.slice(k, k + CONCURRENCY);
    out.push(...await Promise.all(batch.map((src, n) => step.do(`coloring-${k + n}`, IMAGE_STEP, async () => {
      await progress('Готовим раскраску…');
      const source = await store.loadImage(src);
      const image = source && await drawImage(env, { kind: 'coloring', source, log });
      return image ? store.putImage(id, `coloring-${k + n}`, image) : null;
    }))));
  }
  return out.filter(Boolean);
}

// ---------------------------------------------------------------- бесплатное превью

async function previewFlow(ctx) {
  const { store, id, step, log, progress } = ctx;
  const input = await step.do('start', QUICK_STEP, async () => (await store.getJob(id)).input);
  const big = input.tariff === 'big';

  // текст: фото в генераторы текста не передаём — картинки рисуются отдельными шагами ниже
  let text;
  if (!big) {
    text = await step.do('story', TEXT_STEP, async () => {
      await progress('Пишем историю…');
      return prepareHeroPages(input, await generateStory(input, { log }));
    });
  } else {
    const planned = await step.do('plan', TEXT_STEP, async () => {
      await progress('Придумываем сюжет и героев книги…');
      return writePlan(input, { log });
    });
    if (!planned) {
      text = await step.do('assemble', QUICK_STEP, async () => ({ template: true, book: templateBook(input) }));
    } else {
      const { plan } = planned;
      const meta = { source: 'ai', providers: { [planned.provider]: 1 }, fallbackChapters: [], softChapters: [], tookMs: 0 };
      const chapters = [];
      for (let i = 0; i < plan.chapters.length; i++) {
        const r = await step.do(`chapter-${i + 1}`, TEXT_STEP, async () => {
          await progress(`Пишем главу ${i + 1} из ${plan.chapters.length}: «${plan.chapters[i].title}»`);
          const { summaries, tail } = chapterContext(plan, chapters);
          return writeChapter(input, plan, i, summaries, tail, { log });
        });
        if (r.provider) meta.providers[r.provider] = (meta.providers[r.provider] || 0) + 1;
        if (r.kind === 'soft') meta.softChapters.push(i + 1);
        if (r.kind === 'fallback') meta.fallbackChapters.push(i + 1);
        chapters.push(r.chapter);
      }
      if (meta.fallbackChapters.length === plan.chapters.length) meta.source = 'template';
      // отдельным шагом: код между шагами Workflow повторяется при каждом возобновлении, а книга должна быть одна и та же
      text = await step.do('assemble', QUICK_STEP, async () => ({ plan, book: assembleBigBook(input, plan, chapters, meta) }));
    }
  }

  // иллюстрации превью: лист персонажа, обложка и первая сцена
  const heroBlocks = big ? text.book.chapters.flatMap((ch) => ch.blocks.filter((b) => b.t === 'image')) : null;
  const briefs = big ? heroBlocks.map((b) => b.brief) : text.pages.map((p) => p.heroBrief);
  const coverBrief = big
    ? text.plan?.coverBrief || `The child at the heart of the story "${text.plan?.logline || text.book.title}", looking ahead with excitement.`
    : text.coverBrief;
  const look = big ? text.plan?.look || '' : text.look;
  const art = await drawBook(ctx, { input, briefs, coverBrief, look, only: [0] });

  await step.do('finish', QUICK_STEP, async () => {
    let result;
    if (big) {
      const book = text.book;
      heroBlocks.forEach((b, i) => { b.hero = true; if (art.scenes[i]) b.src = art.scenes[i]; });
      book.preview = true;
      if (art.cover) book.cover = art.cover;
      if (art.sheet) book.sheet = art.sheet; // для дорисовки после оплаты и бесплатной перерисовки
      const provider = Object.entries(book.meta?.providers || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      result = { book, source: text.template ? 'template' : book.meta?.source || 'ai', provider, model: null };
    } else {
      result = { ...text, preview: true };
      art.scenes.forEach((src, i) => { if (src) result.pages[i].heroImage = src; });
      if (art.cover) result.cover = art.cover;
      if (art.sheet) result.sheet = art.sheet; // нужен для бесплатной перерисовки: фото к тому времени уже удалено
    }
    await store.updateJob(id, (job) => {
      if (job.status === 'completed') return; // уже отдали запасную книгу (см. api.js) — не подменяем её
      job.status = 'completed';
      job.result = result;
      job.finishedAt = Date.now();
      job.progress = '';
    });
  });
}

// ---------------------------------------------------------------- после оплаты

async function completeFlow(ctx) {
  const { store, id, step } = ctx;
  const todo = await step.do('complete-start', QUICK_STEP, async () => {
    const job = await store.getJob(id);
    const target = job.result.book || job.result;
    const images = bookImages(job.result);
    return {
      input: job.input,
      briefs: images.map((im) => im.brief),
      srcs: images.map((im) => im.src),
      missing: images.map((im, i) => (isDrawn(im.src) ? -1 : i)).filter((i) => i >= 0),
      coverBrief: target.cover ? '' : target.coverBrief || `The child at the heart of the story "${target.title}", looking ahead with excitement.`,
      look: target.look || '',
      sheet: target.sheet || null
    };
  });

  // фото могли уже удалиться (истёк срок) — тогда рисуем по листу персонажа, он держит и лицо, и одежду
  const art = await drawBook(ctx, { input: todo.input, briefs: todo.briefs, coverBrief: todo.coverBrief, look: todo.look, only: todo.missing, sheet: todo.sheet });
  const srcs = todo.srcs.map((src, i) => art.scenes[i] || src);
  const coloring = todo.input.coloring ? await drawColoring(ctx, srcs.filter(isDrawn)) : [];

  await step.do('complete-finish', QUICK_STEP, async () => {
    await store.updateJob(id, (job) => {
      const target = job.result.book || job.result;
      bookImages(job.result).forEach((im, i) => { if (art.scenes[i]) im.set(art.scenes[i]); });
      if (art.cover) target.cover = art.cover;
      // «Большая история»: иллюстрация так и не получилась — убираем её, фоновых сцен в книге клиента нет
      if (job.result.book) for (const ch of job.result.book.chapters) ch.blocks = ch.blocks.filter((b) => b.t !== 'image' || isDrawn(b.src));
      if (coloring.length) target.coloring = coloring;
      delete target.preview;
      job.finishing = false;
      job.progress = '';
    });
    await store.removePhotos(id); // книга дорисована — фото больше не нужны
  });
}

