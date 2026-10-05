// Создание книги по шагам (Cloudflare Workflow). На бесплатном тарифе у каждого шага свои 10 мс процессора,
// а ожидание ИИ в них не входит. Поэтому книга режется на шаги: текст (или план и каждая глава),
// лист персонажа, обложка, каждая иллюстрация, каждая страница раскраски. Результат шага Cloudflare
// запоминает: если что-то упадёт, повторится только этот шаг.
//
// step — объект Workflow (step.do(name, config, fn)); в тестах — простая замена, которая сразу вызывает fn.
//
// mode 'preview' — бесплатное превью: весь текст + лист персонажа, обложка и первая иллюстрация.
// mode 'complete' — после оплаты: остальные иллюстрации и раскраска, потом фото удаляются, потом озвучка (voice.js)
// и песня (song.js).
// mode 'voice' — переозвучка после правки текста (только изменившиеся главы).

import { generateStory, describeProviders } from '../server/lib/story.js';
import { createHealth } from '../server/lib/providers.js';
import { writePlan, writeChapter, chapterContext, assembleBigBook, templateBook } from '../server/lib/bigstory.js';
import { dedicationFor, shortDedication } from '../server/lib/booktext.js';
import template from '../js/story-template.js';
import { createStore } from './store.js';
import { drawImage, coverTitlePlace, artOff, ART_OFF_MESSAGE } from './art.js';
import { isDrawn, bookImages } from './view.js';
import { voiceFlow } from './voice.js';
import { proofreadAnswers } from './proofread.js';
import { describeFace } from './face.js';
import { songFlow } from './song.js';

const { normalizeInput } = template;

// время на текст: шаг Workflow — до 10 минут (TEXT_STEP), GPT-5.5 на главу — до пары минут
const STORY_TIME = { deadlineMs: 240_000, attemptTimeoutMs: 120_000 };
const BIG_TIME = { stepDeadlineMs: 270_000, attemptTimeoutMs: 150_000 };
const TEXT_STEP = { retries: { limit: 1, delay: '10 seconds', backoff: 'constant' }, timeout: '10 minutes' };
const IMAGE_STEP = { retries: { limit: 1, delay: '10 seconds', backoff: 'constant' }, timeout: '15 minutes' };
const QUICK_STEP = { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' }, timeout: '1 minute' };
const CONCURRENCY = 3;
const MAX_COLORING = 3; // решение владелицы 01.10: раскраска — 3 страницы (сайт обещает ровно 3)

/** n элементов, равномерно разнесённых по списку (первый и последний — всегда), без повторов. */
export function spreadPick(items, n) {
  if (items.length <= n) return items.slice();
  if (n === 1) return [items[0]];
  return Array.from({ length: n }, (_, i) => items[Math.round(i * (items.length - 1) / (n - 1))]);
}

export async function runBook(env, { id, mode }, step, { log = console.warn } = {}) {
  const store = createStore(env.BUCKET);
  const progress = (text) => store.updateJob(id, (job) => { job.progress = text; if (job.status === 'queued') { job.status = 'processing'; job.startedAt = Date.now(); } });
  const ctx = { env, store, id, step, log, progress };
  if (mode === 'voice') return voiceFlow(ctx);
  return mode === 'complete' ? completeFlow(ctx) : previewFlow(ctx);
}

// ---------------------------------------------------------------- рисование

/**
 * Иллюстрации книги по шагам: лист персонажа (если его ещё нет), потом обложка и сцены по три одновременно,
 * вторая попытка для не получившихся. Возвращает адреса: { sheet, cover, scenes: [src|null] }.
 */
async function drawBook(ctx, { input, briefs, coverBrief, look, face = '', only = null, sheet = null, familySheet = null }) {
  const { env, store, id, step, log, progress } = ctx;
  const style = { styleLabel: input.style, eyes: normalizeInput(input).eyes, look, face };
  // родные по фото: их лист прикладывается к сценам (к листу ребёнка и обложке — нет: на обложке только ребёнок)
  const family = familySheet ? input.family || [] : [];
  const wanted = briefs.map((_, i) => !only || only.includes(i));
  const total = wanted.filter(Boolean).length + (coverBrief ? 1 : 0) + (sheet ? 0 : 1);
  let started = 0;

  const draw = (name, kind, brief) => step.do(name, IMAGE_STEP, async () => {
    started += 1;
    // в превью всего 3 картинки (лист героя, обложка, первая иллюстрация) — называем, что именно рисуем, чтобы «из 3» не путало
    const what = kind === 'sheet' ? 'лист героя по фото' : kind === 'cover' ? 'обложку' : 'иллюстрацию с вашим ребёнком';
    await progress(`Рисуем ${what} (картинка ${Math.min(started, total)} из ${total})…`);
    const withFamily = kind === 'scene' && family.length > 0;
    const [refs, sheetImage, familyImage] = await Promise.all([
      store.loadPhotos(id),
      kind === 'sheet' ? null : store.loadImage(sheet),
      withFamily ? store.loadImage(familySheet) : null
    ]);
    const image = await drawImage(env, { kind, refs, sheet: sheetImage, family: familyImage ? family : [], familySheet: familyImage, brief, ...style, log });
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

/**
 * Лист родных: все родные по их фото, в стиле книги. Рисуется один раз, после оплаты.
 * null — фото родных уже нет (истёк срок) или не нарисовалось: тогда на картинках остаётся только ребёнок.
 */
async function drawFamilySheet(ctx, input) {
  const { env, store, id, step, log, progress } = ctx;
  const run = (name) => step.do(name, IMAGE_STEP, async () => {
    await progress('Рисуем родных по фото…');
    const refs = await store.loadPhotos(id, { family: true });
    if (!refs.length) return null;
    const image = await drawImage(env, { kind: 'family', refs, family: input.family, styleLabel: input.style, log });
    return image ? store.putImage(id, name, image) : null;
  });
  return (await run('family-sheet')) || run('family-sheet-retry');
}

/** Раскраска: контурные версии готовых иллюстраций — MAX_COLORING штук из начала, середины и конца книги. */
async function drawColoring(ctx, sources) {
  const { env, store, id, step, log, progress } = ctx;
  const list = spreadPick(sources.filter(Boolean), MAX_COLORING);
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

// сколько глав «Большой истории» пишется до оплаты (видна в превью тоже одна — PREVIEW_CHAPTERS в view.js)
const PREVIEW_CHAPTERS_WRITTEN = 1;

/** Главы плана по порядку до upto (не включая), продолжая уже написанные done. Каждая — свой шаг Workflow. */
async function writeChapters(ctx, input, plan, done, upto, meta) {
  const { step, log, progress } = ctx;
  const chapters = [...done];
  for (let i = chapters.length; i < Math.min(upto, plan.chapters.length); i++) {
    const r = await step.do(`chapter-${i + 1}`, TEXT_STEP, async () => {
      await progress(`Пишем главу ${i + 1} из ${plan.chapters.length}: «${plan.chapters[i].title}»`);
      const { summaries, tail } = chapterContext(plan, chapters);
      return writeChapter(input, plan, i, summaries, tail, { log, ...BIG_TIME });
    });
    if (r.provider) meta.providers[r.provider] = (meta.providers[r.provider] || 0) + 1;
    if (r.kind === 'soft') meta.softChapters.push(i + 1);
    if (r.kind === 'fallback') meta.fallbackChapters.push(i + 1);
    chapters.push(r.chapter);
  }
  if (chapters.length === plan.chapters.length && meta.fallbackChapters.length === plan.chapters.length) meta.source = 'template';
  return chapters;
}

async function previewFlow(ctx) {
  const { store, id, step, log, progress } = ctx;
  const raw = await step.do('start', QUICK_STEP, async () => (await store.getJob(id)).input);
  // опечатки родителей — до текста книги: в посвящение и подпись слова попадают дословно (proofread.js)
  const input = await step.do('proofread', QUICK_STEP, async () => {
    const fixed = await proofreadAnswers(ctx.env, raw, { log });
    if (fixed !== raw) await store.updateJob(id, (job) => { job.inputRaw = job.inputRaw || job.input; job.input = fixed; });
    return fixed;
  });
  const big = input.tariff === 'big';

  // текст: фото в генераторы текста не передаём — картинки рисуются отдельными шагами ниже
  let text;
  if (!big) {
    text = await step.do('story', TEXT_STEP, async () => {
      await progress('Пишем историю…');
      // в Workflow нет 55-секундного предела старого сервера: до шаблона даём ИИ до 4 минут (шаг — до 10 минут);
      // GPT-5.5 пишет «Сказку» ≈ 50 с, поэтому на одну попытку — до 2 минут
      const story = await generateStory(input, { log, ...STORY_TIME }); // текст + описания иллюстраций (heroBrief, coverBrief)
      if (story.source !== 'template' || !describeProviders().length) return story;
      // все сервисы были заняты (05.10 так вышло у Gemini) — шаблон читается как пересказ анкеты, поэтому ещё одна попытка
      // через 20 с, с чистой памятью о сбоях (иначе все модели ещё «в паузе» и сразу снова шаблон)
      log(`[book] ${id}: текст из шаблона — пробуем ИИ ещё раз`);
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      return generateStory(input, { log, ...STORY_TIME, health: createHealth() });
    });
  } else {
    const planned = await step.do('plan', TEXT_STEP, async () => {
      await progress('Придумываем сюжет и героев книги…');
      return writePlan(input, { log, ...BIG_TIME });
    });
    if (!planned) {
      text = await step.do('assemble', QUICK_STEP, async () => ({ template: true, book: templateBook(input) }));
    } else {
      const { plan } = planned;
      const meta = { source: 'ai', providers: { [planned.provider]: 1 }, fallbackChapters: [], softChapters: [], tookMs: 0 };
      // в превью видна только первая глава — остальные пишутся после оплаты (completeFlow): текст GPT-5.5 на всю книгу
      // ≈ 55 ₽, и платить его за каждое неоплаченное превью незачем (решение владелицы 05.10)
      const chapters = await writeChapters(ctx, input, plan, [], PREVIEW_CHAPTERS_WRITTEN, meta);
      // отдельным шагом: код между шагами Workflow повторяется при каждом возобновлении, а книга должна быть одна и та же
      text = await step.do('assemble', QUICK_STEP, async () => ({ plan, book: assembleBigBook(input, plan, chapters, meta), draft: { plan, chapters, meta } }));
    }
  }

  // иллюстрации превью: лист персонажа, обложка и первая сцена
  const heroBlocks = big ? text.book.chapters.flatMap((ch) => ch.blocks.filter((b) => b.t === 'image')) : null;
  const briefs = big ? heroBlocks.map((b) => b.brief) : text.pages.map((p) => p.heroBrief);
  const coverBrief = big
    ? text.plan?.coverBrief || `The child at the heart of the story "${text.plan?.logline || text.book.title}", looking ahead with excitement.`
    : text.coverBrief;
  const look = big ? text.plan?.look || '' : text.look;
  // приметы ребёнка по фото — до первого рисунка (правило владелицы: главное — чтобы герой был похож)
  const face = await step.do('face', QUICK_STEP, async () => describeFace(ctx.env, await store.loadPhotos(id), { log }));
  const art = await drawBook(ctx, { input, briefs, coverBrief, look, face, only: [0] });
  const titlePlace = await coverPlaceStep(ctx, art.cover);

  // ни одной картинки, потому что в OpenAI кончились деньги: книга без ребёнка — не наш продукт, отдаём сообщение
  const noArt = await step.do('art-check', QUICK_STEP, async () => !art.sheet && !art.cover && !art.scenes.some(Boolean) && Boolean(await artOff(ctx.env)));
  if (noArt) {
    await step.do('finish', QUICK_STEP, async () => {
      await store.updateJob(id, (job) => {
        if (job.status === 'completed') return;
        job.status = 'failed';
        job.error = ART_OFF_MESSAGE;
        job.finishedAt = Date.now();
        job.progress = '';
      });
    });
    return;
  }

  await step.do('finish', QUICK_STEP, async () => {
    let result;
    if (big) {
      const book = text.book;
      heroBlocks.forEach((b, i) => { b.hero = true; if (art.scenes[i]) b.src = art.scenes[i]; });
      book.preview = true;
      if (art.cover) { book.cover = art.cover; book.coverFace = true; book.coverTitle = { place: titlePlace }; } // обложка по COVER_COMPOSITION с 01.10: лицо крупно по центру
      if (art.sheet) book.sheet = art.sheet; // для дорисовки после оплаты и бесплатной перерисовки
      if (face) book.face = face;
      const provider = Object.entries(book.meta?.providers || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      result = { book, source: text.template ? 'template' : book.meta?.source || 'ai', provider, model: null };
      if (text.draft && text.draft.chapters.length < text.draft.plan.chapters.length) result.bigDraft = text.draft; // главы 2–6 — после оплаты
    } else {
      result = { ...text, preview: true };
      // посвящение есть всегда: своё от родителей или наши тёплые слова (так обещает анкета), с подписью «От кого»
      result.dedication = dedicationFor(input, shortDedication(input));
      art.scenes.forEach((src, i) => { if (src) result.pages[i].heroImage = src; });
      if (art.cover) { result.cover = art.cover; result.coverFace = true; result.coverTitle = { place: titlePlace }; }
      if (art.sheet) result.sheet = art.sheet; // нужен для бесплатной перерисовки: фото к тому времени уже удалено
      if (face) result.face = face;
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

/**
 * «Большая история» после оплаты: дописываем главы 2–6 по плану из превью и собираем книгу целиком. Первая глава
 * (её текст и иллюстрация), обложка и лист персонажа остаются из превью; новые иллюстрации дорисует completeFlow.
 */
async function finishBigText(ctx) {
  const { store, id, step } = ctx;
  const draft = await step.do('draft', QUICK_STEP, async () => {
    const job = await store.getJob(id);
    return job.result?.bigDraft ? { input: job.input, ...job.result.bigDraft } : null;
  });
  if (!draft) return;
  const meta = { ...draft.meta, providers: { ...draft.meta.providers }, fallbackChapters: [...draft.meta.fallbackChapters], softChapters: [...draft.meta.softChapters] };
  const chapters = await writeChapters(ctx, draft.input, draft.plan, draft.chapters, draft.plan.chapters.length, meta);
  await step.do('assemble-full', QUICK_STEP, async () => {
    const full = assembleBigBook(draft.input, draft.plan, chapters, meta);
    await store.updateJob(id, (job) => {
      if (!job.result?.bigDraft) return;
      const prev = job.result.book;
      // первая глава — из превью: там уже стоят нарисованные иллюстрации
      full.chapters[0] = prev.chapters[0];
      for (const key of ['cover', 'coverFace', 'coverTitle', 'sheet', 'preview']) if (prev[key] !== undefined) full[key] = prev[key];
      job.result.book = full;
      delete job.result.bigDraft;
    });
  });
}

/** Название на обложке — сверху или снизу: смотрит Gemini (см. coverTitlePlace в art.js). Отдельный шаг — свои лимиты CPU. */
async function coverPlaceStep(ctx, cover) {
  if (!cover) return 'top';
  const { env, store, step } = ctx;
  return step.do('cover-title', QUICK_STEP, async () => {
    const image = await store.loadImage(cover).catch(() => null);
    return coverTitlePlace(env, image);
  });
}

// ---------------------------------------------------------------- после оплаты

async function completeFlow(ctx) {
  const { store, id, step } = ctx;
  await finishBigText(ctx);
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
      face: target.face || '',
      sheet: target.sheet || null,
      familySheet: target.familySheet || null
    };
  });

  // родные по фото: сначала их лист, потом ВСЕ сцены по нему — и те, что были в превью (там из людей был только ребёнок).
  // Обложку не трогаем: на ней только ребёнок.
  let familySheet = todo.familySheet;
  if (todo.input.family?.length && !familySheet) familySheet = await drawFamilySheet(ctx, todo.input);
  const only = familySheet && !todo.familySheet ? todo.briefs.map((_, i) => i) : todo.missing;

  // фото могли уже удалиться (истёк срок) — тогда рисуем по листу персонажа, он держит и лицо, и одежду
  const art = await drawBook(ctx, { input: todo.input, briefs: todo.briefs, coverBrief: todo.coverBrief, look: todo.look, face: todo.face, only, sheet: todo.sheet, familySheet });
  const srcs = todo.srcs.map((src, i) => art.scenes[i] || src);
  const titlePlace = art.cover ? await coverPlaceStep(ctx, art.cover) : null;
  const coloring = todo.input.coloring ? await drawColoring(ctx, srcs.filter(isDrawn)) : [];

  await step.do('complete-finish', QUICK_STEP, async () => {
    await store.updateJob(id, (job) => {
      const target = job.result.book || job.result;
      bookImages(job.result).forEach((im, i) => { if (art.scenes[i]) im.set(art.scenes[i]); });
      if (familySheet) target.familySheet = familySheet; // для бесплатной перерисовки: фото родных к тому времени удалены
      if (art.cover) { target.cover = art.cover; target.coverFace = true; target.coverTitle = { place: titlePlace || 'top' }; }
      // «Большая история»: иллюстрация так и не получилась — убираем её, фоновых сцен в книге клиента нет
      if (job.result.book) for (const ch of job.result.book.chapters) ch.blocks = ch.blocks.filter((b) => b.t !== 'image' || isDrawn(b.src));
      if (coloring.length) target.coloring = coloring;
      delete target.preview;
      job.finishing = false;
      job.progress = '';
    });
    await store.removePhotos(id); // книга дорисована — фото больше не нужны
  });

  // озвучка — уже после того, как книга открыта покупателю: пока она идёт, «Слушать» читает голос устройства
  await voiceFlow(ctx);
  // песня по книге (если заказана) — последней: слова пишутся по уже готовому тексту
  await songFlow(ctx);
}

